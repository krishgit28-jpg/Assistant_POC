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

interface PredictedAction {
  actionId: string
  label: string
  description: string
  confidence: number
  steps: PredictedStep[]
}

function generatePredictions(context: any): PredictedAction[] {
  const predictions: PredictedAction[] = []
  const selection = context.currentSelection || []
  const currentSlide = context.currentSlide || {}
  const insights = context.insights || {}
  const selectedCount = selection.length
  const primaryEl = selectedCount > 0 ? selection[0] : null

  // 1. High-priority checks from Insights
  if (insights.alignmentIssues && insights.alignmentIssues.length > 0) {
    predictions.push({
      actionId: 'fix_alignment_center',
      label: 'Center Align Elements',
      description: 'Align elements horizontally to resolve near-alignment discrepancy',
      confidence: 0.95,
      steps: [{ command: 'alignCenter' }],
    })
    predictions.push({
      actionId: 'fix_alignment_left',
      label: 'Left Align Elements',
      description: 'Snap elements to left boundary alignment',
      confidence: 0.90,
      steps: [{ command: 'alignLeft' }],
    })
  }

  if (insights.contrastIssues && insights.contrastIssues.length > 0) {
    predictions.push({
      actionId: 'improve_contrast_color',
      label: 'Enhance Text Contrast',
      description: 'Adjust text color to provide optimal legibility against slide background',
      confidence: 0.92,
      steps: [{ command: 'changeTextColor' }],
    })
  }

  // 2. Element-specific design recommendations
  if (primaryEl && primaryEl.type === 'text') {
    predictions.push({
      actionId: 'emphasize_heading',
      label: 'Bold & Enlarge',
      description: 'Make text bold and increase size for visual hierarchy',
      confidence: 0.88,
      steps: [{ command: 'bold' }, { command: 'fontSizeUp' }],
    })
    predictions.push({
      actionId: 'center_text_element',
      label: 'Center on Slide',
      description: 'Align selected text box to the horizontal center',
      confidence: 0.82,
      steps: [{ command: 'alignCenter' }],
    })
    predictions.push({
      actionId: 'duplicate_text',
      label: 'Duplicate Text Block',
      description: 'Duplicate this text block to keep styling consistent',
      confidence: 0.78,
      steps: [{ command: 'duplicate' }],
    })
    predictions.push({
      actionId: 'italicize_subtitle',
      label: 'Italicize',
      description: 'Apply italic styling for secondary emphasis',
      confidence: 0.72,
      steps: [{ command: 'italic' }],
    })
  } else if (primaryEl && (primaryEl.type === 'shape' || primaryEl.type === 'image')) {
    predictions.push({
      actionId: 'bring_to_front',
      label: 'Bring to Front',
      description: 'Elevate element layer above other objects',
      confidence: 0.88,
      steps: [{ command: 'bringToFront' }],
    })
    predictions.push({
      actionId: 'duplicate_element',
      label: 'Duplicate Element',
      description: 'Duplicate shape/image for visual repetition',
      confidence: 0.84,
      steps: [{ command: 'duplicate' }],
    })
    predictions.push({
      actionId: 'center_element',
      label: 'Center on Slide',
      description: 'Position element in the exact center',
      confidence: 0.80,
      steps: [{ command: 'alignCenter' }, { command: 'alignVertical' }],
    })
    predictions.push({
      actionId: 'flip_horizontal',
      label: 'Flip Horizontal',
      description: 'Mirror orientation horizontally',
      confidence: 0.70,
      steps: [{ command: 'flipHorizontal' }],
    })
  } else if (selectedCount > 1) {
    predictions.push({
      actionId: 'align_selection_center',
      label: 'Align Centers',
      description: 'Align all selected objects to their collective center',
      confidence: 0.93,
      steps: [{ command: 'alignCenter' }],
    })
    predictions.push({
      actionId: 'align_selection_left',
      label: 'Align Left Edges',
      description: 'Align all selected objects to the left margin',
      confidence: 0.89,
      steps: [{ command: 'alignLeft' }],
    })
    predictions.push({
      actionId: 'duplicate_selection',
      label: 'Duplicate All',
      description: 'Duplicate selected element cluster',
      confidence: 0.82,
      steps: [{ command: 'duplicate' }],
    })
  }

  // 3. Fallbacks to guarantee 5 distinct predictions
  const defaultActions: PredictedAction[] = [
    {
      actionId: 'align_horizontal_center',
      label: 'Center Align',
      description: 'Center align current selection',
      confidence: 0.65,
      steps: [{ command: 'alignCenter' }],
    },
    {
      actionId: 'bring_forward',
      label: 'Bring Forward',
      description: 'Move selected object one layer up',
      confidence: 0.60,
      steps: [{ command: 'bringForward' }],
    },
    {
      actionId: 'duplicate_item',
      label: 'Duplicate',
      description: 'Create a copy of selected element',
      confidence: 0.58,
      steps: [{ command: 'duplicate' }],
    },
    {
      actionId: 'fit_to_slide',
      label: 'Fit to Slide',
      description: 'Scale or position element to fit slide canvas',
      confidence: 0.55,
      steps: [{ command: 'fitToSlide' }],
    },
    {
      actionId: 'align_vertical_center',
      label: 'Align Vertically',
      description: 'Align element vertically to slide middle',
      confidence: 0.50,
      steps: [{ command: 'alignVertical' }],
    },
  ]

  for (const def of defaultActions) {
    if (!predictions.some((p) => p.actionId === def.actionId)) {
      predictions.push(def)
    }
    if (predictions.length >= 5) break
  }

  return predictions.slice(0, 5)
}

async function main() {
  console.log('🚀 [AI Design Assistant] Initializing OpenClaw PPTist Assistant...')

  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['tsx', 'src/index.ts'],
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

      if (!content || !content.text) {
        console.warn('⚠️ [AI Assistant] Resource content was empty.')
        return
      }

      const contextData = JSON.parse(content.text)
      console.log(`🎯 [AI Assistant] Context Action: ${contextData.triggerAction || 'unknown'}`)
      console.log(`🎯 [AI Assistant] Selected Elements: ${(contextData.currentSelection || []).length}`)

      // Generate 5 predicted actions
      const predictions = generatePredictions(contextData)
      console.log(`✨ [AI Assistant] Generated ${predictions.length} design predictions:`)
      for (const p of predictions) {
        console.log(`   - [${p.actionId}] "${p.label}" (${(p.confidence * 100).toFixed(0)}% conf)`)
      }

      // Send predictions via tool call
      console.log('📤 [AI Assistant] Calling send_predicted_actions...')
      const toolResult = await client.callTool({
        name: 'send_predicted_actions',
        arguments: { predictions },
      })

      console.log('✅ [AI Assistant] Predictions dispatched to frontend successfully!')
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
