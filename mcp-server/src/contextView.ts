import { getLatestPayload } from './stateStore.js'
import { analyzeContext } from './analyzers.js'
import { getClientSpecs } from './clientSpecs.js'

/**
 * Build the live-context document served at `pptist://context/live` and by the
 * `get_current_context` tool: raw editor state + merged heuristic/ML insights.
 * Returns null until the browser has pushed its first context.
 */
export async function buildLiveContext(): Promise<Record<string, unknown> | null> {
  const payload = getLatestPayload()
  if (!payload) return null

  const insights = await analyzeContext(payload)
  const specs = getClientSpecs()

  return {
    client: specs ? `${specs.appName}@${specs.appVersion}` : null,
    triggerAction: payload.triggerAction,
    currentSelection: payload.currentSelection,
    currentSlide: payload.currentSlide,
    recentActions: payload.last5Actions,
    insights,
  }
}
