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

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 v_texcoord;
out vec4 outColor;
uniform sampler2D u_texture;
uniform float u_opacity;
void main() {
  vec4 color = texture(u_texture, v_texcoord);
  outColor = vec4(color.rgb, color.a * u_opacity);
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
  private readonly program: WebGLProgram
  private readonly positionBuffer: WebGLBuffer
  private readonly texcoordBuffer: WebGLBuffer
  private readonly positionLoc: number
  private readonly texcoordLoc: number
  private readonly opacityLoc: WebGLUniformLocation | null
  private readonly textures = new Map<string, WebGLTexture>()
  private canvasWidth = 0
  private canvasHeight = 0

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true })
    if (!gl) throw new Error('WebGL2 unavailable')
    this.gl = gl
    this.program = createProgram(gl)
    this.positionLoc = gl.getAttribLocation(this.program, 'a_position')
    this.texcoordLoc = gl.getAttribLocation(this.program, 'a_texcoord')
    this.opacityLoc = gl.getUniformLocation(this.program, 'u_opacity')

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
  }

  resize(width: number, height: number): void {
    this.canvasWidth = width
    this.canvasHeight = height
    const canvas = this.gl.canvas
    canvas.width = width
    canvas.height = height
    this.gl.viewport(0, 0, width, height)
  }

  clear(r: number, g: number, b: number, a = 1): void {
    const gl = this.gl
    gl.clearColor(r, g, b, a)
    gl.clear(gl.COLOR_BUFFER_BIT)
  }

  private getTexture(slotKey: string): WebGLTexture {
    let texture = this.textures.get(slotKey)
    if (!texture) {
      const created = this.gl.createTexture()
      if (!created) throw new Error('Failed to create texture')
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

  /** Uploads `source` into the quad `slotKey` and draws it at `opacity`, quad given in canvas pixel space. */
  drawLayer(slotKey: string, source: TexImageSource, quad: Quad, opacity: number): void {
    const gl = this.gl
    const texture = this.getTexture(slotKey)
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
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  /** Drops a cached texture — call when a clip leaves the visible set so its GPU memory isn't held forever. */
  releaseSlot(slotKey: string): void {
    const texture = this.textures.get(slotKey)
    if (!texture) return
    this.gl.deleteTexture(texture)
    this.textures.delete(slotKey)
  }

  destroy(): void {
    for (const key of [...this.textures.keys()]) this.releaseSlot(key)
    this.gl.deleteProgram(this.program)
    this.gl.deleteBuffer(this.positionBuffer)
    this.gl.deleteBuffer(this.texcoordBuffer)
  }
}
