/**
 * MCP Server — Resources + Notifications + Tools for OpenClaw
 *
 * Architecture:
 *   1. OpenClaw subscribes to the `pptist://context/live` resource ONCE
 *   2. Every time the browser pushes new context (via HTTP POST),
 *      the server sends a `notifications/resources/updated` notification
 *   3. OpenClaw receives the notification and reads the resource for latest data
 *   4. OpenClaw calls `send_predicted_actions` to push predictions back
 *   5. The browser fetches predictions via GET /predictions
 *
 * Resources:
 *   pptist://context/live   — Full live context (selection + slide + history)
 *
 * Tools:
 *   get_current_context     — Same data as the resource, but pull-based
 *   get_server_status       — Connection health check
 *   send_predicted_actions  — Push predicted actions back to the frontend
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SubscribeRequestSchema, UnsubscribeRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { getLatestPayload, getStoreStatus, updatePredictions, clearPredictions } from './stateStore.js'
import { analyzeContext } from './analyzers.js'

const LIVE_CONTEXT_URI = 'pptist://context/live'

/**
 * Create and configure the MCP server with resources and notifications.
 */
export function createMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: 'pptist-mcp-server',
      version: '1.0.0',
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
      description: 'CRITICAL: Live PPTist editor context. You MUST SUBSCRIBE to this resource (`resources/subscribe`) to receive real-time notifications on every user action. Do NOT just read it once. Contains: geometric data, colors, selection, and history to detect contrast issues and misalignments.',
      mimeType: 'application/json',
    },
    async () => {
      const payload = getLatestPayload()

      if (!payload) {
        return {
          contents: [{
            uri: LIVE_CONTEXT_URI,
            mimeType: 'application/json',
            text: JSON.stringify({
              status: 'waiting',
              message: 'No context available yet. The user has not interacted with the editor.',
            }),
          }],
        }
      }

      const insights = analyzeContext(payload)

      return {
        contents: [{
          uri: LIVE_CONTEXT_URI,
          mimeType: 'application/json',
          text: JSON.stringify({
            triggerAction: payload.triggerAction,
            currentSelection: payload.currentSelection,
            currentSlide: payload.currentSlide,
            recentActions: payload.last5Actions,
            insights,
          }),
        }],
      }
    }
  )

  // ── Tool: get_current_context (kept for on-demand pull) ────────────────────
  server.tool(
    'get_current_context',
    'Get the full current context from PPTist on-demand. For continuous updates, subscribe to the pptist://context/live resource instead.',
    {},
    async () => {
      const payload = getLatestPayload()

      if (!payload) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ error: 'No context available yet.' }),
          }],
        }
      }

      const insights = analyzeContext(payload)

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            triggerAction: payload.triggerAction,
            currentSelection: payload.currentSelection,
            currentSlide: payload.currentSlide,
            recentActions: payload.last5Actions,
            insights,
          }, null, 2),
        }],
      }
    }
  )

  // ── Tool: get_server_status ────────────────────────────────────────────────
  server.tool(
    'get_server_status',
    'Check if the MCP server is receiving data from the PPTist browser.',
    {},
    async () => {
      const status = getStoreStatus()
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            connected: status.hasData,
            lastUpdated: status.lastUpdated ? new Date(status.lastUpdated).toISOString() : null,
            totalUpdates: status.updateCount,
          }, null, 2),
        }],
      }
    }
  )

  // ── Tool: send_predicted_actions ───────────────────────────────────────────
  // OpenClaw calls this to push its top-5 predicted actions back to the frontend.
  // Each prediction includes:
  //   - actionId:    unique identifier (from ACTION_CATALOGUE or custom)
  //   - label:       human-readable button text
  //   - description: tooltip text
  //   - confidence:  0.0–1.0 score
  //   - steps:       array of { command, args? } to execute sequentially on click
  server.tool(
    'send_predicted_actions',
    `Push up to 5 predicted next-actions back to the PPTist frontend. Each action can be a single command or a multi-step sequence. The frontend will display these as clickable buttons — pressing a button executes all steps in order.

STEP COMMANDS: Each step's "command" field should be one of:
  - An ACTION_CATALOGUE ID (e.g., "bold", "alignCenter", "duplicate", "deleteEl")
  - A store method: "updateElement" (requires args: { id, props })
  - A store method: "addElement" (requires args with element data)

EXAMPLES:
  Simple:  { "command": "bold" }
  With args: { "command": "updateElement", "args": { "id": "abc123", "props": { "fill": "#ff0000" } } }
  Multi-step: steps: [{ "command": "bold" }, { "command": "fontSizeUp" }, { "command": "changeTextColor" }]`,
    {
      predictions: z.array(
        z.object({
          actionId: z.string().describe('Unique identifier for this action'),
          label: z.string().describe('Human-readable button label (e.g., "Bold Text", "Fix Alignment")'),
          description: z.string().describe('Short description for tooltip'),
          confidence: z.number().min(0).max(1).describe('Confidence score between 0.0 and 1.0'),
          steps: z.array(
            z.object({
              command: z.enum([
                'bold', 'italic', 'underline', 'strikethrough', 'fontSizeUp', 'fontSizeDown', 'changeTextColor',
                'alignLeft', 'alignCenter', 'alignRight', 'alignTop', 'alignVertical', 'alignBottom',
                'bringToFront', 'sendToBack', 'bringForward', 'sendBackward',
                'duplicate', 'deleteEl',
                'flipHorizontal', 'flipVertical', 'fitToSlide',
                'editChartData',
                'insertTableRow', 'insertTableCol', 'deleteTableRow', 'deleteTableCol',
                'updateElement', 'addElement'
              ]).describe('Action ID or store method name to execute'),
              args: z.record(z.unknown()).optional().describe('Optional arguments for the command'),
            })
          ).min(1).describe('Sequence of commands to execute when the button is clicked'),
        })
      ).min(1).max(5).describe('Array of 1–5 predicted actions, ordered by confidence (highest first)'),
    },
    async ({ predictions }) => {
      // Validate and store
      const sorted = [...predictions].sort((a, b) => b.confidence - a.confidence)

      updatePredictions(sorted)

      console.error(`[MCP] Stored ${sorted.length} predicted actions:`)
      for (const p of sorted) {
        console.error(`  → ${p.actionId} (${(p.confidence * 100).toFixed(0)}%) "${p.label}" [${p.steps.length} step(s)]`)
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: `${sorted.length} predicted actions stored and available to the frontend.`,
            actionIds: sorted.map(p => p.actionId),
          }),
        }],
      }
    }
  )

  // ── Manual Subscription Handlers ───────────────────────────────────────────
  // The high-level McpServer class doesn't automatically handle these, so we 
  // register them directly on the underlying server to satisfy the capability.
  server.server.setRequestHandler(
    SubscribeRequestSchema, 
    async (request) => {
      // In a real app we'd track who subscribed to what, but here we just accept it
      return {}
    }
  )

  server.server.setRequestHandler(
    UnsubscribeRequestSchema, 
    async (request) => {
      return {}
    }
  )

  return server
}

/**
 * Send a notification to OpenClaw that the live context resource has been updated.
 * Called by the HTTP server every time CommunicationTriggers pushes new data.
 *
 * Also clears any stale predictions — the LLM should re-predict based on new context.
 */
export async function notifyContextUpdated(server: McpServer): Promise<void> {
  // Clear old predictions since context just changed
  clearPredictions()

  try {
    await server.server.sendResourceUpdated({ uri: LIVE_CONTEXT_URI })
    console.error(`[MCP] Sent notifications/resources/updated for ${LIVE_CONTEXT_URI}`)
  }
  catch (err) {
    // This can fail if no client is connected yet — that's fine
    console.error('[MCP] Could not send notification (client may not be connected):', (err as Error).message)
  }
}

