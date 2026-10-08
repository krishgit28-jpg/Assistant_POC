/**
 * Layout role classifier used by the ML analyzer.
 *
 * Model contract (what a real `layout-classifier.onnx` must implement):
 *   input  : float32 [N, FEATURE_DIM]  — one row per element (see `elementFeatures`)
 *   output : float32 [N, ROLES.length] — one row of logits per element
 *
 * If the weights are missing or unusable the loader returns a heuristic mock that
 * honours the same contract, so the server never crashes because of the model.
 */

import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { SerializedElement } from '../types.js'

export const ROLES = ['title', 'body', 'media', 'decoration'] as const
export type LayoutRole = (typeof ROLES)[number]

/** left, top, width, height, area, isText, isMedia, isShape (geometry normalised to 0-1). */
export const FEATURE_DIM = 8

export const DEFAULT_VIEWPORT = { width: 1000, height: 562.5 }

const MEDIA_TYPES = new Set(['image', 'video', 'audio', 'chart', 'table', 'latex'])
const SHAPE_TYPES = new Set(['shape', 'line'])

export function elementFeatures(
  el: SerializedElement,
  viewport: { width: number; height: number },
): number[] {
  const w = el.width / viewport.width
  const h = el.height / viewport.height
  return [
    el.left / viewport.width,
    el.top / viewport.height,
    w,
    h,
    w * h,
    el.type === 'text' ? 1 : 0,
    MEDIA_TYPES.has(el.type) ? 1 : 0,
    SHAPE_TYPES.has(el.type) ? 1 : 0,
  ]
}

export interface LayoutClassifier {
  readonly source: 'onnx' | 'mock'
  readonly name: string
  /** Returns one logits row (length ROLES.length) per feature row. */
  classify(features: number[][]): Promise<number[][]>
}

// ── Mock classifier (fallback) ───────────────────────────────────────────────

export class MockLayoutClassifier implements LayoutClassifier {
  readonly source = 'mock' as const
  readonly name = 'mock-heuristic-layout-classifier'

  async classify(features: number[][]): Promise<number[][]> {
    return features.map(([, top, width, height, area, isText, isMedia, isShape]) => {
      const title = isText * ((top < 0.3 ? 2 : 0) + (width > 0.4 ? 1.5 : 0) + (height < 0.2 ? 1 : 0))
      const body = isText * (1 + (top >= 0.2 ? 1.5 : 0) + (area > 0.1 ? 1 : 0))
      const media = isMedia * 3 + (isShape && area > 0.15 ? 0.5 : 0)
      const decoration = isShape * (1.5 + (area < 0.05 ? 1 : 0))
      return [title, body, media, decoration]
    })
  }
}

// ── ONNX classifier ──────────────────────────────────────────────────────────

type OrtModule = typeof import('onnxruntime-node')

class OnnxLayoutClassifier implements LayoutClassifier {
  readonly source = 'onnx' as const

  constructor(
    readonly name: string,
    private readonly ort: OrtModule,
    private readonly session: Awaited<ReturnType<OrtModule['InferenceSession']['create']>>,
  ) {}

  async classify(features: number[][]): Promise<number[][]> {
    if (features.length === 0) return []
    const n = features.length
    const input = new this.ort.Tensor('float32', Float32Array.from(features.flat()), [n, FEATURE_DIM])
    const outputs = await this.session.run({ [this.session.inputNames[0]]: input })
    const data = outputs[this.session.outputNames[0]].data as Float32Array

    if (data.length !== n * ROLES.length) {
      throw new Error(`Unexpected ONNX output size ${data.length}, expected ${n * ROLES.length}`)
    }
    const rows: number[][] = []
    for (let i = 0; i < n; i++) {
      rows.push(Array.from(data.slice(i * ROLES.length, (i + 1) * ROLES.length)))
    }
    return rows
  }
}

/** Default weight location: `<mcp-server>/models/layout-classifier.onnx`. */
export function defaultModelPath(): string {
  return process.env.PPTIST_ONNX_MODEL
    ?? fileURLToPath(new URL('../../models/layout-classifier.onnx', import.meta.url))
}

/**
 * Load the ONNX model if possible; otherwise return the mock. Never throws.
 */
export async function loadLayoutClassifier(modelPath = defaultModelPath()): Promise<LayoutClassifier> {
  const mock = new MockLayoutClassifier()

  if (!existsSync(modelPath)) {
    console.error(`[ML] No model weights at ${modelPath} — using mock layout classifier.`)
    return mock
  }

  try {
    const ort = await import('onnxruntime-node')
    const session = await ort.InferenceSession.create(modelPath)
    console.error(`[ML] Loaded ONNX layout classifier from ${modelPath}`)
    return new OnnxLayoutClassifier(modelPath, ort, session)
  }
  catch (err) {
    console.error(`[ML] Failed to load ONNX model (${(err as Error).message}) — using mock layout classifier.`)
    return mock
  }
}
