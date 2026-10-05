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
import { getLatestPayload, getStoreStatus, updateSuggestions, clearSuggestions } from './stateStore.js'
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

  // ── Tool: send_ai_suggestions ───────────────────────────────────────────
  // OpenClaw calls this to push up to 5 suggestions back to the frontend.
  // Each suggestion can EITHER be a sequence of commands OR a complete state update.
  server.tool(
    'send_ai_suggestions',
    `Push up to 5 AI suggestions back to the PPTist frontend.
Each suggestion can either be a sequence of commands (type: 'action_sequence') 
OR a full element state update (type: 'design_option') for major overhauls.

STEP COMMANDS (for action_sequence):
  - An ACTION_CATALOGUE ID (e.g., "bold", "alignCenter", "duplicate", "deleteEl")
  - A store method: "updateElement" (requires args: { id, props })
  - A store method: "addElement" (requires args with element data)`,
    {
      suggestions: z.array(
        z.object({
          id: z.string().describe('Unique identifier for this suggestion'),
          type: z.enum(['action_sequence', 'design_option']).describe('The type of this suggestion'),
          label: z.string().describe('Human-readable button label (e.g., "Bold Text", "Modern Dark Theme")'),
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
                'updateElement', 'addElement', 'updateTextContent', 'generateSubtitle', 'alignGroupLeft'
              ]).describe('Action ID or store method name to execute'),
              args: z.record(z.unknown()).optional().describe('Optional arguments for the command'),
            })
          ).optional().describe('Sequence of commands to execute (required if type is action_sequence)'),
          updatedElements: z.array(
            z.object({
              id: z.string().describe('Target element ID to update'),
              props: z.record(z.unknown()).describe('The full set of updated properties to apply to this element')
            })
          ).optional().describe('Array of element state updates (required if type is design_option)'),
        })
      ).min(1).max(5).describe('Array of 1–5 suggestions, ordered by confidence (highest first)'),
    },
    async ({ suggestions }) => {
      // Validate and store
      const sorted = [...suggestions].sort((a, b) => b.confidence - a.confidence)

      updateSuggestions(sorted)

      console.error(`[MCP] Stored ${sorted.length} AI suggestions:`)
      for (const p of sorted) {
        console.error(`  → ${p.id} [${p.type}] (${(p.confidence * 100).toFixed(0)}%) "${p.label}"`)
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: `${sorted.length} suggestions stored and available to the frontend.`,
            suggestionIds: sorted.map(p => p.id),
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

