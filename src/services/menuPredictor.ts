/**
 * Menu Predictor Service
 *
 * Accepts a PredictionContext and returns a ranked list of top-5 action IDs.
 *
 * If VITE_AI_MENU_API_KEY is set: calls an OpenAI-compatible API.
 * Otherwise: uses a fast heuristic fallback (scores from getCandidateActions).
 *
 * - 500ms AbortController timeout on LLM calls.
 * - Simple Map-based cache keyed by a lightweight context hash.
 * - Returns null on any error (callers fall back to static UI).
 */

import type { ActionCandidate, PredictionContext } from './actionRegistry'
import type { UserAction } from './actionHistory'

const API_KEY = import.meta.env.VITE_AI_MENU_API_KEY as string | undefined
const API_URL = (import.meta.env.VITE_AI_MENU_API_URL as string | undefined)
  ?? 'https://api.openai.com/v1'
const MODEL = (import.meta.env.VITE_AI_MENU_MODEL as string | undefined) ?? 'gpt-4o-mini'

// ── Cache ────────────────────────────────────────────────────────────────────

interface CacheEntry {
  result: string[]
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 60_000

function buildCacheKey(context: PredictionContext): string {
  const selType = context.selection?.type ?? 'none'
  const selId = context.selection?.id ?? 'none'
  const historyKey = context.actionHistory
    .slice(0, 3)
    .map(a => `${a.type}:${a.targetType}`)
    .join(',')
  return `${selType}|${selId}|${historyKey}`
}

function getCached(key: string): string[] | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return null
  }
  return entry.result
}

function setCached(key: string, result: string[]) {
  cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS })
}

