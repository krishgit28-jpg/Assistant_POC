/**
 * MCP Server — Resources + Notifications + dynamically generated Tools
 *
 * Lifecycle:
 *   1. BOOTSTRAP   — only configuration tools exist
 *                    (ingest_client_specs, register_dynamic_tool, get_server_status)
 *   2. INGEST      — the PPTist client's SchemaSupplier pushes its specs (POST /specs)
 *   3. OPERATIONAL — operational tools are generated from the specs
 *                    (send_ai_suggestions, execute_canvas_action, get_current_context,
 *                    describe_client_capabilities) and the server emits
 *                    `notifications/tools/list_changed` so the MCP client re-indexes.
 *
 * Live data flow:
 *   1. OpenClaw subscribes to the `pptist://context/live` resource ONCE
 *   2. Every time the browser's StateSupplier pushes new state (via the SDK bridge),
 *      the server sends a `notifications/resources/updated` notification
 *   3. OpenClaw reads the resource: raw state + merged heuristic/ML insights
 *   4. OpenClaw calls `send_ai_suggestions` / `execute_canvas_action`
 *   5. The browser fetches suggestions (GET /suggestions) and commands (GET /commands)
 *
 * Resources:
 *   pptist://context/live   — Full live context (selection + slide + history + insights)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SubscribeRequestSchema, UnsubscribeRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { buildLiveContext } from './contextView.js'
import { DynamicToolManager } from './dynamicTools.js'

const LIVE_CONTEXT_URI = 'app://context/live'

export interface ServerRuntime {
  mcpServer: McpServer
  tools: DynamicToolManager
}

/**
 * Create the MCP server in bootstrap mode (resource + configuration tools only).
 */
export function createMcpServer(): ServerRuntime {
  const server = new McpServer(
    {
      name: 'app-mcp-server',
      version: '2.0.0',
    },
    {
      // Declare that we support resource subscriptions
      capabilities: {
        resources: { subscribe: true },
      },
    }
  )

  // ── Resource: pptist://context/live ────────────────────────────────────────
  // OpenClaw subscribes to this once. It gets notified on every user action.
  server.resource(
    'live-context',
    LIVE_CONTEXT_URI,
    {
      description: 'CRITICAL: Live PPTist editor context. You MUST SUBSCRIBE to this resource (`resources/subscribe`) to receive real-time notifications on every user action. Do NOT just read it once. Contains: geometric data, colors, selection, history, and merged heuristic + ML insights (alignment, contrast, font consistency, layout roles/hierarchy).',
      mimeType: 'application/json',
    },
    async () => {
      const context = await buildLiveContext()

      return {
        contents: [{
          uri: LIVE_CONTEXT_URI,
          mimeType: 'application/json',
          text: JSON.stringify(context ?? {
            status: 'waiting',
            message: 'No context available yet. The user has not interacted with the editor.',
          }),
        }],
      }
    }
  )

  // ── Bootstrap tools (configuration only) ───────────────────────────────────
  const tools = new DynamicToolManager(server)
  tools.registerBootstrapTools()

  // ── Manual Subscription Handlers ───────────────────────────────────────────
  // The high-level McpServer class doesn't automatically handle these, so we 
  // register them directly on the underlying server to satisfy the capability.
  server.server.setRequestHandler(
    SubscribeRequestSchema, 
    async () => {
      // In a real app we'd track who subscribed to what, but here we just accept it
      return {}
    }
  )

  server.server.setRequestHandler(
    UnsubscribeRequestSchema, 
    async () => {
      return {}
    }
  )

  return { mcpServer: server, tools }
}

/**
 * Send a notification to OpenClaw that the live context resource has been updated.
 * Called by the HTTP server every time the StateSupplier pushes new data.
 */
export async function notifyContextUpdated(server: McpServer): Promise<void> {
  // We no longer clear suggestions here so the UI doesn't flash "Waiting for AI"
  // The old suggestions will remain visible until the LLM finishes and overwrites them.

  try {
    await server.server.sendResourceUpdated({ uri: LIVE_CONTEXT_URI })
    console.error(`[MCP] Sent notifications/resources/updated for ${LIVE_CONTEXT_URI}`)
  }
  catch (err) {
    // This can fail if no client is connected yet — that's fine
    console.error('[MCP] Could not send notification (client may not be connected):', (err as Error).message)
  }
}
