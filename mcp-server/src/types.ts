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
  elements: SerializedElement[]
}

export interface SerializedAction {
  type: string             // 'select' | 'insert' | 'delete' | 'update' | 'format' | ...
  targetType: string       // 'text' | 'image' | 'shape' | ...
  targetId?: string
  secondsAgo: number
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

/**
 * A single predicted action from OpenClaw.
 * Contains metadata for display and an executable steps array.
 */
export interface PredictedAction {
  actionId: string                       // Unique ID (can be an ACTION_CATALOGUE id or a custom one)
  label: string                          // Human-readable button label (e.g., "Bold Text")
  description: string                    // Tooltip / short description
  confidence: number                     // 0.0 – 1.0 confidence score
  steps: ActionStep[]                    // Sequence of commands to execute (in order)
}

/**
 * The full prediction payload stored in the state store
 * and served to the frontend via GET /predictions.
 */
export interface PredictionPayload {
  predictions: PredictedAction[]
  timestamp: number                      // When the predictions were generated (Date.now())
}
