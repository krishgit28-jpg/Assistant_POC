import type { AnalyzerResult, ContextAnalyzer } from '../analyzerTypes.js'
import type { MCPPayload } from '../types.js'

/**
 * Parses a hex or rgb() color and returns its perceived luminance (0-255).
 * Falls back to 255 (white) if the color cannot be parsed.
 */
export function getLuminance(colorStr?: string): number {
  if (!colorStr) return 255

  let r = 255, g = 255, b = 255

  const hexMatch = colorStr.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i)
  if (hexMatch) {
    r = parseInt(hexMatch[1], 16)
    g = parseInt(hexMatch[2], 16)
    b = parseInt(hexMatch[3], 16)
  }
  else {
    const hexMatchShort = colorStr.match(/^#?([a-f\d])([a-f\d])([a-f\d])$/i)
    if (hexMatchShort) {
      r = parseInt(hexMatchShort[1] + hexMatchShort[1], 16)
      g = parseInt(hexMatchShort[2] + hexMatchShort[2], 16)
      b = parseInt(hexMatchShort[3] + hexMatchShort[3], 16)
    }
    else {
      const rgbMatch = colorStr.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/i)
      if (rgbMatch) {
        r = parseInt(rgbMatch[1], 10)
        g = parseInt(rgbMatch[2], 10)
        b = parseInt(rgbMatch[3], 10)
      }
    }
  }

  return 0.299 * r + 0.587 * g + 0.114 * b
}

export interface ContrastAnalyzerOptions {
  /** Luminance difference (out of 255) below which text is flagged. Default 60. */
  minLuminanceDiff?: number
  /** Assumed slide background; the payload does not carry it. Default white. */
  backgroundColor?: string
}

/** Flags text whose color is too close to the (assumed) slide background. */
export class ContrastAnalyzer implements ContextAnalyzer {
  readonly id = 'heuristic.contrast'
  private readonly minDiff: number
  private readonly background: string

  constructor(options: ContrastAnalyzerOptions = {}) {
    this.minDiff = options.minLuminanceDiff ?? 60
    this.background = options.backgroundColor ?? '#ffffff'
  }

  analyze(payload: MCPPayload): AnalyzerResult {
    const bgLuminance = getLuminance(this.background)
    const issues: string[] = []

    for (const el of payload.currentSelection || []) {
      if (el.type === 'text' && el.defaultColor) {
        const diff = Math.abs(bgLuminance - getLuminance(el.defaultColor))
        if (diff < this.minDiff) {
          issues.push(`Text element ${el.id} has low contrast against a white background. (Text: ${el.defaultColor})`)
        }
      }
    }

    return { contrastIssues: issues }
  }
}
