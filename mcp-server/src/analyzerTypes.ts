import type { MCPPayload } from './types.js'

/** Output of the ML layout analyzer. */
export interface MlInsights {
  /** `onnx` when real weights were used, `mock` for the heuristic stand-in. */
  source: 'onnx' | 'mock'
  /** Model identifier (file path for ONNX, name for the mock). */
  model: string
  /** Slide-level layout class derived from the element roles. */
  layoutClass: string
  elementRoles: Array<{ id: string; role: string; confidence: number }>
  hierarchyIssues: string[]
}

/** Merged result of every analyzer in the pipeline. */
export interface ContextInsights {
  alignmentIssues: string[]
  contrastIssues: string[]
  fontConsistency: string[]
  /** Present when the ML analyzer ran. */
  ml?: MlInsights
}

/** What a single analyzer contributes; the pipeline merges these together. */
export type AnalyzerResult = Partial<ContextInsights>

/** A pluggable analysis step. Analyzers must be side-effect free. */
export interface ContextAnalyzer {
  readonly id: string
  analyze(payload: MCPPayload): AnalyzerResult | Promise<AnalyzerResult>
}
