/**
 * Shared types for the MCP Bridge
 *
 * These types define the contract between:
 *   Browser (CommunicationTriggers) → HTTP POST → MCP Server state store
 *   OpenClaw (MCP Client) → MCP Tools → reads from state store
 */

// ── What CommunicationTriggers POSTs to the HTTP endpoint ───────────────────

export interface MCPPayload {
  triggerAction: string
  currentSelection: SerializedElement[]
  currentSlide: SerializedSlide
  last5Actions: SerializedAction[]
}

export interface SerializedElement {
  id: string
  type: string             // 'text' | 'image' | 'shape' | 'line' | 'chart' | 'table' | ...
  width: number
  height: number
  left: number
  top: number
  content?: string         // First 60 chars of text content, if text element
  fill?: string            // Fill color, if present
  defaultColor?: string    // Default text color, if text element
  defaultFontName?: string // Font family name, if text element
  defaultSize?: string     // Font size, if text element
}

export interface SerializedSlide {
  id: string
  background?: string
  /** Logical canvas size in px, used to normalise geometry for ML. */
  viewport?: { width: number; height: number }
  elements: SerializedElement[]
}

export interface SerializedAction {
  type: string             // 'select' | 'insert' | 'delete' | 'update' | 'format' | ...
  targetType: string       // 'text' | 'image' | 'shape' | ...
  targetId?: string
  secondsAgo?: number
  details?: Record<string, unknown>
}

// ── What OpenClaw sends back to the frontend via the MCP tool ────────────────

/**
 * A single step in a multi-step action sequence.
 * When the user clicks a predicted action button, all steps execute in order.
 *
 * Examples:
 *   { command: 'bold' }                                        → toggle bold
 *   { command: 'updateElement', args: { fill: '#ff0000' } }    → change fill color
 *   { command: 'alignCenter' }                                 → center horizontally
 */
export interface ActionStep {
  command: string                        // Action ID from ACTION_CATALOGUE or a store method name
  args?: Record<string, unknown>         // Optional arguments for the command
}

export interface ElementStateUpdate {
  id: string                             // Target element ID
  props: Record<string, unknown>         // The new properties to apply to the element
}

/**
 * A single unified AI suggestion that can either be a sequence of small commands
 * OR a direct state update of elements.
 */
export interface AiSuggestion {
  id: string                             // Unique ID for the suggestion
  type: 'action_sequence' | 'design_option' // Indicates which payload to expect
  label: string                          // Human-readable button label
  description: string                    // Detailed explanation of the choice
  confidence: number                     // 0.0 – 1.0 confidence score
  steps?: ActionStep[]                   // Sequence of commands (if type === 'action_sequence')
  updatedElements?: ElementStateUpdate[] // Complete element states (if type === 'design_option')
}

/**
 * The full suggestion payload stored in the state store
 * and served to the frontend via GET /suggestions.
 */
export interface AiSuggestionsPayload {
  suggestions: AiSuggestion[]
  timestamp: number                      // When the suggestions were generated (Date.now())
}

