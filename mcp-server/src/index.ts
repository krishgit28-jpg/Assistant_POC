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
  // 1. Create the MCP server in bootstrap mode (resource + configuration tools only)
  console.error('[Main] Creating MCP server (bootstrap mode)...')
  const runtime = createMcpServer()

  // 2. Start the HTTP server; it ingests client specs and sends MCP notifications
  console.error('[Main] Starting HTTP server...')
  startHttpServer(runtime)

  // 3. Connect the MCP server to stdio for OpenClaw communication
  console.error('[Main] Connecting MCP server to stdio transport...')
  const transport = new StdioServerTransport()
  await runtime.mcpServer.connect(transport)

  console.error('[Main] PPTist MCP Server is ready (bootstrap mode)!')
  console.error('[Main] - Bootstrap tools: ingest_client_specs, register_dynamic_tool, get_server_status')
  console.error('[Main] - HTTP: POST http://localhost:3100/specs (client SchemaSupplier → generates operational tools)')
  console.error('[Main] - HTTP: POST http://localhost:3100/context (client StateSupplier pushes)')
  console.error('[Main] - HTTP: GET  http://localhost:3100/suggestions (browser fetches AI suggestions)')
  console.error('[Main] - MCP Resource: pptist://context/live (subscribe for live updates)')
  console.error('[Main] - After ingestion: send_ai_suggestions, execute_canvas_action, get_current_context, describe_client_capabilities')
}

main().catch((err) => {
  console.error('[Main] Fatal error:', err)
  process.exit(1)
})
