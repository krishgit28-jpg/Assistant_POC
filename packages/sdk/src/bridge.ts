/**
 * McpBridgeClient — connects a host app's suppliers to the PPTist MCP server.
 *
 * Responsibilities (so the host does not hand-roll HTTP calls):
 *   1. Ingest: POST /specs      — send the SchemaSupplier's specs (server then
 *                                 generates its operational tools dynamically)
 *   2. State:  POST /context    — forward every StateSupplier emission
 *   3. Action: GET  /commands   — poll for commands queued by the server and run
 *              POST /commands/result  them through the ActionSupplier
 *
 * The bridge never throws into the host app: if the server is unreachable it
 * keeps retrying in the background and re-ingests specs after a server restart.
 */

import type { ActionInvocation, ActionResult, CanvasState } from './contracts.js'
import type { ActionSupplier, SchemaSupplier, StateSupplier, Unsubscribe } from './suppliers.js'

export interface McpBridgeOptions {
  state: StateSupplier<CanvasState>
  actions: ActionSupplier
  schema: SchemaSupplier
  /** Base URL of the MCP server's HTTP bridge. Default `http://localhost:3100`. */
  baseUrl?: string
  /** How often to poll for server-queued commands while connected. Default 1000ms. */
  commandPollMs?: number
  /** Delay between reconnect attempts while the server is unreachable. Default 5000ms. */
  retryMs?: number
  /** Per-request timeout. Default 2000ms. */
  requestTimeoutMs?: number
  log?: (message: string, ...rest: unknown[]) => void
}

export class McpBridgeClient {
  private readonly baseUrl: string
  private readonly commandPollMs: number
  private readonly retryMs: number
  private readonly requestTimeoutMs: number
  private readonly log: (message: string, ...rest: unknown[]) => void

  private connected = false
  private running = false
  private connecting = false
  private unsubscribe: Unsubscribe | null = null
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private polling = false

  constructor(private readonly options: McpBridgeOptions) {
    this.baseUrl = (options.baseUrl ?? 'http://localhost:3100').replace(/\/$/, '')
    this.commandPollMs = options.commandPollMs ?? 1000
    this.retryMs = options.retryMs ?? 5000
    this.requestTimeoutMs = options.requestTimeoutMs ?? 2000
    this.log = options.log ?? (() => {})
  }

  get isConnected(): boolean {
    return this.connected
  }

  /** Start bridging. Returns immediately; connection happens in the background. */
  start(): void {
    if (this.running) return
    this.running = true
    this.unsubscribe = this.options.state.subscribe(snapshot => {
      void this.pushState(snapshot)
    })
    void this.connect()
  }

  stop(): void {
    this.running = false
    this.connected = false
    this.unsubscribe?.()
    this.unsubscribe = null
    if (this.pollTimer) clearInterval(this.pollTimer)
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.pollTimer = null
    this.retryTimer = null
  }

  // ── Connection lifecycle ───────────────────────────────────────────────────

  private async connect(): Promise<void> {
    if (!this.running || this.connecting || this.connected) return
    this.connecting = true
    try {
      const specs = await this.options.schema.getSpecs()
      // Make sure the action list advertised to the server is the live one.
      const live = this.options.actions.listActions()
      await this.post('/specs', { ...specs, actions: live.length ? live : specs.actions })
      this.connected = true
      this.log('[McpBridge] specs ingested — server is operational')

      this.pollTimer = setInterval(() => void this.pollCommands(), this.commandPollMs)
      await this.pushState(this.options.state.getSnapshot())
    }
    catch {
      this.markDisconnected()
    }
    finally {
      this.connecting = false
    }
  }

  private markDisconnected(): void {
    this.connected = false
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.pollTimer = null
    if (!this.running || this.retryTimer) return
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      void this.connect()
    }, this.retryMs)
  }

  // ── State supplier → server ────────────────────────────────────────────────

  private async pushState(snapshot: CanvasState): Promise<void> {
    if (!this.connected) return
    try {
      await this.post('/context', snapshot)
    }
    catch {
      this.markDisconnected()
    }
  }

  // ── Server → action supplier ───────────────────────────────────────────────

  private async pollCommands(): Promise<void> {
    if (!this.connected || this.polling) return
    this.polling = true
    try {
      const res = await this.request('/commands', { method: 'GET' })
      const body = (await res.json()) as { commands?: ActionInvocation[] }
      for (const invocation of body.commands ?? []) {
        const result = await this.runInvocation(invocation)
        await this.post('/commands/result', { requestId: invocation.requestId, result })
      }
    }
    catch {
      this.markDisconnected()
    }
    finally {
      this.polling = false
    }
  }

  private async runInvocation(invocation: ActionInvocation): Promise<ActionResult> {
    try {
      return await this.options.actions.execute(invocation.command, invocation.args, {
        targetId: invocation.targetId,
      })
    }
    catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  // ── HTTP helpers ───────────────────────────────────────────────────────────

  private async post(path: string, body: unknown): Promise<Response> {
    return this.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      signal: AbortSignal.timeout(this.requestTimeoutMs),
    })
    if (!res.ok) throw new Error(`${path} responded ${res.status}`)
    return res
  }
}
