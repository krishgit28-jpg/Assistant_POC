<template>
  <div class="element-toolbar">
    <Tabs 
      :tabs="tabs" 
      v-model:value="activeTab" 
      :tabsStyle="{ marginBottom: '8px' }" 
      :tabStyle="{
        width: '25%',
        margin: '0 4%',
      }" 
    />

    <div class="content">
      <div class="style" v-if="activeTab === 'style'">
        <template v-if="textPropsEnable">
          <ButtonGroup class="row">
            <CheckboxButton 
              style="flex: 1;"
              :checked="richTextAttrs.bold"
              @click="emitRichTextCommand('bold')"
            ><i-icon-park-outline:text-bold /></CheckboxButton>
            <CheckboxButton 
              style="flex: 1;"
              :checked="richTextAttrs.em"
              @click="emitRichTextCommand('em')"
            ><i-icon-park-outline:text-italic /></CheckboxButton>
            <CheckboxButton 
              style="flex: 1;"
              :checked="richTextAttrs.underline"
              @click="emitRichTextCommand('underline')"
            ><i-icon-park-outline:text-underline /></CheckboxButton>
            <CheckboxButton 
              style="flex: 1;"
              :checked="richTextAttrs.strikethrough"
              @click="emitRichTextCommand('strikethrough')"
            ><i-icon-park-outline:strikethrough /></CheckboxButton>
          </ButtonGroup>

          <ButtonGroup class="row">
            <Button 
              style="flex: 1;"
              @click="emitRichTextCommand('fontsize-add')"
            ><i-icon-park-outline:font-size />+</Button>
            <Button 
              style="flex: 1;"
              @click="emitRichTextCommand('fontsize-reduce')"
            ><i-icon-park-outline:font-size />-</Button>
          </ButtonGroup>

          <RadioGroup 
            class="row" 
            button-style="solid" 
            :value="richTextAttrs.align"
            @update:value="value => emitRichTextCommand('align', value)"
          >
            <RadioButton value="left" style="flex: 1;"><i-icon-park-outline:align-text-left /></RadioButton>
            <RadioButton value="center" style="flex: 1;"><i-icon-park-outline:align-text-center /></RadioButton>
            <RadioButton value="right" style="flex: 1;"><i-icon-park-outline:align-text-right /></RadioButton>
          </RadioGroup>
        </template>

        <div class="row-block" v-if="textColorPropsEnable">
          <div class="label">Text Color:</div>
          <div class="colors">
            <div class="color" 
              v-for="color in colors" 
              :key="color"
              @click="updateFontColor(color)"
            >
              <div class="color-block" :style="{ backgroundColor: color }"></div>
            </div>
            <div class="color custom">
              <Popover trigger="click">
                <template #content>
                  <ColorPicker :modelValue="fontColor" @update:modelValue="value => updateFontColor(value)" />
                </template>
                <div class="color-block"></div>
              </Popover>
            </div>
          </div>
        </div>
        <div class="row-block" v-if="fillPropsEnable">
          <div class="label">Fill Color:</div>
          <div class="colors">
            <div class="color" 
              v-for="color in colors" 
              :key="color"
              @click="updateFill(color)"
            >
              <div class="color-block" :style="{ backgroundColor: color }"></div>
            </div>
            <div class="color custom">
              <Popover trigger="click">
                <template #content>
                  <ColorPicker :modelValue="fill" @update:modelValue="value => updateFill(value)" />
                </template>
                <div class="color-block"></div>
              </Popover>
            </div>
          </div>
        </div>

        <div class="tip" v-if="!textPropsEnable && !textColorPropsEnable && !fillPropsEnable">No properties available</div>
      </div>

      <div class="common" v-if="activeTab === 'common'">
        <ButtonGroup class="row">
          <Button style="flex: 1;" @click="copyElement()"><i-icon-park-outline:copy class="icon" /> Copy</Button>
          <Button style="flex: 1;" @click="deleteElement()"><i-icon-park-outline:delete class="icon" /> Delete</Button>
        </ButtonGroup>
        
        <Divider :margin="20" />

        <ButtonGroup class="row">
          <Button style="flex: 1;" @click="orderElement(handleElement!, ElementOrderCommands.TOP)"><i-icon-park-outline:send-to-back class="icon" /> Bring to Front</Button>
          <Button style="flex: 1;" @click="orderElement(handleElement!, ElementOrderCommands.BOTTOM)"><i-icon-park-outline:bring-to-front-one class="icon" /> Send to Back</Button>
          <Button style="flex: 1;" @click="orderElement(handleElement!, ElementOrderCommands.UP)"><i-icon-park-outline:bring-to-front class="icon" /> Bring Forward</Button>
          <Button style="flex: 1;" @click="orderElement(handleElement!, ElementOrderCommands.DOWN)"><i-icon-park-outline:sent-to-back class="icon" /> Send Backward</Button>
        </ButtonGroup>
        
        <Divider :margin="20" />

        <ButtonGroup class="row">
          <Button style="flex: 1;" @click="alignElementToCanvas(ElementAlignCommands.LEFT)"><i-icon-park-outline:align-left class="icon" /> Align Left</Button>
          <Button style="flex: 1;" @click="alignElementToCanvas(ElementAlignCommands.HORIZONTAL)"><i-icon-park-outline:align-vertically class="icon" /> Center Horizontally</Button>
          <Button style="flex: 1;" @click="alignElementToCanvas(ElementAlignCommands.RIGHT)"><i-icon-park-outline:align-right class="icon" /> Align Right</Button>
        </ButtonGroup>
        <ButtonGroup class="row">
          <Button style="flex: 1;" @click="alignElementToCanvas(ElementAlignCommands.TOP)"><i-icon-park-outline:align-top class="icon" /> Align Top</Button>
          <Button style="flex: 1;" @click="alignElementToCanvas(ElementAlignCommands.VERTICAL)"><i-icon-park-outline:align-horizontally class="icon" /> Center Vertically</Button>
          <Button style="flex: 1;" @click="alignElementToCanvas(ElementAlignCommands.BOTTOM)"><i-icon-park-outline:align-bottom class="icon" /> Align Bottom</Button>
        </ButtonGroup>
      </div>

      <!-- ✨ AI Suggestions Tab -->
      <div class="ai" v-if="activeTab === 'ai'">
        <!-- Loading skeleton -->
        <template v-if="aiMenuLoading">
          <div class="ai-skeleton" v-for="i in 4" :key="i"></div>
        </template>

        <!-- Predicted actions -->
        <template v-else-if="aiMenuPredictions.length">
          <button
            class="ai-action-btn"
            v-for="actionId in aiMenuPredictions"
            :key="actionId"
            @click="handleAiAction(actionId)"
          >
            <span class="ai-action-icon">✦</span>
            <span class="ai-action-label">{{ getActionForId(actionId)?.label ?? actionId }}</span>
            <span class="ai-action-desc">{{ getActionForId(actionId)?.description }}</span>
          </button>
        </template>

        <!-- Empty / fallback state -->
        <template v-else>
          <div class="ai-empty">
            <span class="ai-empty-icon">🤖</span>
            <p class="ai-empty-text">No suggestions yet</p>
            <button class="ai-retry-btn" @click="retryPrediction()">Retry</button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useMainStore, useSlidesStore } from '@/store'
