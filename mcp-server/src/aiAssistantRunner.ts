import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { ResourceUpdatedNotificationSchema } from '@modelcontextprotocol/sdk/types.js'

interface PredictedStep {
  command:
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'fontSizeUp'
  | 'fontSizeDown'
  | 'changeTextColor'
  | 'alignLeft'
  | 'alignCenter'
  | 'alignRight'
  | 'alignTop'
  | 'alignVertical'
  | 'alignBottom'
  | 'bringToFront'
  | 'sendToBack'
  | 'bringForward'
  | 'sendBackward'
  | 'duplicate'
  | 'deleteEl'
  | 'flipHorizontal'
  | 'flipVertical'
  | 'fitToSlide'
  | 'editChartData'
  | 'insertTableRow'
  | 'insertTableCol'
  | 'deleteTableRow'
  | 'deleteTableCol'
  | 'updateElement'
  | 'addElement'
  args?: Record<string, unknown>
}

interface AiSuggestion {
  id: string
  type: 'action_sequence' | 'design_option'
  label: string
  description: string
  confidence: number
  steps?: PredictedStep[]
  updatedElements?: any[]
}

const SYSTEM_PROMPT = `You are a real-time AI design assistant for the PPTist slide editor. 
You will receive the user's current editor state (selection, geometry, recent actions, and calculated insights).
Your job is to analyze this state and return an array of up to 5 intelligent design suggestions.

SUGGESTION TYPES:
1. "action_sequence": A sequence of small formatting commands.
2. "design_option": A major overhaul pushing fully updated element states directly.

VALID COMMANDS for action_sequence steps:
bold, italic, underline, strikethrough, fontSizeUp, fontSizeDown, changeTextColor,
alignLeft, alignCenter, alignRight, alignTop, alignVertical, alignBottom, alignGroupLeft,
bringToFront, sendToBack, bringForward, sendBackward, duplicate, deleteEl,
flipHorizontal, flipVertical, fitToSlide, updateElement, addElement

OUTPUT FORMAT:
Return ONLY a valid JSON array of objects matching this schema (do NOT wrap in markdown \`\`\`json):
[
  {
    "id": "unique-string",
    "type": "action_sequence" | "design_option",
    "label": "Short Action Name",
    "description": "Why you are suggesting this",
    "confidence": 0.95,
    "steps": [{ "command": "bold" }], // if type is action_sequence
    "updatedElements": [{ "id": "elemId", "props": { "fill": "#000" } }] // if type is design_option
  }
]

CRITICAL STRATEGY: 
If the 'insights' object contains alignmentIssues or contrastIssues, your #1 suggestion MUST be a sequence to fix them!`

async function generateSmartPredictions(context: any): Promise<AiSuggestion[]> {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'YOUR_GEMINI_API_KEY_HERE'
  const MODEL = 'gemini-3.8-flash'

  if (GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY_HERE') {
    console.warn('⚠️ [AI Assistant] GEMINI_API_KEY is not set! Falling back to empty predictions.')
    return []
  }

  console.log('🧠 [AI Assistant] Asking Gemini to analyze context...')

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: JSON.stringify(context, null, 2) }] }],
        generationConfig: {
          temperature: 0.2,
          response_mime_type: 'application/json',
        }
      })
    })

    if (!response.ok) {
      console.error('❌ [AI Assistant] Gemini API Error:', await response.text())
      return []
    }

    const data = await response.json()
    const textOutput = data.candidates?.[0]?.content?.parts?.[0]?.text

    if (!textOutput) {
      console.error('❌ [AI Assistant] Gemini returned empty response.')
      return []
    }

    const predictions: AiSuggestion[] = JSON.parse(textOutput)
    return predictions.slice(0, 5)
  } catch (err) {
    console.error('❌ [AI Assistant] Failed to call Gemini:', err)
    return []
  }
}

async function main() {
  console.log('🚀 [AI Design Assistant] Initializing OpenClaw PPTist Assistant...')

  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['tsx', 'mcp-server/src/index.ts'],
    stderr: 'inherit',
  })

  const client = new Client(
    {
      name: 'openclaw-pptist-assistant',
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  )

  const LIVE_CONTEXT_URI = 'pptist://context/live'
  let notificationCount = 0

  // Register notification handler BEFORE connecting
  client.setNotificationHandler(ResourceUpdatedNotificationSchema, async (notification: any) => {
    notificationCount++
    const uri = notification.params.uri
    console.log(`\n🔔 [AI Assistant] Notification #${notificationCount}: Resource updated (${uri})`)

    try {
      console.log('📖 [AI Assistant] Reading live context from pptist://context/live...')
      const res = await client.readResource({ uri: LIVE_CONTEXT_URI })
      const content = res.contents[0]

      if (!content || !('text' in content) || typeof content.text !== 'string') {
        console.warn('⚠️ [AI Assistant] Resource content was empty or not text.')
        return
      }

      const contextData = JSON.parse(content.text)
      console.log(`🎯 [AI Assistant] Context Action: ${contextData.triggerAction || 'unknown'}`)
      console.log(`🎯 [AI Assistant] Selected Elements: ${(contextData.currentSelection || []).length}`)

      // Generate 5 predicted actions via Gemini
      const suggestions = await generateSmartPredictions(contextData)
      console.log(`✨ [AI Assistant] Generated ${suggestions.length} design suggestions:`)
      for (const p of suggestions) {
        console.log(`   - [${p.id}] "${p.label}" (${(p.confidence * 100).toFixed(0)}% conf)`)
      }

      // Send predictions via tool call
      console.log('📤 [AI Assistant] Calling send_ai_suggestions...')
      const toolResult = await client.callTool({
        name: 'send_ai_suggestions',
        arguments: { suggestions },
      })

      console.log('✅ [AI Assistant] Suggestions dispatched to frontend successfully!')
    } catch (err) {
      console.error('❌ [AI Assistant] Error handling notification:', err)
    }
  })

  await client.connect(transport)
  console.log('🔗 [AI Assistant] Connected to PPTist MCP Server.')

  // Step 1: Subscribe ONCE
  console.log(`📡 [AI Assistant] Subscribing to ${LIVE_CONTEXT_URI}...`)
  await client.subscribeResource({ uri: LIVE_CONTEXT_URI })
  console.log('✅ [AI Assistant] Subscribed to pptist://context/live successfully.')

  // Step 2: Waiting for first user interaction (NO predictions yet)
  console.log('⏳ [AI Assistant] Waiting for user action in PPTist editor... (Do NOT predict yet)\n')
}

main().catch((err) => {
  console.error('Fatal assistant error:', err)
  process.exit(1)
})
