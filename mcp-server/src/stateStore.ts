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

import type { MCPPayload, AiSuggestion, AiSuggestionsPayload } from './types.js'

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

// ── Suggestions State (OpenClaw → MCP Server → Browser) ──────────────────────

interface SuggestionsState {
  latestSuggestions: AiSuggestionsPayload | null
  suggestionCount: number
}

const suggestionsState: SuggestionsState = {
  latestSuggestions: null,
  suggestionCount: 0,
}

export function updateSuggestions(suggestions: AiSuggestion[]): void {
  suggestionsState.latestSuggestions = {
    suggestions,
    timestamp: Date.now(),
  }
  suggestionsState.suggestionCount++
  console.error(`[StateStore] Suggestions updated (total sets: ${suggestionsState.suggestionCount}) — ${suggestions.length} suggestions`)
}

export function getLatestSuggestions(): AiSuggestionsPayload | null {
  return suggestionsState.latestSuggestions
}

export function clearSuggestions(): void {
  suggestionsState.latestSuggestions = null
  console.error('[StateStore] Suggestions cleared')
}

