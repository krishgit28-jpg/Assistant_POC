import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
const server = new McpServer(
  { name: 'test', version: '1' },
  { capabilities: { resources: { subscribe: true } } }
)
console.log(JSON.stringify(server.server.capabilities, null, 2))
