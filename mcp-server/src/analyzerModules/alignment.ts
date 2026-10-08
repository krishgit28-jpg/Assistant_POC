import type { AnalyzerResult, ContextAnalyzer } from '../analyzerTypes.js'
import type { MCPPayload } from '../types.js'

export interface AlignmentAnalyzerOptions {
  /** Max pixel deviation still reported as "nearly aligned". Default 5. */
  tolerancePx?: number
}

/** Flags element pairs that are *almost* (but not exactly) aligned. */
export class AlignmentAnalyzer implements ContextAnalyzer {
  readonly id = 'heuristic.alignment'
  private readonly tolerance: number

  constructor(options: AlignmentAnalyzerOptions = {}) {
    this.tolerance = options.tolerancePx ?? 5
  }

  analyze(payload: MCPPayload): AnalyzerResult {
    const elements = payload.currentSelection || []
    const issues: string[] = []
    const near = (diff: number) => diff > 0 && diff <= this.tolerance

    for (let i = 0; i < elements.length; i++) {
      const a = elements[i]

      // Check text-specific alignments
      if (a.type === 'text' && a.textAlign) {
        if (a.textAlign.length > 1) {
          issues.push(`Text element ${a.id} has mixed text alignments internally (${a.textAlign.join(', ')}). Consider standardizing to a single alignment.`)
        }
      }

      for (let j = i + 1; j < elements.length; j++) {
        const b = elements[j]

        const leftDiff = Math.abs(a.left - b.left)
        if (near(leftDiff)) {
          issues.push(`Elements ${a.id} and ${b.id} are nearly left-aligned (off by ${leftDiff}px).`)
        }

        const topDiff = Math.abs(a.top - b.top)
        if (near(topDiff)) {
          issues.push(`Elements ${a.id} and ${b.id} are nearly top-aligned (off by ${topDiff}px).`)
        }

        const centerHDiff = Math.abs((a.left + a.width / 2) - (b.left + b.width / 2))
        if (near(centerHDiff)) {
          issues.push(`Elements ${a.id} and ${b.id} are nearly horizontally centered (off by ${centerHDiff}px).`)
        }

        const centerVDiff = Math.abs((a.top + a.height / 2) - (b.top + b.height / 2))
        if (near(centerVDiff)) {
          issues.push(`Elements ${a.id} and ${b.id} are nearly vertically centered (off by ${centerVDiff}px).`)
        }
      }
    }

    return { alignmentIssues: issues }
  }
}
