import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { ResourceUpdatedNotificationSchema } from '@modelcontextprotocol/sdk/types.js'

async function main() {
  console.log('🤖 [Test Client] Starting dummy MCP client (simulating OpenClaw)...')

  // The client starts the MCP server as a child process using stdio
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['tsx', 'src/index.ts'],
    stderr: 'inherit', // Let the server's console.error print to our terminal so we can see its logs
  })

  const client = new Client(
    {
      name: 'dummy-mcp-client',
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  )

  // Listen for the resource updated notification
  client.setNotificationHandler(ResourceUpdatedNotificationSchema, async (notification: any) => {
    const uri = notification.params.uri
    console.log(`\n🔔 [Test Client] Received notification that resource changed: ${uri}`)

    try {
      console.log('🔄 [Test Client] Fetching the updated resource...')
      const result = await client.readResource({ uri })
      
      const content = result.contents[0]
      if (content.mimeType === 'application/json' && content.text) {
        // Parse and pretty-print the JSON
        const parsed = JSON.parse(content.text)
        console.log('📦 [Test Client] Fresh context received:')
        console.dir(parsed, { depth: null, colors: true })
      } else {
        console.log('📦 [Test Client] Resource content:', content)
      }
    } catch (err) {
      console.error('❌ [Test Client] Failed to read resource:', err)
    }
  })

  await client.connect(transport)
  console.log('✅ [Test Client] Connected to MCP server successfully!')

  // Subscribe to the live context resource
  const LIVE_CONTEXT_URI = 'pptist://context/live'
  console.log(`📡 [Test Client] Subscribing to resource: ${LIVE_CONTEXT_URI}`)
  await client.subscribeResource({ uri: LIVE_CONTEXT_URI })
  
  console.log('\n⏳ [Test Client] Waiting for user actions in the PPTist browser...\n')
}

main().catch(err => {
  console.error('[Test Client] Fatal error:', err)
  process.exit(1)
})
