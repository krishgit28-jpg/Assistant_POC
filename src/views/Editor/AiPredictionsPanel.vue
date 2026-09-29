<template>
  <div class="ai-predictions-panel">
    <div class="panel-header">
      <div class="ai-badge">
        <i-icon-park-outline:magic class="badge-icon" />
        <span>AI Predictions</span>
      </div>
      <div class="status-dot" :class="{ active: predictions.length > 0, loading: isPolling }" />
    </div>

    <div class="panel-body">
      <!-- Loading / waiting state -->
      <div v-if="predictions.length === 0" class="empty-state">
        <div class="empty-icon">
          <i-icon-park-outline:robot-one />
        </div>
        <p class="empty-title">Waiting for AI</p>
        <p class="empty-desc">
          Select an element on the slide. The AI will analyze your context and suggest actions.
        </p>
        <div v-if="isPolling" class="polling-indicator">
          <span class="pulse-dot" />
          <span class="polling-text">Listening for predictions...</span>
        </div>
      </div>

      <!-- Prediction cards -->
      <div v-else class="predictions-list">
        <button
          v-for="(pred, index) in predictions"
          :key="pred.id"
          class="prediction-card"
          :class="{ executing: executingId === pred.id }"
          :style="{ '--delay': `${index * 60}ms` }"
          @click="executePrediction(pred)"
          @mouseenter="handleMouseEnter(pred)"
          @mouseleave="handleMouseLeave"
        >
          <div class="card-header">
            <span class="card-rank">#{{ index + 1 }}</span>
            <span class="confidence-badge">
              {{ Math.round(pred.confidence * 100) }}%
            </span>
          </div>

          <div class="card-label">{{ pred.label }}</div>

          <div class="card-description">{{ pred.description }}</div>

          <div v-if="pred.type === 'action_sequence' && pred.steps" class="card-steps">
            <div class="steps-label">
              <i-icon-park-outline:list class="steps-icon" />
              {{ pred.steps.length }} step{{ pred.steps.length > 1 ? 's' : '' }}
            </div>
            <div
              v-for="(step, si) in pred.steps"
              :key="si"
              class="step-item"
            >
              <span class="step-number">{{ si + 1 }}.</span>
              <span class="step-command">{{ formatCommand(step.command) }}</span>
              <span v-if="step.args" class="step-args">
                {{ formatArgs(step.args) }}
              </span>
            </div>
          </div>
          
          <div v-else-if="pred.type === 'design_option' && pred.updatedElements" class="card-steps">
            <div class="steps-label">
              <i-icon-park-outline:magic class="steps-icon" />
              Design Overhaul ({{ pred.updatedElements.length }} element{{ pred.updatedElements.length > 1 ? 's' : '' }})
            </div>
          </div>

          <div v-if="executingId === pred.id" class="executing-overlay">
            <i-icon-park-outline:check-one class="done-icon" />
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useStepExecutor } from '@/services/stepExecutor'
import type { ExecutableStep } from '@/services/stepExecutor'
import { useSlidesStore, useMainStore } from '@/store'
import type { Slide } from '@/types/slides'

interface AiSuggestion {
  id: string
  type: 'action_sequence' | 'design_option'
  label: string
  description: string
  confidence: number
  steps?: ExecutableStep[]
  updatedElements?: any[]
}

const predictions = ref<AiSuggestion[]>([])
const isPolling = ref(false)
const executingId = ref<string | null>(null)

const hoveredPrediction = ref<AiSuggestion | null>(null)

const { executeSteps } = useStepExecutor()

// ── Polling for predictions from the MCP Bridge ──────────────────────────────

const MCP_BRIDGE_URL = 'http://localhost:3100'
let pollTimer: ReturnType<typeof setInterval> | null = null

async function fetchPredictions() {
  try {
    const response = await fetch(`${MCP_BRIDGE_URL}/suggestions`, {
      signal: AbortSignal.timeout(2000),
    })
    if (!response.ok) return

    const data = await response.json()
    if (data.suggestions && Array.isArray(data.suggestions) && data.suggestions.length > 0) {
      predictions.value = data.suggestions
    }
    else if (data.suggestions && data.suggestions.length === 0) {
      // Predictions were cleared (new context arrived, OpenClaw re-predicting)
      predictions.value = []
    }
  }
  catch {
    // MCP server not running — silently ignore
  }
}

function startPolling() {
  isPolling.value = true
  // Initial fetch
  fetchPredictions()
  // Poll every 1.5 seconds
  pollTimer = setInterval(fetchPredictions, 1500)
}

