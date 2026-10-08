/**
 * End-to-end smoke test: MCP client <-> MCP server <-> SDK bridge (fake host app).
 *
 *   npx tsx scripts/smoke-test.ts
 *
 * Verifies: bootstrap tool surface, specs ingestion -> operational tools,
 * tools/list_changed notification, live context with heuristic + ML insights,
 * execute_canvas_action round trip through the ActionSupplier, register_dynamic_tool.
 */

import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js'
import { McpBridgeClient, type CanvasState, type ClientSpecs } from '@pptist/sdk'

const PORT = process.env.MCP_HTTP_PORT ?? '3199'
const executed: string[] = []
const listeners = new Set<(s: CanvasState) => void>()

const specs: ClientSpecs = {
  appName: 'FakeHost', appVersion: '0.0.1', documentation: 'Test host.',
  capabilities: ['state.push', 'actions.execute'], schemas: { element: { type: 'object' } },
  actions: [
    { id: 'alignLeft', label: 'Align Left', description: 'Align left', applicableTo: ['any'] },
    { id: 'bold', label: 'Bold', description: 'Bold text', applicableTo: ['text'] },
  ],
}

const snapshot = (): CanvasState => {
  const els = [
    { id: 'a', type: 'text', left: 100, top: 20, width: 600, height: 60, defaultColor: '#fefefe', defaultFontName: 'X', defaultSize: '40px', content: 'Title' },
    { id: 'b', type: 'text', left: 102, top: 200, width: 400, height: 200, defaultColor: '#111111', defaultFontName: 'X', defaultSize: '20px', content: 'Body' },
    { id: 'c', type: 'image', left: 600, top: 200, width: 300, height: 250 },
  ]
  return { trigger: 'updateElement', selection: els.slice(0, 2), slide: { id: 's1', elements: els }, history: [] }
}

const bridge = new McpBridgeClient({
  baseUrl: `http://localhost:${PORT}`,
  commandPollMs: 200,
  state: { getSnapshot: snapshot, subscribe: (l) => { listeners.add(l); return () => listeners.delete(l) } },
  actions: {
    listActions: () => specs.actions,
    execute: (command) => { executed.push(command); return { ok: true } },
  },
  schema: { getSpecs: () => specs },
})

const transport = new StdioClientTransport({
  command: 'npx', args: ['tsx', 'src/index.ts'], stderr: 'pipe',
  env: { ...process.env as Record<string, string>, MCP_HTTP_PORT: PORT },
})
const client = new Client({ name: 'smoke', version: '1.0.0' }, { capabilities: {} })
let listChanged = 0
client.setNotificationHandler(ToolListChangedNotificationSchema, async () => { listChanged++ })

const names = async () => (await client.listTools()).tools.map(t => t.name).sort()
const call = async (name: string, args: Record<string, unknown> = {}) =>
  JSON.parse(((await client.callTool({ name, arguments: args })).content as Array<{ text: string }>)[0].text)

try {
  await client.connect(transport)
  await new Promise(r => setTimeout(r, 1500)) // let the HTTP server bind

  const boot = await names()
  console.log('bootstrap tools:', boot)
  assert.deepEqual(boot, ['get_server_status', 'ingest_client_specs', 'register_dynamic_tool'])

  bridge.start() // ingests specs, pushes the initial snapshot
  await new Promise(r => setTimeout(r, 1500))

  const ops = await names()
  console.log('operational tools:', ops)
  assert.ok(ops.includes('send_ai_suggestions') && ops.includes('execute_canvas_action'))
  assert.ok(listChanged > 0, 'expected notifications/tools/list_changed')
  console.log('tools/list_changed received x', listChanged)

  const ctx = JSON.parse((await client.readResource({ uri: 'pptist://context/live' })).contents[0].text as string)
  console.log('insights:', JSON.stringify(ctx.insights, null, 1))
  assert.ok(ctx.insights.alignmentIssues.length > 0, 'heuristic alignment insight')
  assert.ok(ctx.insights.contrastIssues.length > 0, 'heuristic contrast insight')
  assert.ok(ctx.insights.ml?.elementRoles.length === 3, 'ML insight present')

  const exec = await call('execute_canvas_action', { command: 'alignLeft' })
  assert.equal(exec.success, true)
  assert.deepEqual(executed, ['alignLeft'])

  assert.equal((await call('register_dynamic_tool', { name: 'make_bold', description: 'Bold it', command: 'bold' })).success, true)
  assert.equal((await call('make_bold')).success, true)
  assert.deepEqual(executed, ['alignLeft', 'bold'])
  assert.equal((await call('register_dynamic_tool', { name: 'bad', description: 'x', command: 'nope' })).error?.includes('Unknown command'), true)

  const sugg = await call('send_ai_suggestions', { suggestions: [{ id: '1', type: 'action_sequence', label: 'L', description: 'd', confidence: 0.9, steps: [{ command: 'alignLeft' }] }] })
  assert.equal(sugg.success, true)

  console.log('\n✅ smoke test passed')
}
finally {
  bridge.stop()
  await client.close()
}