import type { PPTElement, TableCell } from '@/types/slides'
import { ElementAlignCommands, ElementOrderCommands } from '@/types/edit'
import emitter, { EmitterEvents } from '@/utils/emitter'
import useOrderElement from '@/hooks/useOrderElement'
import useAlignElementToCanvas from '@/hooks/useAlignElementToCanvas'
import useDeleteElement from '@/hooks/useDeleteElement'
import useAddSlidesOrElements from '@/hooks/useAddSlidesOrElements'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import { useAiMenu } from '@/hooks/useAiMenu'

import CheckboxButton from '@/components/CheckboxButton.vue'
import Tabs from '@/components/Tabs.vue'
import Divider from '@/components/Divider.vue'
import Button from '@/components/Button.vue'
import ButtonGroup from '@/components/ButtonGroup.vue'
import RadioButton from '@/components/RadioButton.vue'
import RadioGroup from '@/components/RadioGroup.vue'
import ColorPicker from '@/components/ColorPicker/index.vue'
import Popover from '@/components/Popover.vue'

interface TabItem {
  key: 'style' | 'common' | 'ai'
  label: string
}

const colors = ['#000000', '#ffffff', '#eeece1', '#1e497b', '#4e81bb', '#e2534d', '#9aba60', '#8165a0', '#47acc5', '#c21401', '#ff1e02', '#ffc12a', '#ffff3a', '#90cf5b', '#00af57']

const mainStore = useMainStore()
const slidesStore = useSlidesStore()
const { handleElement, handleElementId, richTextAttrs } = storeToRefs(mainStore)

