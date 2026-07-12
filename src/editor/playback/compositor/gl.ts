import { NEUTRAL_ADJUSTMENTS, type Adjustments } from './adjustments'
import type { Quad } from './transform2d'
import { pxToNdc } from './transform2d'

const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
in vec2 a_texcoord;
out vec2 v_texcoord;
void main() {
  v_texcoord = a_texcoord;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

// LUT strip texture layout: width = LUT_SIZE*LUT_SIZE, height = LUT_SIZE.
// Slice `b` (0..LUT_SIZE-1) occupies columns [b*LUT_SIZE, (b+1)*LUT_SIZE); within
// a slice, column = red index, row = green index (see gen_luts.py).
const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 v_texcoord;
out vec4 outColor;
uniform sampler2D u_texture;
uniform sampler2D u_lut;
uniform float u_lutIntensity;
uniform float u_opacity;
uniform float u_brightness;
uniform float u_contrast;
uniform float u_saturation;
uniform float u_temperature;
uniform float u_vignette;

const float LUT_SIZE = 8.0;

vec3 applyLut(vec3 color) {
  vec3 c = clamp(color, 0.0, 1.0);
  float blueScaled = c.b * (LUT_SIZE - 1.0);
  float slice0 = floor(blueScaled);
  float slice1 = min(slice0 + 1.0, LUT_SIZE - 1.0);
  float sliceFrac = blueScaled - slice0;

  vec2 cellCenter = (c.rg * (LUT_SIZE - 1.0) + 0.5) / LUT_SIZE;
  vec2 uv0 = vec2((slice0 + cellCenter.x) / LUT_SIZE, cellCenter.y);
  vec2 uv1 = vec2((slice1 + cellCenter.x) / LUT_SIZE, cellCenter.y);

  vec3 graded = mix(texture(u_lut, uv0).rgb, texture(u_lut, uv1).rgb, sliceFrac);
  return mix(color, graded, u_lutIntensity);
}

void main() {
  vec4 texel = texture(u_texture, v_texcoord);
  vec3 color = texel.rgb;

  color += u_brightness;
  color = (color - 0.5) * u_contrast + 0.5;
  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(vec3(luma), color, u_saturation);
  color.r += u_temperature * 0.15;
  color.b -= u_temperature * 0.15;

  if (u_lutIntensity > 0.0) color = applyLut(color);

  vec2 centered = v_texcoord - 0.5;
  float vignette = 1.0 - u_vignette * smoothstep(0.2, 0.8, length(centered));
  color *= vignette;

  outColor = vec4(clamp(color, 0.0, 1.0), texel.a * u_opacity);
}
`

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Failed to create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`Shader compile error: ${log}`)
  }
  return shader
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
  const program = gl.createProgram()
  if (!program) throw new Error('Failed to create program')
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program)
    gl.deleteProgram(program)
    throw new Error(`Program link error: ${log}`)
  }
  return program
}

/**
 * Draws pre-transformed quads (already resolved to canvas-pixel corners by
 * `transform2d.ts`) bottom-track-first onto a WebGL2 canvas. One GPU texture
 * per layer "slot" is reused across frames — callers key a slot per clip so
 * video doesn't reallocate a texture every draw, only re-upload pixels.
 */
export class Compositor {
  private readonly gl: WebGL2RenderingContext
  private readonly canvas: HTMLCanvasElement
  private program!: WebGLProgram
  private positionBuffer!: WebGLBuffer
  private texcoordBuffer!: WebGLBuffer
  private positionLoc!: number
  private texcoordLoc!: number
  private opacityLoc!: WebGLUniformLocation | null
  private brightnessLoc!: WebGLUniformLocation | null
  private contrastLoc!: WebGLUniformLocation | null
  private saturationLoc!: WebGLUniformLocation | null
  private temperatureLoc!: WebGLUniformLocation | null
  private vignetteLoc!: WebGLUniformLocation | null
  private lutLoc!: WebGLUniformLocation | null
  private lutIntensityLoc!: WebGLUniformLocation | null
  private readonly textures = new Map<string, WebGLTexture>()
  // Separate from `textures`: LUT strips are static built-in assets shared
  // across every clip, keyed by lutId and uploaded once rather than re-sent
  // to the GPU on every draw like per-clip video frames are.
  private readonly lutTextures = new Map<string, WebGLTexture>()
  private canvasWidth = 0
  private canvasHeight = 0
  private contextLost = false
  private readonly onContextLost: (() => void) | undefined
  private readonly onContextRestored: (() => void) | undefined

  constructor(canvas: HTMLCanvasElement, callbacks: { onContextLost?: () => void; onContextRestored?: () => void } = {}) {
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true })
    if (!gl) throw new Error('WebGL2 unavailable')
    this.gl = gl
    this.canvas = canvas
    this.onContextLost = callbacks.onContextLost
    this.onContextRestored = callbacks.onContextRestored
    this.setupGLResources()

    // iPad backgrounding/memory pressure can invalidate the GL context at any
    // time (ARCHITECTURE §5) — recreate every GPU resource on restore rather
    // than leaving the compositor permanently broken. The texture cache is
    // just cleared, not explicitly deleted: the lost context already
    // invalidated those handles, so freeing them is a no-op the spec says to
    // skip.
    canvas.addEventListener('webglcontextlost', this.handleContextLost)
    canvas.addEventListener('webglcontextrestored', this.handleContextRestored)
  }

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault()
    this.contextLost = true
    this.textures.clear()
    this.lutTextures.clear()
    this.onContextLost?.()
  }

  private readonly handleContextRestored = (): void => {
    this.setupGLResources()
    this.contextLost = false
    this.onContextRestored?.()
  }

  private setupGLResources(): void {
    const gl = this.gl
    this.program = createProgram(gl)
    this.positionLoc = gl.getAttribLocation(this.program, 'a_position')
    this.texcoordLoc = gl.getAttribLocation(this.program, 'a_texcoord')
    this.opacityLoc = gl.getUniformLocation(this.program, 'u_opacity')
    this.brightnessLoc = gl.getUniformLocation(this.program, 'u_brightness')
    this.contrastLoc = gl.getUniformLocation(this.program, 'u_contrast')
    this.saturationLoc = gl.getUniformLocation(this.program, 'u_saturation')
    this.temperatureLoc = gl.getUniformLocation(this.program, 'u_temperature')
    this.vignetteLoc = gl.getUniformLocation(this.program, 'u_vignette')
    this.lutLoc = gl.getUniformLocation(this.program, 'u_lut')
    this.lutIntensityLoc = gl.getUniformLocation(this.program, 'u_lutIntensity')

    const positionBuffer = gl.createBuffer()
    const texcoordBuffer = gl.createBuffer()
    if (!positionBuffer || !texcoordBuffer) throw new Error('Failed to create buffers')
    this.positionBuffer = positionBuffer
    this.texcoordBuffer = texcoordBuffer

    gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer)
    // eslint-disable-next-line @typescript-eslint/no-magic-numbers -- standard unit-quad texcoords for two triangles (TL,TR,BR / TL,BR,BL)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]), gl.STATIC_DRAW)

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    if (this.canvasWidth > 0 && this.canvasHeight > 0) gl.viewport(0, 0, this.canvasWidth, this.canvasHeight)
  }

  /** True between a `webglcontextlost` event and the matching `webglcontextrestored`. */
  isContextLost(): boolean {
    return this.contextLost
  }

  resize(width: number, height: number): void {
    this.canvasWidth = width
    this.canvasHeight = height
    this.canvas.width = width
    this.canvas.height = height
    if (!this.contextLost) this.gl.viewport(0, 0, width, height)
  }

  clear(r: number, g: number, b: number, a = 1): void {
    const gl = this.gl
    gl.clearColor(r, g, b, a)
    gl.clear(gl.COLOR_BUFFER_BIT)
  }

  private getTexture(slotKey: string): WebGLTexture | undefined {
    let texture = this.textures.get(slotKey)
    if (!texture) {
      const created = this.gl.createTexture()
      // Context lost — every GL call is a silent no-op per spec, including
      // this one returning null instead of throwing. Skip the draw; the
      // frame after `webglcontextrestored` fixes it, no error to surface.
      if (!created) return undefined
      texture = created
      this.gl.bindTexture(this.gl.TEXTURE_2D, texture)
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE)
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE)
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR)
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR)
      this.textures.set(slotKey, texture)
    }
    return texture
  }

  /** Uploads a LUT strip texture once per id — built-in assets never change, so re-uploading every frame would be wasted GPU traffic. */
  private ensureLutTexture(lutId: string, bitmap: TexImageSource): WebGLTexture | undefined {
    const gl = this.gl
    let texture = this.lutTextures.get(lutId)
    if (texture) return texture
    const created = gl.createTexture()
    if (!created) return undefined
    texture = created
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    // NEAREST, not LINEAR — the strip packs unrelated color cells edge to
    // edge, so linear filtering would blend across cell/slice boundaries.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.activeTexture(gl.TEXTURE0)
    this.lutTextures.set(lutId, texture)
    return texture
  }

  /** Uploads `source` into the quad `slotKey` and draws it at `opacity`, quad given in canvas pixel space. */
  drawLayer(
    slotKey: string,
    source: TexImageSource,
    quad: Quad,
    opacity: number,
    adjustments: Adjustments = NEUTRAL_ADJUSTMENTS,
    lut?: { id: string; bitmap: TexImageSource; intensity: number },
  ): void {
    if (this.contextLost) return
    const gl = this.gl
    const texture = this.getTexture(slotKey)
    if (!texture) return
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)

    const ndc = quad.map((p) => pxToNdc(p, this.canvasWidth, this.canvasHeight))
    // eslint-disable-next-line @typescript-eslint/no-magic-numbers -- two triangles covering the quad: TL,TR,BR then TL,BR,BL
    const positions = new Float32Array([
      ndc[0].x, ndc[0].y, ndc[1].x, ndc[1].y, ndc[2].x, ndc[2].y,
      ndc[0].x, ndc[0].y, ndc[2].x, ndc[2].y, ndc[3].x, ndc[3].y,
    ])

    gl.useProgram(this.program)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(this.positionLoc)
    gl.vertexAttribPointer(this.positionLoc, 2, gl.FLOAT, false, 0, 0)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.texcoordBuffer)
    gl.enableVertexAttribArray(this.texcoordLoc)
    gl.vertexAttribPointer(this.texcoordLoc, 2, gl.FLOAT, false, 0, 0)

    gl.uniform1f(this.opacityLoc, opacity)
    gl.uniform1f(this.brightnessLoc, adjustments.brightness)
    gl.uniform1f(this.contrastLoc, adjustments.contrast)
    gl.uniform1f(this.saturationLoc, adjustments.saturation)
    gl.uniform1f(this.temperatureLoc, adjustments.temperature)
    gl.uniform1f(this.vignetteLoc, adjustments.vignette)

    const lutTexture = lut ? this.ensureLutTexture(lut.id, lut.bitmap) : undefined
    gl.uniform1i(this.lutLoc, 1)
    gl.uniform1f(this.lutIntensityLoc, lutTexture && lut ? lut.intensity : 0)
    if (lutTexture) {
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, lutTexture)
      gl.activeTexture(gl.TEXTURE0)
    }

    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  /** Restricts subsequent draws to a canvas-pixel-space rect (top-left origin) — used for the wipe transition's reveal. */
  setScissor(x: number, y: number, width: number, height: number): void {
    const gl = this.gl
    gl.enable(gl.SCISSOR_TEST)
    // WebGL's scissor origin is bottom-left; flip from the top-left pixel space the rest of this module uses.
    gl.scissor(Math.round(x), Math.round(this.canvasHeight - y - height), Math.round(width), Math.round(height))
  }

  clearScissor(): void {
    this.gl.disable(this.gl.SCISSOR_TEST)
  }

  /** Drops a cached texture — call when a clip leaves the visible set so its GPU memory isn't held forever. */
  releaseSlot(slotKey: string): void {
    const texture = this.textures.get(slotKey)
    if (!texture) return
    this.gl.deleteTexture(texture)
    this.textures.delete(slotKey)
  }

  destroy(): void {
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost)
    this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored)
    for (const key of [...this.textures.keys()]) this.releaseSlot(key)
    for (const texture of this.lutTextures.values()) this.gl.deleteTexture(texture)
    this.lutTextures.clear()
    this.gl.deleteProgram(this.program)
    this.gl.deleteBuffer(this.positionBuffer)
    this.gl.deleteBuffer(this.texcoordBuffer)
  }
}
