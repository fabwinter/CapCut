import type { TextPayload } from '#/editor/doc/schema'

/**
 * Rasterizes a text clip's static style (content/font/color/stroke/align) to
 * a canvas the same size as the project frame — positioning, scale, and
 * in/out animation are layered on afterward by the same transform pipeline
 * every other clip goes through (see `transform2d.ts`), so a text clip is
 * just a clip whose "source frame" happens to be this canvas.
 */
export function rasterizeText(
  text: TextPayload,
  canvasWidth: number,
  canvasHeight: number,
): OffscreenCanvas {
  const canvas = new OffscreenCanvas(canvasWidth, canvasHeight)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context unavailable')

  ctx.clearRect(0, 0, canvasWidth, canvasHeight)
  ctx.font = `${text.fontSize}px ${text.fontFamily}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = text.align

  const x = text.align === 'left' ? canvasWidth * 0.1 : text.align === 'right' ? canvasWidth * 0.9 : canvasWidth / 2
  const y = canvasHeight / 2
  const lines = text.content.split('\n')
  const lineHeight = text.fontSize * 1.2
  const startY = y - ((lines.length - 1) * lineHeight) / 2

  for (let i = 0; i < lines.length; i++) {
    const lineY = startY + i * lineHeight
    if (text.strokeColor && text.strokeWidth > 0) {
      ctx.lineWidth = text.strokeWidth
      ctx.strokeStyle = text.strokeColor
      ctx.strokeText(lines[i], x, lineY)
    }
    ctx.fillStyle = text.color
    ctx.fillText(lines[i], x, lineY)
  }

  return canvas
}