const { addHistorySnapshot } = useHistorySnapshot()

const updateElement = (id: string, props: Partial<PPTElement>) => {
  slidesStore.updateElement({ id, props })
  addHistorySnapshot()
}

const tabs: TabItem[] = [
  { key: 'ai', label: '✨ AI' },
  { key: 'style', label: 'Style' },
  { key: 'common', label: 'Layout' },
]
const activeTab = ref<'ai' | 'style' | 'common'>('ai')

// Switch to AI tab whenever the element changes and predictions load
const { aiMenuPredictions, aiMenuLoading, getActionForId, retryPrediction } = useAiMenu()

watch(handleElement, () => {
  activeTab.value = 'ai'
})

const textPropsEnable = computed(() => {
  if (!handleElement.value) return false
  if (handleElement.value.type === 'text') return true
  if (handleElement.value.type === 'shape' && handleElement.value.text?.content) return true

  return false
})

const textColorPropsEnable = computed(() => {
  if (!handleElement.value) return false
  if (
    handleElement.value.type === 'text' ||
    handleElement.value.type === 'table' ||
    handleElement.value.type === 'latex'
  ) return true

  if (handleElement.value.type === 'shape' && handleElement.value.text?.content) return true

  return false
})

const fillPropsEnable = computed(() => {
  if (!handleElement.value) return false
  if (
    handleElement.value.type === 'text' ||
    handleElement.value.type === 'shape' ||
    handleElement.value.type === 'chart' ||
    handleElement.value.type === 'table' ||
    handleElement.value.type === 'line' ||
    handleElement.value.type === 'audio'
  ) return true

  return false
})

const { orderElement } = useOrderElement()
const { alignElementToCanvas } = useAlignElementToCanvas()
const { addElementsFromData } = useAddSlidesOrElements()
const { deleteElement } = useDeleteElement()

const copyElement = () => {
  const element: PPTElement = JSON.parse(JSON.stringify(handleElement.value))
  addElementsFromData([element])
}

const emitRichTextCommand = (command: string, value?: string) => {
  emitter.emit(EmitterEvents.RICH_TEXT_COMMAND, { action: { command, value } })
}

const fontColor = computed(() => {
  if (!handleElement.value) return '#fff'
  if (handleElement.value.type === 'text' || (handleElement.value.type === 'shape' && handleElement.value.text?.content)) {
    return richTextAttrs.value.color
  }
  if (handleElement.value.type === 'table') {
    const data: TableCell[][] = JSON.parse(JSON.stringify(handleElement.value.data))
    return data[0][0].style?.color
  }
  if (handleElement.value.type === 'latex') {
    return handleElement.value.color
  }
  return '#fff'
})

const updateFontColor = (color: string) => {
  if (!handleElement.value) return
  if (handleElement.value.type === 'text' || (handleElement.value.type === 'shape' && handleElement.value.text?.content)) {
    emitter.emit(EmitterEvents.RICH_TEXT_COMMAND, { action: { command: 'color', value: color } })
  }
  if (handleElement.value.type === 'table') {
    const data: TableCell[][] = JSON.parse(JSON.stringify(handleElement.value.data))
    for (let i = 0; i < data.length; i++) {
      for (let j = 0; j < data[i].length; j++) {
        const style = data[i][j].style || {}
        data[i][j].style = { ...style, color }
      }
    }
    updateElement(handleElementId.value, { data })
  }
  if (handleElement.value.type === 'latex') {
    updateElement(handleElementId.value, { color })
  }
}

const fill = computed(() => {
  if (!handleElement.value) return '#fff'

  if (
    handleElement.value.type === 'text' ||
    handleElement.value.type === 'shape' ||
    handleElement.value.type === 'chart'
  ) return handleElement.value.fill

  if (handleElement.value.type === 'table') {
    const data: TableCell[][] = JSON.parse(JSON.stringify(handleElement.value.data))
    return data[0][0].style?.backcolor
  }

  if (handleElement.value.type === 'audio' || handleElement.value.type === 'line') {
    return handleElement.value.color
  }
  return '#fff'
})

const updateFill = (color: string) => {
  if (!handleElement.value) return
  if (
    handleElement.value.type === 'text' ||
    handleElement.value.type === 'shape' ||
    handleElement.value.type === 'chart'
  ) updateElement(handleElementId.value, { fill: color })

  if (handleElement.value.type === 'table') {
    const data: TableCell[][] = JSON.parse(JSON.stringify(handleElement.value.data))
    for (let i = 0; i < data.length; i++) {
      for (let j = 0; j < data[i].length; j++) {
        const style = data[i][j].style || {}
        data[i][j].style = { ...style, backcolor: color }
      }
    }
    updateElement(handleElementId.value, { data })
  }

  if (handleElement.value.type === 'audio' || handleElement.value.type === 'line') {
    updateElement(handleElementId.value, { color })
  }
}