/** Clear all cached predictions (call on selection change for fresh results) */
export function clearPredictionCache() {
  cache.clear()
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function summariseAction(a: UserAction): string {
  const ago = Math.round((Date.now() - a.timestamp) / 1000)
  return `- [${ago}s ago] ${a.type} ${a.targetType}${a.targetId ? ` (id:${a.targetId.slice(0, 6)})` : ''}${
    a.details?.props ? ` props:[${(a.details.props as string[]).join(',')}]` : ''
  }`
}

function buildPrompt(context: PredictionContext): string {
  const historyLines = context.actionHistory.length
    ? context.actionHistory.slice(0, 5).map(summariseAction).join('\n')
    : '- (no recent actions)'

  const selLines = context.selection
    ? [
        `- Type: ${context.selection.type}`,
        `- ID: ${context.selection.id.slice(0, 6)}`,
        `- Properties: ${JSON.stringify(context.selection.properties).slice(0, 200)}`,
      ].join('\n')
    : '- (nothing selected)'

  const slideLine = `- Total elements: ${context.slideSummary.totalElements}. Counts: ${
    Object.entries(context.slideSummary.elementCounts)
      .map(([k, v]) => `${k}×${v}`)
      .join(', ')
  }`

  const candidateLines = context.candidates
    .map((c, i) => `${i + 1}. ${c.id}: ${c.label} — ${c.description}`)
    .join('\n')

  return `You are an AI assistant for a mobile presentation editor. Based on the context below, predict the 5 most likely next actions the user will want from the candidate list.

Return ONLY a valid JSON object in this exact format: {"actions":["id1","id2","id3","id4","id5"]}

Recent actions (most recent first):
${historyLines}

Current selection:
${selLines}

Slide summary:
${slideLine}

Candidate actions (id: label — description):
${candidateLines}

Your response (JSON only):`
}

// ── Heuristic fallback ────────────────────────────────────────────────────────

function heuristicPredict(candidates: ActionCandidate[]): string[] {
  // Candidates are already scored by getCandidateActions — just take top 5
  return candidates
    .slice(0, 5)
    .map(c => c.id)
}

// ── Mock AI predictor ────────────────────────────────────────────────────────
export let USE_MOCK_AI = true

export function setMockAi(enabled: boolean) {
  USE_MOCK_AI = enabled
  console.log(`[AI Menu Pipeline] Mock AI mode is now ${enabled ? 'ENABLED' : 'DISABLED'}`)
}

/**
 * Mock AI function:
 * Everything is identical to the real API call (prompt assembly, payload creation, context),
 * but instead of making a network request, it returns 5 text-focused actions from candidates
 * and logs the full diagnostic output.
 */
function mockLlmPredict(
  context: PredictionContext,
  prompt: string,
  payload: Record<string, unknown>,
): string[] {
  // console.groupCollapsed(
  //   '%c[AI Menu Pipeline] 🤖 Mock AI Call (Intercepted before network)',
  //   'color: #8b5cf6; font-weight: bold; font-size: 11px;',
  // )
  // console.log('📌 Selection:', context.selection ? `${context.selection.type} (${context.selection.id})` : 'None')
  // console.log('📜 Recent Actions (last 5):', context.actionHistory.slice(0, 5))
  // console.log('📊 Slide Element Counts:', context.slideSummary.elementCounts)
  // console.log('📋 Valid Candidates Count:', context.candidates.length)
  // console.log('📝 Prompt Constructed for LLM:\n' + prompt)
  // console.log('📦 LLM Request Payload:', payload)
  // console.groupEnd()

  const validIds = new Set(context.candidates.map(c => c.id))

  // 5 text-focused actions prioritized when text/shape is selected
  const preferredTextActions = ['bold', 'changeTextColor', 'fontSizeUp', 'alignCenter', 'duplicate']

  const result: string[] = []

  // Add preferred text actions if they exist in candidates
  for (const id of preferredTextActions) {
    if (validIds.has(id) && !result.includes(id)) {
      result.push(id)
    }
  }

  // Fill remaining slots up to 5 from the candidate list
  for (const c of context.candidates) {
    if (result.length >= 5) break
    if (!result.includes(c.id)) {
      result.push(c.id)
    }
  }

  // console.log(
  //   '%c[AI Menu Pipeline] ✨ Mock AI Output (5 actions):',
  //   'color: #10b981; font-weight: bold;',
  //   result,
  // )

  return result
}

// ── LLM call ─────────────────────────────────────────────────────────────────

async function llmPredict(context: PredictionContext): Promise<string[] | null> {
  const prompt = buildPrompt(context)
  const payload = {
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 80,
    temperature: 0,
    response_format: { type: 'json_object' },
  }

  // If mock mode is enabled or API_KEY is absent, use the mock AI function
  if (USE_MOCK_AI || !API_KEY) {
    return mockLlmPredict(context, prompt, payload)
  }

  const controller = new AbortController()
  // 2500ms timeout for live remote LLM calls
  const timeoutId = setTimeout(() => {
    console.warn('[AI Menu Pipeline] ⚠️ LLM request timed out after 2500ms')
    controller.abort()
  }, 2500)

  try {
    console.log('%c[AI Menu Pipeline] 🚀 Sending request to LLM endpoint:', 'color: #3b82f6;', `${API_URL}/chat/completions`)

    const response = await fetch(`${API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    console.groupCollapsed('%c[AI Menu Pipeline] 🌐 Live LLM Response Received', 'color: #3b82f6; font-weight: bold;')
    console.log('HTTP Status:', response.status, response.statusText)

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      console.warn('❌ LLM HTTP Error Body:', errText)
      console.groupEnd()
      return null
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: Record<string, unknown>
    }

    console.log('Raw JSON from Provider:', data)
    const content = data?.choices?.[0]?.message?.content
    console.log('Model Text Output:', content)

    if (!content) {
      console.warn('⚠️ No content in model response choice')
      console.groupEnd()
      return null
    }

    // Parse and validate the response
    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      // Handle markdown code fences if model enclosed JSON
      const match = content.match(/\{[\s\S]*\}/)
      if (!match) {
        console.warn('⚠️ Failed to extract valid JSON from model response')
        console.groupEnd()
        return null
      }
      parsed = JSON.parse(match[0])
    }

    const actions = (parsed as { actions?: unknown })?.actions
    console.log('Parsed "actions" array from model:', actions)

    if (!Array.isArray(actions)) {
      console.warn('⚠️ Model response JSON did not contain an "actions" array')
      console.groupEnd()
      return null
    }

    // Validate that returned IDs actually exist in our candidate list
    const validIds = new Set(context.candidates.map(c => c.id))
    const filtered = (actions as unknown[])
      .filter(id => typeof id === 'string' && validIds.has(id))
      .slice(0, 5) as string[]

    console.log('✅ Final Validated Action IDs (Top 5):', filtered)
    console.groupEnd()

    return filtered.length > 0 ? filtered : null
  } catch (err) {
    clearTimeout(timeoutId)
    if ((err as Error).name !== 'AbortError') {
      console.warn('[AI Menu Pipeline] ❌ Live LLM call threw an exception:', err)
    }
    return null
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Predict the top 5 action IDs for the given context.
 *
 * Returns an array of action ID strings (length 1–5) or null on failure.
 * Never throws.
 */
export async function predictMenuActions(
  context: PredictionContext,
): Promise<string[] | null> {
  if (!context.candidates.length) {
    console.log('[AI Menu Pipeline] No candidates available for this selection')
    return null
  }

  const cacheKey = buildCacheKey(context)
  const cached = getCached(cacheKey)
  if (cached) {
    console.log('%c[AI Menu Pipeline] ⚡ Cache hit:', 'color: #0ea5e9;', cached)
    return cached
  }

  let result: string[] | null = await llmPredict(context)

  // Fallback to heuristic if LLM failed/timed out
  if (!result || result.length === 0) {
    result = heuristicPredict(context.candidates)
  }

  if (result && result.length > 0) {
    setCached(cacheKey, result)
  }

  return result
}
