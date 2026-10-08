/**
 * Modular analyzer pipeline.
 *
 * Each `ContextAnalyzer` contributes a partial result; the pipeline runs them all
 * (isolating failures) and merges the results into one `ContextInsights` object that
 * is served at `pptist://context/live`.
 */

import type { AnalyzerResult, ContextAnalyzer, ContextInsights } from './analyzerTypes.js'
import type { MCPPayload } from './types.js'
import { AlignmentAnalyzer } from './analyzerModules/alignment.js'
import { ContrastAnalyzer } from './analyzerModules/contrast.js'
import { FontConsistencyAnalyzer } from './analyzerModules/fontConsistency.js'
import { MlLayoutAnalyzer } from './analyzerModules/mlLayout.js'

export type { AnalyzerResult, ContextAnalyzer, ContextInsights, MlInsights } from './analyzerTypes.js'

export class AnalyzerPipeline {
  private readonly analyzers: ContextAnalyzer[] = []

  constructor(analyzers: ContextAnalyzer[] = []) {
    analyzers.forEach(a => this.register(a))
  }

  /** Add an analyzer; replaces any existing one with the same id. */
  register(analyzer: ContextAnalyzer): this {
    const existing = this.analyzers.findIndex(a => a.id === analyzer.id)
    if (existing >= 0) this.analyzers[existing] = analyzer
    else this.analyzers.push(analyzer)
    return this
  }

  list(): string[] {
    return this.analyzers.map(a => a.id)
  }

  async run(payload: MCPPayload): Promise<ContextInsights> {
    const results = await Promise.all(
      this.analyzers.map(async (analyzer): Promise<AnalyzerResult> => {
        try {
          return await analyzer.analyze(payload)
        }
        catch (err) {
          console.error(`[Analyzer] "${analyzer.id}" failed:`, (err as Error).message)
          return {}
        }
      }),
    )
    return mergeResults(results)
  }
}

function mergeResults(results: AnalyzerResult[]): ContextInsights {
  const merged: ContextInsights = { alignmentIssues: [], contrastIssues: [], fontConsistency: [] }
  for (const r of results) {
    merged.alignmentIssues.push(...(r.alignmentIssues ?? []))
    merged.contrastIssues.push(...(r.contrastIssues ?? []))
    merged.fontConsistency.push(...(r.fontConsistency ?? []))
    if (r.ml) merged.ml = r.ml
  }
  return merged
}

/** Heuristic analyzers + the ML layout analyzer. */
export function createDefaultPipeline(): AnalyzerPipeline {
  return new AnalyzerPipeline([
    new AlignmentAnalyzer(),
    new ContrastAnalyzer(),
    new FontConsistencyAnalyzer(),
    new MlLayoutAnalyzer(),
  ])
}

const defaultPipeline = createDefaultPipeline()

/** Run the shared default pipeline (heuristics + ML) against a payload. */
export function analyzeContext(payload: MCPPayload): Promise<ContextInsights> {
  return defaultPipeline.run(payload)
}