function stopPolling() {
  isPolling.value = false
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

onMounted(() => startPolling())
onUnmounted(() => stopPolling())

// ── Execute a predicted action ───────────────────────────────────────────────

function executePrediction(pred: AiSuggestion) {
  executingId.value = pred.id
  
  if (pred.type === 'action_sequence' && pred.steps) {
    executeSteps(pred.steps, pred.id)
  } else if (pred.type === 'design_option' && pred.updatedElements) {
    const slidesStore = useSlidesStore()
    for (const update of pred.updatedElements) {
      slidesStore.updateElement({ id: update.id, props: update.props })
    }
  }

  // Brief visual feedback
  setTimeout(() => {
    executingId.value = null
  }, 600)
}

// ── Hover Preview Logic ──────────────────────────────────────────────────────

function handleMouseEnter(pred: AiSuggestion) {
  hoveredPrediction.value = pred
  
  const slidesStore = useSlidesStore()
  const mainStore = useMainStore()
  
  if (!slidesStore.currentSlide) return

  const activeIdList = mainStore.activeElementIdList
  if (activeIdList.length === 0) return

  const previewElements = []

  if (pred.type === 'action_sequence' && pred.steps) {
    // For sequence, apply to ALL selected elements
    for (const activeId of activeIdList) {
      const originalEl = slidesStore.currentSlide.elements.find(el => el.id === activeId)
      if (originalEl) {
        const targetEl = JSON.parse(JSON.stringify(originalEl)) as any

        for (const step of pred.steps) {
          if (step.command === 'bold' && targetEl.type === 'text') targetEl.defaultFontWeight = 'bold'
          if (step.command === 'italic' && targetEl.type === 'text') targetEl.defaultFontStyle = 'italic'
          if (step.command === 'underline' && targetEl.type === 'text') targetEl.defaultTextDecoration = 'underline'
          if (step.command === 'changeTextColor' && targetEl.type === 'text') targetEl.defaultColor = (step.args?.color as string) || '#e2534d'
          
          if (step.command === 'fontSizeUp' && targetEl.type === 'text') {
            const size = parseInt(targetEl.defaultSize?.replace('px', '') || '20')
            targetEl.defaultSize = (size + 4) + 'px'
          }
          if (step.command === 'fontSizeDown' && targetEl.type === 'text') {
            const size = parseInt(targetEl.defaultSize?.replace('px', '') || '20')
            targetEl.defaultSize = (size - 4) + 'px'
          }
          
          if (step.command === 'updateElement' && step.args && step.args.props) {
            Object.assign(targetEl, step.args.props)
          }
          
          // Basic alignment simulation (using PPTist default canvas 1000x562.5)
          if (step.command === 'alignCenter') {
            targetEl.left = 1000 / 2 - (targetEl.width / 2)
          }
          if (step.command === 'alignVertical') {
            targetEl.top = 562.5 / 2 - (targetEl.height / 2)
          }
          if (step.command === 'alignLeft') {
            targetEl.left = 0 // Simulating alignment to canvas edge for now
          }

          if (step.command === 'updateTextContent' && targetEl.type === 'text' && step.args?.text) {
            targetEl.content = step.args.text
          }

          if (step.command === 'duplicate') {
            targetEl.left += 20
            targetEl.top += 20
          }
        }
        
        targetEl.id = targetEl.id + '-preview'
        previewElements.push(targetEl)
      }
    }
  } else if (pred.type === 'design_option' && pred.updatedElements) {
    // For design options, patch all specified elements
    for (const update of pred.updatedElements) {
      const originalEl = slidesStore.currentSlide.elements.find(el => el.id === update.id)
      if (originalEl) {
        const targetEl = JSON.parse(JSON.stringify(originalEl)) as any
        Object.assign(targetEl, update.props)
        targetEl.id = targetEl.id + '-preview'
        previewElements.push(targetEl)
      }
    }
  }

  mainStore.setPreviewElements(previewElements)
}

function handleMouseLeave() {
  hoveredPrediction.value = null
  const mainStore = useMainStore()
  mainStore.setPreviewElements([])
}

// ── Display helpers ──────────────────────────────────────────────────────────

const COMMAND_LABELS: Record<string, string> = {
  bold: 'Bold text',
  italic: 'Italicize text',
  underline: 'Underline text',
  strikethrough: 'Strikethrough',
  fontSizeUp: 'Increase font size',
  fontSizeDown: 'Decrease font size',
  changeTextColor: 'Change text color',
  alignLeft: 'Align left',
  alignCenter: 'Center horizontally',
  alignRight: 'Align right',
  alignTop: 'Align to top',
  alignVertical: 'Center vertically',
  alignBottom: 'Align to bottom',
  bringToFront: 'Bring to front',
  sendToBack: 'Send to back',
  bringForward: 'Move forward',
  sendBackward: 'Move backward',
  duplicate: 'Duplicate element',
  deleteEl: 'Delete element',
  flipHorizontal: 'Flip horizontal',
  flipVertical: 'Flip vertical',
  fitToSlide: 'Fit to slide',
  editChartData: 'Edit chart data',
  insertTableRow: 'Insert row',
  insertTableCol: 'Insert column',
  deleteTableRow: 'Delete row',
  deleteTableCol: 'Delete column',
  updateElement: 'Update element',
  addElement: 'Add element',
  changeFill: 'Change fill',
  changeOpacity: 'Change opacity',
  addShadow: 'Add shadow',
  addBorder: 'Add border',
  applyAnimation: 'Apply animation',
}

function formatCommand(command: string): string {
  return COMMAND_LABELS[command] ?? command
}

function formatArgs(args: Record<string, unknown>): string {
  if (args.props && typeof args.props === 'object') {
    const props = args.props as Record<string, unknown>
    return Object.keys(props).map(k => `${k}: ${JSON.stringify(props[k])}`).join(', ')
  }
  if (args.color) return `→ ${args.color}`
  return ''
}
</script>

<style lang="scss" scoped>
.ai-predictions-panel {
  height: 100%;
  border-left: solid 1px $borderColor;
  background: linear-gradient(180deg, #faf8ff 0%, #ffffff 100%);
  display: flex;
  flex-direction: column;
  overflow: visible; /* Need this so the popover can escape the panel bounds */
  position: relative;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(139, 92, 246, 0.12);
  background: rgba(139, 92, 246, 0.04);

  .ai-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #6d28d9;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.3px;

    .badge-icon {
      font-size: 16px;
    }
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #cbd5e1;
    transition: background-color 0.3s;

    &.loading {
      background: #f59e0b;
      animation: pulse 1.5s infinite;
    }
    &.active {
      background: #22c55e;
    }
  }
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

// ── Empty state ──────────────────────────────────────────────
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;

  .empty-icon {
    font-size: 40px;
    color: #c4b5fd;
    margin-bottom: 16px;
  }

  .empty-title {
    font-size: 14px;
    font-weight: 600;
    color: #475569;
    margin: 0 0 8px;
  }

  .empty-desc {
    font-size: 12px;
    color: #94a3b8;
    line-height: 1.5;
    margin: 0 0 20px;
  }

  .polling-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: #8b5cf6;

    .pulse-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #8b5cf6;
      animation: pulse 1.5s infinite;
    }
  }
}

