/**
 * HTTP Server — Receives context from the browser (CommunicationTriggers)
 *             — Serves predictions to the browser (from OpenClaw via MCP)
 *
 * Runs alongside the MCP stdio server on a configurable port.
 * When new context arrives, it:
 *   1. Updates the state store
 *   2. Sends an MCP notification so OpenClaw knows to read the updated resource
 *
 * When the browser requests predictions, it:
 *   1. Returns the latest predictions from the state store (set by OpenClaw)
 *
 * Uses Node.js built-in http module (no Express dependency needed).
 */

import http from 'node:http'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { MCPPayload } from './types.js'
import { updateState, getLatestPredictions } from './stateStore.js'
import { notifyContextUpdated } from './mcpServer.js'

const PORT = parseInt(process.env.MCP_HTTP_PORT ?? '3100', 10)

/**
 * Start the HTTP server that receives browser context pushes
 * and serves AI predictions back to the browser.
 * Accepts the MCP server instance so it can trigger notifications.
 */
export function startHttpServer(mcpServer: McpServer): http.Server {
  const server = http.createServer(async (req, res) => {
    // CORS headers — allow browser fetch() from localhost:5173
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    // POST /context — receive payload from CommunicationTriggers
    if (req.method === 'POST' && req.url === '/context') {
      try {
        const body = await readBody(req)
        const payload: MCPPayload = JSON.parse(body)

        // Validate basic structure
        if (!payload.triggerAction || !payload.currentSlide) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Invalid payload: missing triggerAction or currentSlide' }))
          return
        }

        // 1. Store the latest context
        updateState(payload)

        // 2. Notify OpenClaw that the resource has been updated
        await notifyContextUpdated(mcpServer)

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'ok' }))
      }
      catch (err) {
        console.error('[HTTP] Failed to process request:', err)
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid JSON body' }))
      }
      return
    }

    // GET /predictions — serve latest AI predictions to the browser
    if (req.method === 'GET' && req.url === '/predictions') {
      const predictions = getLatestPredictions()

      if (!predictions) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          predictions: [],
          timestamp: null,
          message: 'No predictions available yet. Waiting for the AI to analyze context.',
        }))
        return
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(predictions))
      return
    }

    // GET /health — simple health check
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok', server: 'pptist-mcp-server' }))
      return
    }

    // 404 for anything else
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))
  })

  server.listen(PORT, () => {
    console.error(`[HTTP] Listening on http://localhost:${PORT}`)
    console.error(`[HTTP] POST /context      — receive browser context`)
    console.error(`[HTTP] GET  /predictions  — serve AI predictions to browser`)
    console.error(`[HTTP] GET  /health       — health check`)
  })

  return server
}

/**
 * Read the full body of an incoming HTTP request.
 */
function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString()))
    req.on('error', reject)
  })
}

