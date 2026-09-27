#!/usr/bin/env node
/**
 * PPTist MCP Server — Entry Point
 *
 * Starts two things simultaneously:
 *   1. MCP stdio server — exposes resources + tools for OpenClaw's MCP client
 *   2. HTTP server (port 3100) — receives context pushes from the browser
 *
 * Flow:
 *   Browser (PPTist) --HTTP POST--> httpServer --> stateStore + notification
 *   OpenClaw         --MCP stdio--> mcpServer  --> reads stateStore
 *
 * Usage:
 *   npx tsx src/index.ts        (development)
 *   node dist/index.js          (production, after `npm run build`)
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createMcpServer } from './mcpServer.js'
import { startHttpServer } from './httpServer.js'

async function main() {
  // 1. Create the MCP server (with resource + tool definitions)
  console.error('[Main] Creating MCP server...')
  const mcpServer = createMcpServer()

  // 2. Start the HTTP server, passing the MCP server so it can send notifications
  console.error('[Main] Starting HTTP server...')
  startHttpServer(mcpServer)

  // 3. Connect the MCP server to stdio for OpenClaw communication
  console.error('[Main] Connecting MCP server to stdio transport...')
  const transport = new StdioServerTransport()
  await mcpServer.connect(transport)

  console.error('[Main] PPTist MCP Server is ready!')
  console.error('[Main] - HTTP: POST http://localhost:3100/context (browser pushes)')
  console.error('[Main] - HTTP: GET  http://localhost:3100/predictions (browser fetches AI predictions)')
  console.error('[Main] - MCP Resource: pptist://context/live (subscribe for live updates)')
  console.error('[Main] - MCP Tools: get_current_context, get_server_status, send_predicted_actions')
}

main().catch((err) => {
  console.error('[Main] Fatal error:', err)
  process.exit(1)
})
