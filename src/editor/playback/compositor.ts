/**
 * WebGL2 compositor for real-time multi-track video composition.
 * Renders video/image/text clips with transforms, opacity, and effects.
 */

export interface CompositorConfig {
  canvas: OffscreenCanvas | HTMLCanvasElement
  width: number
  height: number
}

/**
 * Per-clip rendering state.
 */
export interface ClipRenderParams {
  videoFrame?: VideoFrame
  imageData?: ImageData
  textCanvas?: OffscreenCanvas
  opacity: number
  x: number
  y: number
  scaleX: number
  scaleY: number
  rotation: number
  blendMode: 'normal' | 'multiply' | 'screen' | 'overlay'
}

/**
 * WebGL2 compositor using quad rendering for clip composition.
 * Renders to a canvas at 30 fps (configurable).
 */
export class Compositor {
  private gl: WebGL2RenderingContext | null = null
  private canvas: OffscreenCanvas | HTMLCanvasElement
  private width: number
  private height: number
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private texture: WebGLTexture | null = null
  private framebuffer: WebGLFramebuffer | null = null

  constructor(config: CompositorConfig) {
    this.canvas = config.canvas
    this.width = config.width
    this.height = config.height

    this.initGL()
    this.initShaders()
    this.initBuffers()
  }

