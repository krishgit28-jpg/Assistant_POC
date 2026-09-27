/**
 * State Store — In-memory store for the latest context from the browser
 *
 * CommunicationTriggers POSTs data here via HTTP.
 * MCP tools read from here when OpenClaw queries them.
 *
 * Also stores the latest AI predictions from OpenClaw,
 * which the frontend fetches via GET /predictions.
 *
 * This is intentionally simple — a single mutable object.
 * Only the latest context matters (no history of contexts).
 */

import type { MCPPayload, PredictedAction, PredictionPayload } from './types.js'

// ── Context State (Browser → MCP Server) ─────────────────────────────────────

interface StoreState {
  /** The most recent payload received from the browser */
  latestPayload: MCPPayload | null
  /** Timestamp of when the latest payload was received */
  lastUpdated: number | null
  /** Total number of payloads received since server start */
  updateCount: number
}

const state: StoreState = {
  latestPayload: null,
  lastUpdated: null,
  updateCount: 0,
}

/**
 * Update the store with a new payload from CommunicationTriggers.
 */
export function updateState(payload: MCPPayload): void {
  state.latestPayload = payload
  state.lastUpdated = Date.now()
  state.updateCount++
  console.error(`[StateStore] Updated (total: ${state.updateCount}) — trigger: ${payload.triggerAction}`)
}

/**
 * Get the latest payload. Returns null if no data has been received yet.
 */
export function getLatestPayload(): MCPPayload | null {
  return state.latestPayload
}

/**
 * Get the timestamp of the last update.
 */
export function getLastUpdated(): number | null {
  return state.lastUpdated
}

/**
 * Get a status summary of the store.
 */
export function getStoreStatus(): { hasData: boolean; lastUpdated: number | null; updateCount: number } {
  return {
    hasData: state.latestPayload !== null,
    lastUpdated: state.lastUpdated,
    updateCount: state.updateCount,
  }
}

// ── Predictions State (OpenClaw → MCP Server → Browser) ──────────────────────

interface PredictionsState {
  /** The most recent predictions from OpenClaw */
  latestPredictions: PredictionPayload | null
  /** How many prediction sets we've received since server start */
  predictionCount: number
}

const predictionsState: PredictionsState = {
  latestPredictions: null,
  predictionCount: 0,
}

/**
 * Store new predictions from OpenClaw.
 * Called when the LLM invokes the send_predicted_actions MCP tool.
 */
export function updatePredictions(predictions: PredictedAction[]): void {
  predictionsState.latestPredictions = {
    predictions,
    timestamp: Date.now(),
  }
  predictionsState.predictionCount++
  console.error(`[StateStore] Predictions updated (total sets: ${predictionsState.predictionCount}) — ${predictions.length} actions`)
}

/**
 * Get the latest predictions. Returns null if none have been received yet.
 */
export function getLatestPredictions(): PredictionPayload | null {
  return predictionsState.latestPredictions
}

/**
 * Clear predictions (e.g., when context changes and old predictions are stale).
 */
export function clearPredictions(): void {
  predictionsState.latestPredictions = null
  console.error('[StateStore] Predictions cleared')
}