// ── Prediction cards ─────────────────────────────────────────
.predictions-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.prediction-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s ease;
  animation: cardAppear 0.3s ease-out both;
  animation-delay: var(--delay);

  &:hover {
    border-color: rgba(139, 92, 246, 0.4);
    box-shadow: 0 4px 12px -2px rgba(139, 92, 246, 0.15);
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0);
    box-shadow: 0 2px 6px -1px rgba(139, 92, 246, 0.1);
  }

  &.executing {
    border-color: #22c55e;
    background: #f0fdf4;
  }
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;

  .card-rank {
    font-size: 10px;
    font-weight: 700;
    color: #8b5cf6;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .confidence-badge {
    font-size: 10px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 8px;
    background: rgba(139, 92, 246, 0.1);
    color: #7c3aed;
  }
}

.card-label {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
}

.card-description {
  font-size: 11px;
  color: #64748b;
  line-height: 1.4;
}

.card-steps {
  margin-top: 4px;
  padding-top: 6px;
  border-top: 1px solid #f1f5f9;

  .steps-label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    font-weight: 600;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    margin-bottom: 4px;

    .steps-icon {
      font-size: 11px;
    }
  }

  .step-item {
    display: flex;
    align-items: baseline;
    gap: 4px;
    font-size: 11px;
    padding: 2px 0;

    .step-number {
      color: #94a3b8;
      font-weight: 500;
      min-width: 14px;
    }

    .step-command {
      color: #475569;
      font-weight: 500;
    }

    .step-args {
      color: #8b5cf6;
      font-size: 10px;
      font-family: monospace;
    }
  }
}

.executing-overlay {
  position: absolute;
  top: 8px;
  right: 8px;

  .done-icon {
    font-size: 18px;
    color: #22c55e;
    animation: popIn 0.3s ease-out;
  }
}

// ── Animations ───────────────────────────────────────────────
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.3); }
}

@keyframes cardAppear {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes popIn {
  0% { transform: scale(0); }
  70% { transform: scale(1.2); }
  100% { transform: scale(1); }
}
</style>
