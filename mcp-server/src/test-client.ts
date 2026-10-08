import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { ResourceUpdatedNotificationSchema } from '@modelcontextprotocol/sdk/types.js'

interface AiSuggestion {
  id: string
  type: 'action_sequence' | 'design_option'
  label: string
  description: string
  confidence: number
  steps?: Array<{ command: string; args?: Record<string, unknown> }>
}

function generateSuggestionsFromContext(context: any): AiSuggestion[] {
  const suggestions: AiSuggestion[] = []
  const selection = context.currentSelection || []
  const insights = context.insights || {}
  const hasText = selection.some((el: any) => el.type === 'text')
  const hasMultiple = selection.length > 1

  // 1. If alignment issues detected
  if (insights.alignmentIssues && insights.alignmentIssues.length > 0) {
    suggestions.push({
      id: `align-fix-${Date.now()}`,
      type: 'action_sequence',
      label: 'Align Elements',
      description: insights.alignmentIssues[0],
      confidence: 0.96,
      steps: [{ command: 'alignLeft' }],
    })
  }

  // 2. If contrast issues detected
  if (insights.contrastIssues && insights.contrastIssues.length > 0) {
    suggestions.push({
      id: `contrast-fix-${Date.now()}`,
      type: 'action_sequence',
      label: 'Fix Text Contrast',
      description: insights.contrastIssues[0],
      confidence: 0.94,
      steps: [{ command: 'changeTextColor', args: { color: '#111827' } }],
    })
  }

  // 3. Selection-based suggestions
  if (hasText) {
    suggestions.push({
      id: `bold-${Date.now()}`,
      type: 'action_sequence',
      label: 'Bold Text',
      description: 'Make the selected text bold for visual hierarchy',
      confidence: 0.88,
      steps: [{ command: 'bold' }],
    })
    suggestions.push({
      id: `fontsize-${Date.now()}`,
      type: 'action_sequence',
      label: 'Increase Font Size',
      description: 'Increase font size of selected text',
      confidence: 0.82,
      steps: [{ command: 'fontSizeUp' }],
    })
  }

  if (hasMultiple) {
    suggestions.push({
      id: `align-center-${Date.now()}`,
      type: 'action_sequence',
      label: 'Center Horizontally',
      description: 'Center align elements to the slide canvas',
      confidence: 0.85,
      steps: [{ command: 'alignCenter' }],
    })
  } else if (selection.length === 1) {
    suggestions.push({
      id: `duplicate-${Date.now()}`,
      type: 'action_sequence',
      label: 'Duplicate Element',
      description: 'Create a copy of the selected element',
      confidence: 0.80,
      steps: [{ command: 'duplicate' }],
    })
    suggestions.push({
      id: `center-canvas-${Date.now()}`,
      type: 'action_sequence',
      label: 'Center on Slide',
      description: 'Center the element horizontally on the canvas',
      confidence: 0.78,
      steps: [{ command: 'alignCenter' }],
    })
  }

  // Fallback if empty
  if (suggestions.length === 0) {
    suggestions.push({
      id: `default-center-${Date.now()}`,
      type: 'action_sequence',
      label: 'Center Elements',
      description: 'Center align to canvas',
      confidence: 0.75,
      steps: [{ command: 'alignCenter' }],
    })
  }

  return suggestions.slice(0, 5)
}

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
      if (content.mimeType === 'application/json' && 'text' in content && content.text) {
        // Parse and pretty-print the JSON
        const parsed = JSON.parse(content.text)
        console.log('📦 [Test Client] Fresh context received:')
        console.log(`- Trigger: ${parsed.triggerAction}`)
        console.log(`- Selection: ${(parsed.currentSelection || []).length} element(s)`)
        if (parsed.insights) {
          console.log('- Insights:', JSON.stringify(parsed.insights, null, 2))
        }

        // Generate suggestions from context & insights
        const suggestions = generateSuggestionsFromContext(parsed)
        console.log(`✨ [Test Client] Generated ${suggestions.length} suggestions. Checking tools...`)

        // List available tools (they become available once PPTist has pushed specs)
        const toolList = await client.listTools()
        const toolNames = toolList.tools.map(t => t.name)

        if (toolNames.includes('send_ai_suggestions')) {
          console.log(`📤 [Test Client] Calling send_ai_suggestions with ${suggestions.length} items...`)
          await client.callTool({
            name: 'send_ai_suggestions',
            arguments: { suggestions },
          })
          console.log('✅ [Test Client] Successfully pushed suggestions to PPTist!')
        } else {
          console.warn('⚠️ [Test Client] "send_ai_suggestions" not available yet (waiting for client specs).')
        }
      } else {
        console.log('📦 [Test Client] Resource content:', content)
      }
    } catch (err) {
      console.error('❌ [Test Client] Failed to process notification:', err)
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
