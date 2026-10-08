import type { AnalyzerResult, ContextAnalyzer, MlInsights } from '../analyzerTypes.js'
import type { MCPPayload, SerializedElement } from '../types.js'
import {
  DEFAULT_VIEWPORT,
  MockLayoutClassifier,
  ROLES,
  elementFeatures,
  loadLayoutClassifier,
  type LayoutClassifier,
  type LayoutRole,
} from './layoutClassifier.js'

const MAX_REPORTED_ELEMENTS = 50

function softmaxMax(logits: number[]): { index: number; confidence: number } {
  const max = Math.max(...logits)
  const exps = logits.map(l => Math.exp(l - max))
  const sum = exps.reduce((a, b) => a + b, 0)
  const index = exps.indexOf(Math.max(...exps))
  return { index, confidence: Math.round((exps[index] / sum) * 100) / 100 }
}

/**
 * Predicts each element's design role (title/body/media/decoration) from its
 * bounding box and type, then derives a slide layout class and hierarchy issues.
 * Uses ONNX weights when present, otherwise a mock classifier.
 */
export class MlLayoutAnalyzer implements ContextAnalyzer {
  readonly id = 'ml.layout'
  private classifierPromise: Promise<LayoutClassifier> | null = null

  constructor(private readonly loader: () => Promise<LayoutClassifier> = () => loadLayoutClassifier()) {}

  private getClassifier(): Promise<LayoutClassifier> {
    this.classifierPromise ??= this.loader()
    return this.classifierPromise
  }

  async analyze(payload: MCPPayload): Promise<AnalyzerResult> {
    const slideElements = payload.currentSlide?.elements ?? []
    const elements = slideElements.length > 0 ? slideElements : (payload.currentSelection ?? [])
    if (elements.length === 0) return {}

    const viewport = payload.currentSlide?.viewport ?? DEFAULT_VIEWPORT
    const features = elements.map(el => elementFeatures(el, viewport))

    let classifier = await this.getClassifier()
    let logits: number[][]
    try {
      logits = await classifier.classify(features)
    }
    catch (err) {
      console.error(`[ML] Inference failed (${(err as Error).message}) — falling back to mock classifier.`)
      classifier = new MockLayoutClassifier()
      logits = await classifier.classify(features)
    }

    const predictions = elements.map((el, i) => {
      const { index, confidence } = softmaxMax(logits[i])
      return { el, role: ROLES[index] as LayoutRole, confidence }
    })

    const ml: MlInsights = {
      source: classifier.source,
      model: classifier.name,
      layoutClass: deriveLayoutClass(predictions.map(p => p.role)),
      elementRoles: predictions
        .slice(0, MAX_REPORTED_ELEMENTS)
        .map(p => ({ id: p.el.id, role: p.role, confidence: p.confidence })),
      hierarchyIssues: findHierarchyIssues(predictions),
    }
    return { ml }
  }
}

function deriveLayoutClass(roles: LayoutRole[]): string {
  const count = (r: LayoutRole) => roles.filter(x => x === r).length
  const titles = count('title')
  const body = count('body')
  const media = count('media')

  if (titles + body + media === 0) return 'empty'
  if (titles === 0 && media > 0 && body === 0) return 'media-focused'
  if (body >= 4) return 'text-heavy'
  if (titles > 0 && body > 0 && media > 0) return 'title-body-media'
  if (titles > 0 && media > 0) return 'title-media'
  if (titles > 0 && body > 0) return 'title-body'
  if (titles > 0) return 'title-only'
  return 'unstructured'
}

function findHierarchyIssues(
  predictions: Array<{ el: SerializedElement; role: LayoutRole }>,
): string[] {
  const issues: string[] = []
  const titles = predictions.filter(p => p.role === 'title')
  const body = predictions.filter(p => p.role === 'body')
  const hasText = predictions.some(p => p.el.type === 'text')

  if (hasText && titles.length === 0) {
    issues.push('No element reads as a title; consider making the most prominent text a heading.')
  }
  if (titles.length > 1) {
    issues.push(`${titles.length} elements look like titles (${titles.map(t => t.el.id).join(', ')}); a slide usually has one.`)
  }
  for (const t of titles) {
    const lower = body.find(b => b.el.top < t.el.top)
    if (lower) {
      issues.push(`Title ${t.el.id} sits below body element ${lower.el.id}; the title should lead the reading order.`)
      break
    }
  }
  return issues
}
