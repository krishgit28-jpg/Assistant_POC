<template>
  <div class="ai-floating-menu" :style="menuStyle" @mousedown.stop>
    <div class="ai-badge" v-tooltip="'AI Contextual Predictions'">
      <i-icon-park-outline:magic class="badge-icon" />
      <span class="badge-text">AI</span>
    </div>

    <div class="divider"></div>

    <div class="actions-container">
      <!-- Loading state -->
      <div v-if="aiMenuLoading" class="ai-loading">
        <span class="loading-dot"></span>
        <span class="loading-text">Predicting...</span>
      </div>

      <!-- 5 Predicted action buttons -->
      <template v-else-if="aiMenuPredictions.length">
        <button
          v-for="id in aiMenuPredictions"
          :key="id"
          class="action-btn"
          :title="getActionForId(id)?.description || ''"
          @click="executeAction(id)"
        >
          <span class="action-icon">
            <component :is="getIconComponent(id)" />
          </span>
          <span class="action-label">{{ getActionForId(id)?.label || id }}</span>
        </button>
      </template>

      <!-- Fallback when no actions yet -->
      <div v-else class="ai-fallback" @click="retryPrediction()">
        <span>Click to suggest actions</span>
      </div>
    </div>

    <div class="divider"></div>

    <button
      class="refresh-btn"
      v-tooltip="'Refresh AI Predictions'"
      @click="retryPrediction()"
    >
      <i-icon-park-outline:refresh class="refresh-icon" />
    </button>
  </div>
</template>

<script lang="ts" setup>
import type { PPTElement } from '@/types/slides'
import { useAiMenu } from '@/hooks/useAiMenu'
import { recordAction } from '@/services/actionHistory'

const props = defineProps<{
  elementInfo: PPTElement
  menuStyle: Record<string, string>
}>()

const { aiMenuPredictions, aiMenuLoading, getActionForId, retryPrediction } = useAiMenu()

const executeAction = (actionId: string) => {
  const action = getActionForId(actionId)
  if (action?.handler) {
    action.handler()
    recordAction({
      type: 'format',
      targetType: props.elementInfo.type,
      targetId: props.elementInfo.id,
      details: { actionId },
    })
  }
}

// Icon mapper for quick visual cues
const getIconComponent = (id: string) => {
  switch (id) {
    case 'bold': return 'i-icon-park-outline:text-bold'
    case 'italic': return 'i-icon-park-outline:text-italic'
    case 'underline': return 'i-icon-park-outline:text-underline'
    case 'strikethrough': return 'i-icon-park-outline:strikethrough'
    case 'fontSizeUp': return 'i-icon-park-outline:font-size'
    case 'fontSizeDown': return 'i-icon-park-outline:font-size'
    case 'changeTextColor': return 'i-icon-park-outline:text'
    case 'alignCenter': return 'i-icon-park-outline:align-text-center'
    case 'alignLeft': return 'i-icon-park-outline:align-text-left'
    case 'alignRight': return 'i-icon-park-outline:align-text-right'
    case 'duplicate': return 'i-icon-park-outline:copy'
    case 'deleteEl': return 'i-icon-park-outline:delete'
    case 'applyAnimation': return 'i-icon-park-outline:effects'
    case 'bringToFront': return 'i-icon-park-outline:bring-to-front'
    case 'sendToBack': return 'i-icon-park-outline:sent-to-back'
    default: return 'i-icon-park-outline:magic'
  }
}
</script>

<style lang="scss" scoped>
.ai-floating-menu {
  position: absolute;
  height: 38px;
  padding: 0 6px;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(139, 92, 246, 0.35);
  border-radius: 20px;
  box-shadow: 0 6px 20px -4px rgba(124, 58, 237, 0.22), 0 2px 6px -1px rgba(0, 0, 0, 0.08);
  display: flex;
  align-items: center;
  gap: 4px;
  z-index: 105;
  user-select: none;
  transition: opacity 0.15s ease, transform 0.15s ease;
  animation: menuAppear 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes menuAppear {
  from {
    opacity: 0;
    transform: translateY(4px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.ai-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: linear-gradient(135deg, #8b5cf6, #6366f1);
  color: #fff;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
  cursor: default;

  .badge-icon {
    font-size: 12px;
  }
}

.divider {
  width: 1px;
  height: 18px;
  background-color: rgba(0, 0, 0, 0.08);
  margin: 0 2px;
}

.actions-container {
  display: flex;
  align-items: center;
  gap: 3px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 8px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 14px;
  color: #334155;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;

  .action-icon {
    font-size: 13px;
    display: flex;
    align-items: center;
    color: #6366f1;
  }

  &:hover {
    background-color: rgba(139, 92, 246, 0.1);
    color: #4f46e5;
    border-color: rgba(139, 92, 246, 0.25);
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0);
    background-color: rgba(139, 92, 246, 0.18);
  }
}

.refresh-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.15s ease;

  .refresh-icon {
    font-size: 13px;
  }

  &:hover {
    background-color: rgba(0, 0, 0, 0.05);
    color: #6366f1;
    transform: rotate(45deg);
  }
}

.ai-loading,
.ai-fallback {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  font-size: 11px;
  color: #64748b;

  .loading-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: #8b5cf6;
    animation: pulseDot 1s infinite alternate;
  }
}

@keyframes pulseDot {
  0% { transform: scale(0.8); opacity: 0.5; }
  100% { transform: scale(1.4); opacity: 1; }
}
</style>
