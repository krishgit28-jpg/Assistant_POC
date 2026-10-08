/**
 * Supplier contracts — the formal interfaces a host app implements to plug into
 * the PPTist MCP server. The host never talks HTTP/MCP directly; it only supplies
 * state, actions and a self-description, and the SDK bridge does the rest.
 */

import type { ActionDescriptor, ActionResult, ClientSpecs } from './contracts.js'

export type Unsubscribe = () => void

/**
 * Pushes live application state (canvas elements, active selection, history).
 * The supplier decides *when* to emit (e.g. debounced on user actions).
 */
export interface StateSupplier<T> {
  /** Current state on demand (used for the initial push after connecting). */
  getSnapshot(): T
  /** Register a listener invoked every time the state changes meaningfully. */
  subscribe(listener: (snapshot: T) => void): Unsubscribe
}

/**
 * Exposes execution hooks ("Align Left", "Change Font", ...) without leaking the
 * host UI framework. `A` narrows the accepted command ids if the host wants.
 */
export interface ActionSupplier<A extends string = string> {
  /** Actions currently executable by the host. */
  listActions(): ActionDescriptor[]
  /** Execute one action. Must not throw; report failure through the result. */
  execute(
    command: A,
    args?: Record<string, unknown>,
    options?: { targetId?: string },
  ): Promise<ActionResult> | ActionResult
}

/**
 * Provides the host app's documentation, JSON-Schemas and capabilities so the
 * server can generate its operational tools dynamically.
 */
export interface SchemaSupplier {
  getSpecs(): Promise<ClientSpecs> | ClientSpecs
}
