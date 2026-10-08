import type { AnalyzerResult, ContextAnalyzer } from '../analyzerTypes.js'
import type { MCPPayload } from '../types.js'

export interface FontConsistencyOptions {
  maxFontFamilies?: number
  maxFontSizes?: number
}

/** Flags selections that mix too many font families or sizes. */
export class FontConsistencyAnalyzer implements ContextAnalyzer {
  readonly id = 'heuristic.fontConsistency'
  private readonly maxFamilies: number
  private readonly maxSizes: number

  constructor(options: FontConsistencyOptions = {}) {
    this.maxFamilies = options.maxFontFamilies ?? 2
    this.maxSizes = options.maxFontSizes ?? 3
  }

  analyze(payload: MCPPayload): AnalyzerResult {
    const textElements = (payload.currentSelection || []).filter(el => el.type === 'text')
    const issues: string[] = []

    if (textElements.length > 1) {
      const fontsUsed = new Set<string>()
      const sizesUsed = new Set<string>()

      for (const el of textElements) {
        if (el.defaultFontName) fontsUsed.add(el.defaultFontName)
        if (el.defaultSize) sizesUsed.add(el.defaultSize)
      }

      if (fontsUsed.size > this.maxFamilies) {
        issues.push(`Slide uses ${fontsUsed.size} different font families: ${Array.from(fontsUsed).join(', ')}. Consider reducing to 1 or 2 for consistency.`)
      }
      if (sizesUsed.size > this.maxSizes) {
        issues.push(`Slide uses ${sizesUsed.size} different font sizes. Consider standardizing them.`)
      }
    }

    return { fontConsistency: issues }
  }
}