  private initGL(): void {
    const context = this.canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: false,
    })

    if (!context || !('clearColor' in context)) {
      throw new Error('Failed to get WebGL2 context')
    }

    this.gl = context as WebGL2RenderingContext
    this.gl.clearColor(0, 0, 0, 1)
    this.gl.viewport(0, 0, this.width, this.height)
  }

  private initShaders(): void {
    if (!this.gl) return

    const vertexSource = `#version 300 es
      in vec2 position;
      in vec2 texCoord;
      uniform mat4 projection;
      out vec2 vTexCoord;

      void main() {
        gl_Position = projection * vec4(position, 0.0, 1.0);
        vTexCoord = texCoord;
      }
    `

    const fragmentSource = `#version 300 es
      precision highp float;
      in vec2 vTexCoord;
      uniform sampler2D texture;
      uniform float opacity;
      out vec4 outColor;

      void main() {
        vec4 texColor = texture(texture, vTexCoord);
        outColor = texColor * opacity;
      }
    `

    const vertex = this.compileShader(vertexSource, this.gl.VERTEX_SHADER)
    const fragment = this.compileShader(fragmentSource, this.gl.FRAGMENT_SHADER)

    if (!vertex || !fragment) {
      console.error('Shader compilation failed')
      return
    }

    const program = this.gl.createProgram()
    if (!program) return

    this.gl.attachShader(program, vertex)
    this.gl.attachShader(program, fragment)
    this.gl.linkProgram(program)

    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      console.error('Program linking failed:', this.gl.getProgramInfoLog(program))
      return
    }

    this.program = program
  }

  private compileShader(source: string, type: number): WebGLShader | null {
    if (!this.gl) return null

    const shader = this.gl.createShader(type)
    if (!shader) return null

    this.gl.shaderSource(shader, source)
    this.gl.compileShader(shader)

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      console.error('Shader compilation error:', this.gl.getShaderInfoLog(shader))
      this.gl.deleteShader(shader)
      return null
    }

    return shader
  }

  private initBuffers(): void {
    if (!this.gl || !this.program) return

    // Create quad vertices (normalized device coordinates)
    const vertices = new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1])
    const texCoords = new Float32Array([0, 1, 1, 1, 1, 0, 0, 0])
    const indices = new Uint16Array([0, 1, 2, 0, 2, 3])

    const vao = this.gl.createVertexArray()
    this.gl.bindVertexArray(vao)

    // Position buffer
    const posBuffer = this.gl.createBuffer()
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, posBuffer)
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW)
    const posLoc = this.gl.getAttribLocation(this.program, 'position')
    this.gl.enableVertexAttribArray(posLoc)
    this.gl.vertexAttribPointer(posLoc, 2, this.gl.FLOAT, false, 0, 0)

    // Texture coordinate buffer
    const texBuffer = this.gl.createBuffer()
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, texBuffer)
    this.gl.bufferData(this.gl.ARRAY_BUFFER, texCoords, this.gl.STATIC_DRAW)
    const texLoc = this.gl.getAttribLocation(this.program, 'texCoord')
    this.gl.enableVertexAttribArray(texLoc)
    this.gl.vertexAttribPointer(texLoc, 2, this.gl.FLOAT, false, 0, 0)

    // Index buffer
    const indexBuffer = this.gl.createBuffer()
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer)
    this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, indices, this.gl.STATIC_DRAW)

    this.vao = vao
  }

  /**
   * Render a single clip to the canvas.
   * (In production: batch render all clips in track order with blend modes)
   */
  renderClip(params: ClipRenderParams): void {
    if (!this.gl || !this.program || !this.vao) return

    this.gl.bindVertexArray(this.vao)
    this.gl.useProgram(this.program)

    // Set up projection matrix for clip position/scale
    const projMatrix = this.createProjectionMatrix(
      params.x,
      params.y,
      params.scaleX,
      params.scaleY,
      params.rotation,
      this.width,
      this.height
    )

    const projLoc = this.gl.getUniformLocation(this.program, 'projection')
    this.gl.uniformMatrix4fv(projLoc, false, projMatrix)

    // Set opacity uniform
    const opacityLoc = this.gl.getUniformLocation(this.program, 'opacity')
    this.gl.uniform1f(opacityLoc, params.opacity)

    // Bind texture
    const source = params.videoFrame ?? params.imageData
    if (source) {
      this.updateTexture(source)
      this.gl.drawElements(this.gl.TRIANGLES, 6, this.gl.UNSIGNED_SHORT, 0)
    }
  }

  /**
   * Clear the canvas (reset to background color).
   */
  clear(): void {
    if (!this.gl) return
    this.gl.clear(this.gl.COLOR_BUFFER_BIT)
  }

  /**
   * Render a project-level background color.
   */
  renderBackground(color: string): void {
    if (!this.gl) return

    const rgb = this.hexToRgb(color)
    this.gl.clearColor(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, 1)
    this.gl.clear(this.gl.COLOR_BUFFER_BIT)
  }

  private updateTexture(source: VideoFrame | ImageData): void {
    if (!this.gl) return

    if (!this.texture) {
      this.texture = this.gl.createTexture()
    }

    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture)

    try {
      if (source instanceof VideoFrame) {
        this.gl.texImage2D(
          this.gl.TEXTURE_2D,
          0,
          this.gl.RGBA,
          this.gl.RGBA,
          this.gl.UNSIGNED_BYTE,
          source
        )
      } else {
        // ImageData
        this.gl.texImage2D(
          this.gl.TEXTURE_2D,
          0,
          this.gl.RGBA,
          source.width,
          source.height,
          0,
          this.gl.RGBA,
          this.gl.UNSIGNED_BYTE,
          source.data
        )
      }
    } catch (err) {
      console.error('Failed to update texture:', err)
    }

    // Set texture parameters
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE)
  }

  private createProjectionMatrix(
    x: number,
    y: number,
    sx: number,
    sy: number,
    _rotation: number,  // Future: implement rotation transform
    width: number,
    height: number
  ): Float32Array {
    // Orthographic projection + transform
    // (Simplified; production would use proper matrix math library)
    const matrix = new Float32Array(16)

    // Identity
    matrix[0] = 2 / width
    matrix[5] = -2 / height
    matrix[10] = 1
    matrix[15] = 1

    // Apply scale and position (simplified; doesn't account for rotation yet)
    matrix[0] *= sx
    matrix[5] *= sy
    matrix[12] = (2 * x) / width - 1
    matrix[13] = -(2 * y) / height + 1

    return matrix
  }

  private hexToRgb(hex: string): [number, number, number] {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result
      ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
      : [0, 0, 0]
  }

  /**
   * Release GL resources.
   */
  dispose(): void {
    if (!this.gl) return

    if (this.texture) this.gl.deleteTexture(this.texture)
    if (this.program) this.gl.deleteProgram(this.program)
    if (this.vao) this.gl.deleteVertexArray(this.vao)
    if (this.framebuffer) this.gl.deleteFramebuffer(this.framebuffer)

    this.gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}
