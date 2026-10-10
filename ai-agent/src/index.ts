import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { ResourceUpdatedNotificationSchema } from '@modelcontextprotocol/sdk/types.js'

// Load GEMINI_API_KEY etc. from ai-agent/.env or the repo-root .env (first found wins)
for (const p of ['.env', '../.env']) {
  try { process.loadEnvFile(p); break } catch { /* try next */ }
}

interface AiSuggestion {
  id: string
  type: 'action_sequence' | 'design_option'
  label: string
  description: string
  confidence: number
  steps?: { command: string; args?: Record<string, unknown> }[]
  updatedElements?: any[]
}

let SYSTEM_PROMPT = ''

function buildSystemPrompt(specs: any) {
  const commands = specs.actions?.map((a: any) => a.id).join(', ') || ''
  SYSTEM_PROMPT = `You are a real-time AI design assistant for the ${specs.appName || 'application'}. 
You will receive the user's current editor state (selection, geometry, recent actions, and insights).
Your job is to analyze this state and return an array of up to 5 intelligent design suggestions.

SUGGESTION TYPES:
1. "action_sequence": A sequence of small formatting or architectural commands.
2. "design_option": A major overhaul pushing fully updated element states directly.

VALID COMMANDS for action_sequence steps:
${commands}

OUTPUT FORMAT:
Return ONLY a valid JSON array of objects matching this schema (do NOT wrap in markdown \`\`\`json):
[
  {
    "id": "unique-string",
    "type": "action_sequence" | "design_option",
    "label": "Short Action Name",
    "description": "Why you are suggesting this",
    "confidence": 0.95,
    "steps": [{ "command": "${specs.actions?.[0]?.id || 'command'}" }],
    "updatedElements": [{ "id": "elemId", "props": { "fill": "#000" } }]
  }
]

CRITICAL STRATEGY:
Analyze the context carefully. If there are hints or architectural suggestions provided, prioritize generating a sequence to implement them.
${specs.documentation || ''}
`
}

async function generateSmartPredictions(context: any): Promise<AiSuggestion[]> {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'YOUR_GEMINI_API_KEY_HERE'
  const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash'

  if (GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY_HERE') {
    console.warn('⚠️ [Generic AI Client] GEMINI_API_KEY is not set! Returning empty predictions.')
    return []
  }

  console.log(`🧠 [Generic AI Client] Asking Gemini to analyze context...`)

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: JSON.stringify(context, null, 2) }] }],
        generationConfig: {
          temperature: 0.4,
          response_mime_type: 'application/json',
        }
      })
    })

    if (!response.ok) {
      console.error('❌ [Generic AI Client] Gemini API Error:', await response.text())
      return []
    }

    const data = await response.json()
    const textOutput = data.candidates?.[0]?.content?.parts?.[0]?.text

    if (!textOutput) {
      console.error('❌ [Generic AI Client] Gemini returned empty response.')
      return []
    }

    const parsed = JSON.parse(textOutput)
    const predictions: AiSuggestion[] = Array.isArray(parsed) ? parsed : (parsed.suggestions ?? [])
    return predictions.slice(0, 5).map((p, i) => ({
      ...p,
      id: p.id || `ai-${Date.now()}-${i}`,
      confidence: typeof p.confidence === 'number' ? p.confidence : 0.5,
    }))
  } catch (err) {
    console.error('❌ [Generic AI Client] Failed to call Gemini:', err)
    return []
  }
}

async function main() {
  console.log('🚀 [Generic AI Client] Initializing Universal MCP Assistant...')

  // Spawns our generic openclaw-mcp-server we just ported over
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['tsx', '../mcp-server/src/index.ts'],
    stderr: 'inherit',
  })

  const client = new Client(
    { name: 'universal-ai-client', version: '1.0.0' },
    { capabilities: {} }
  )

  let LIVE_CONTEXT_URI: string | null = null
  let isOperational = false

  client.setNotificationHandler(ResourceUpdatedNotificationSchema, async (notification: any) => {
    const uri = notification.params.uri
    if (uri !== LIVE_CONTEXT_URI) return
    
    console.log(`\n🔔 [Generic AI Client] Resource updated (${uri})`)

    try {
      const res = await client.readResource({ uri })
      const content = res.contents[0]

      if (!content || !('text' in content) || typeof content.text !== 'string') return

      const contextData = JSON.parse(content.text)
      
      const suggestions = await generateSmartPredictions(contextData)
      console.log(`✨ [Generic AI Client] Generated ${suggestions.length} design suggestions. Sending to UI...`)
      if (suggestions.length === 0) return

      const result: any = await client.callTool({
        name: 'send_ai_suggestions',
        arguments: { suggestions },
      })
      if (result.isError) {
        console.error('❌ [Generic AI Client] send_ai_suggestions rejected:', JSON.stringify(result.content))
        return
      }
      console.log('✅ Suggestions dispatched successfully!')
    } catch (err) {
      console.error('❌ [Generic AI Client] Error handling notification:', err)
    }
  })

  await client.connect(transport)
  console.log('🔗 [Generic AI Client] Connected to MCP Server.')

  // Polling loop to wait for dynamic tools / specs to become available
  const checkInterval = setInterval(async () => {
    try {
      const toolsRes = await client.listTools()
      const tools = toolsRes.tools.map(t => t.name)

      if (tools.includes('describe_client_capabilities') && !isOperational) {
        isOperational = true
        clearInterval(checkInterval)

        console.log('📖 [Generic AI Client] Server is operational. Fetching client specs...')
        const capsRes = await client.callTool({ name: 'describe_client_capabilities' })
        const specsText = ((capsRes as any).content[0] as any).text
        const specs = JSON.parse(specsText)

        buildSystemPrompt(specs)
        console.log(`✅ [Generic AI Client] Prompt dynamically configured for ${specs.appName} v${specs.appVersion}`)

        // Find and subscribe to the live context resource
        const resources = await client.listResources()
        const liveResource = resources.resources.find(r => r.uri.endsWith('/context/live'))
        
        if (liveResource) {
          LIVE_CONTEXT_URI = liveResource.uri
          console.log(`📡 [Generic AI Client] Subscribing to ${LIVE_CONTEXT_URI}...`)
          await client.subscribeResource({ uri: LIVE_CONTEXT_URI })
          console.log(`✅ [Generic AI Client] Ready! Waiting for user interactions in ${specs.appName}...`)
        } else {
          console.error('❌ [Generic AI Client] Could not find a /context/live resource.')
        }
      }
    } catch (e) {
      // Ignore polling errors while server is booting or waiting for host app
    }
  }, 2000)
}

main().catch((err) => {
  console.error('Fatal assistant error:', err)
  process.exit(1)
})
