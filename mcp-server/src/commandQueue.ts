/**
 * Command queue — carries `execute_canvas_action` requests from MCP tools to the
 * browser. The browser's SDK bridge polls `GET /commands`, runs each command through
 * its ActionSupplier and reports back via `POST /commands/result`.
 */

import { randomUUID } from 'node:crypto'
import type { ActionInvocation, ActionResult } from '@pptist/sdk'

interface Pending {
  invocation: ActionInvocation
  delivered: boolean
  resolve: (result: ActionResult) => void
  timer: ReturnType<typeof setTimeout>
}

const pending = new Map<string, Pending>()

/** Queue a command and wait for the browser's result (or a timeout). */
export function enqueueCommand(
  command: string,
  args?: Record<string, unknown>,
  targetId?: string,
  timeoutMs = 8000,
): Promise<ActionResult> {
  const requestId = randomUUID()
  return new Promise<ActionResult>((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(requestId)
      resolve({ ok: false, error: `Timed out after ${timeoutMs}ms — the PPTist client did not respond (is it connected?).` })
    }, timeoutMs)
    pending.set(requestId, {
      invocation: { requestId, command, args, targetId },
      delivered: false,
      resolve,
      timer,
    })
  })
}

/** Hand every not-yet-delivered command to the browser (each is delivered once). */
export function takePendingCommands(): ActionInvocation[] {
  const out: ActionInvocation[] = []
  for (const p of pending.values()) {
    if (!p.delivered) {
      p.delivered = true
      out.push(p.invocation)
    }
  }
  return out
}

export function resolveCommand(requestId: string, result: ActionResult): boolean {
  const p = pending.get(requestId)
  if (!p) return false
  clearTimeout(p.timer)
  pending.delete(requestId)
  p.resolve(result)
  return true
}

export function pendingCommandCount(): number {
  return pending.size
}
