/**
 * Wire contracts shared by the host app (PPTist frontend) and the MCP server.
 *
 * These are plain JSON-serialisable types — they carry no framework types so any
 * host application can implement the supplier interfaces against them.
 */

/** A JSON-Schema document (kept loose on purpose; the server only forwards it). */
export type JsonSchema = Record<string, unknown>

/** Minimal element description shipped to the server for analysis. */
export interface CanvasElement {
  id: string
  type: string
  left: number
  top: number
  width: number
  height: number
  fill?: string
  content?: string
  defaultColor?: string
  defaultFontName?: string
  defaultSize?: string
  /** Distinct font sizes (px) found in the text, most frequent first. Text elements only. */
  fontSizes?: number[]
  /** Dominant paragraph alignment (`left` | `center` | `right` | `justify`). Text elements only. */
  textAlign?: string
}

export interface CanvasSlide<E extends CanvasElement = CanvasElement> {
  id: string
  background?: string
  /** Logical viewport (canvas) size in px, so analyzers can normalise geometry. */
  viewport?: { width: number; height: number }
  elements: E[]
}

export interface HistoryEntry {
  type: string
  targetType: string
  targetId?: string
  secondsAgo?: number
  details?: Record<string, unknown>
}

/** Everything a StateSupplier pushes: live canvas, selection and recent history. */
export interface CanvasState<E extends CanvasElement = CanvasElement> {
  /** What caused this snapshot (e.g. `updateElement`, `setActiveElementIdList`). */
  trigger: string
  selection: E[]
  slide: CanvasSlide<E>
  history: HistoryEntry[]
}

/** Describes one executable action the host app exposes through an ActionSupplier. */
export interface ActionDescriptor {
  /** Command id passed back to `ActionSupplier.execute` (e.g. `alignLeft`). */
  id: string
  label: string
  description: string
  /** Element types the action applies to (`any`, `text`, `image`, ...). */
  applicableTo: string[]
  /** JSON-Schema for the `args` object, when the action needs arguments. */
  argsSchema?: JsonSchema
}

/** Self-description of the host app, provided by a SchemaSupplier. */
export interface ClientSpecs {
  appName: string
  appVersion: string
  /** Free-form documentation the server embeds in generated tool descriptions. */
  documentation: string
  /** Capability flags, e.g. `state.push`, `actions.execute`, `suggestions.design_option`. */
  capabilities: string[]
  /** Named JSON-Schemas of the host's data structures (element, slide, ...). */
  schemas: Record<string, JsonSchema>
  actions: ActionDescriptor[]
}

export interface ActionResult {
  ok: boolean
  error?: string
}

/** A command the server asks the host app to run (execute_canvas_action). */
export interface ActionInvocation {
  requestId: string
  command: string
  args?: Record<string, unknown>
  /** Optional element to select before executing. */
  targetId?: string
}