/**
 * Execute an AI-predicted action by ID.
 * If the action has a bound handler from useAiMenu, call it directly.
 * Complex actions (changeFill, etc.) switch to the appropriate tab.
 */
const handleAiAction = (actionId: string) => {
  // Actions that require switching to a specific tab
  const TAB_ACTIONS: Record<string, 'style' | 'common'> = {
    changeFill: 'style',
    changeTextColor: 'style',
    changeOpacity: 'style',
    addShadow: 'style',
    addBorder: 'style',
    changeChartType: 'style',
  }
  if (TAB_ACTIONS[actionId]) {
    activeTab.value = TAB_ACTIONS[actionId]
    return
  }

  const action = getActionForId(actionId)
  if (action?.handler) {
    action.handler()
  }
}
</script>

<style lang="scss" scoped>
.element-toolbar {
  width: 100%;
  height: 240px;
  position: absolute;
  z-index: 99;
  bottom: 0;
  left: 0;
  background-color: #fff;
  box-shadow: 0 0 15px 0 rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  animation: slideInUp .15s;
}

@keyframes slideInUp {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

.content {
  padding: 10px;
  flex: 1;
  overflow: auto;
}
.row {
  width: 100%;
  display: flex;
  align-items: center;
  margin-bottom: 10px;

  .icon {
    margin-right: 3px;
  }
}
.row-block {
  margin-bottom: 10px;
  background-color: $lightGray;
  border-radius: $borderRadius;
  padding: 10px;
}
.label {
  font-size: 13px;
  margin-bottom: 20px;
  margin-left: 6px;
}
.colors {
  @include flex-grid-layout();
}
.color {
  @include flex-grid-layout-children(8, 12%);

  padding-bottom: 5px;
  display: flex;
  justify-content: center;
  align-items: center;

  .color-block {
    width: 30px;
    height: 30px;
    border-radius: 50%;
  }

  &.custom .color-block {
    background: conic-gradient(from 0deg, #ff1e02, #ffc12a, #90cf5b, #00af57, #47acc5, #4e81bb, #8165a0, #e2534d, #ff1e02);
  }
}

.tip {
  height: 100px;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 12px;
  color: #999;
}

// ── AI Tab styles ────────────────────────────────────────────────────────────
.ai {
  padding: 0 4px;
  overflow-y: auto;
  max-height: 200px;
}

.ai-action-btn {
  width: 100%;
  min-height: 52px;
  border-radius: 12px;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  border: none;
  margin-bottom: 8px;
  cursor: pointer;
  text-align: left;
  transition: transform 0.12s ease, opacity 0.12s ease, box-shadow 0.12s ease;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.35);

  &:active {
    transform: scale(0.97);
    opacity: 0.88;
  }

  &:hover {
    box-shadow: 0 4px 14px rgba(102, 126, 234, 0.5);
  }
}

.ai-action-icon {
  font-size: 16px;
  flex-shrink: 0;
  opacity: 0.85;
}

.ai-action-label {
  font-weight: 600;
  font-size: 14px;
  flex: 1;
}

.ai-action-desc {
  font-size: 11px;
  opacity: 0.72;
  flex-shrink: 0;
  max-width: 100px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

// Pulsing skeleton loader
.ai-skeleton {
  width: 100%;
  height: 52px;
  border-radius: 12px;
  margin-bottom: 8px;
  background: linear-gradient(90deg, #e8e8e8 25%, #f5f5f5 50%, #e8e8e8 75%);
  background-size: 200% 100%;
  animation: ai-shimmer 1.4s infinite ease-in-out;
}

@keyframes ai-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

// Empty / error state
.ai-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 0;
  gap: 8px;
}

.ai-empty-icon {
  font-size: 32px;
}

.ai-empty-text {
  font-size: 13px;
  color: #999;
  margin: 0;
}

.ai-retry-btn {
  margin-top: 4px;
  padding: 6px 18px;
  border-radius: 20px;
  border: 1px solid #667eea;
  color: #667eea;
  background: transparent;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;

  &:active {
    background: #667eea;
    color: #fff;
  }
}
</style>