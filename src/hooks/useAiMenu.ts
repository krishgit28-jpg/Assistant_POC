/**
 * useAiMenu composable
 *
 * Wires the AI prediction pipeline to the Vue component layer.
 * Call once inside the mobile ElementToolbar when it is mounted.
 *
 * - Watches handleElement (debounced 300ms).
 * - Assembles PredictionContext and calls predictMenuActions().
 * - Updates mainStore.aiMenuPredictions and aiMenuLoading.
 * - Exposes getActionForId() so the template can get the bound handler + metadata.
 */

import { watch, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { debounce } from 'lodash'
import { useMainStore, useSlidesStore } from '@/store'
import { getHistory, recordAction } from '@/services/actionHistory'
import {
  getCandidateActions,
  ACTION_CATALOGUE,
  type ActionHandlers,
  type ActionCandidate,
} from '@/services/actionRegistry'
import { predictMenuActions, clearPredictionCache, setMockAi, USE_MOCK_AI } from '@/services/menuPredictor'
import emitter, { EmitterEvents } from '@/utils/emitter'
import { ElementAlignCommands, ElementOrderCommands } from '@/types/edit'
import { ToolbarStates } from '@/types/toolbar'
import useOrderElement from '@/hooks/useOrderElement'
import useAlignElementToCanvas from '@/hooks/useAlignElementToCanvas'
import useDeleteElement from '@/hooks/useDeleteElement'
import useAddSlidesOrElements from '@/hooks/useAddSlidesOrElements'
import type { PPTElement } from '@/types/slides'

export function useAiMenu() {
  const mainStore = useMainStore()
  const slidesStore = useSlidesStore()
  const { handleElement, aiMenuPredictions, aiMenuLoading } = storeToRefs(mainStore)
  const { currentSlide } = storeToRefs(slidesStore)

  // ── Build action handlers bound to current Vue context ──────────────────

  const { orderElement } = useOrderElement()
  const { alignElementToCanvas } = useAlignElementToCanvas()
  const { deleteElement } = useDeleteElement()
  const { addElementsFromData } = useAddSlidesOrElements()

  function emitRichText(command: string, value?: string) {
    // Using a dynamic import to avoid circular dependency with emitter events
    emitter.emit(EmitterEvents.RICH_TEXT_COMMAND, { action: { command, value } })
  }

  function getEl(): PPTElement | null {
    return handleElement.value ?? null
  }

  const handlers: Partial<ActionHandlers> = {
    bold: () => emitRichText('bold'),
    italic: () => emitRichText('em'),
    underline: () => emitRichText('underline'),
    strikethrough: () => emitRichText('strikethrough'),
    fontSizeUp: () => emitRichText('fontsize-add'),
    fontSizeDown: () => emitRichText('fontsize-reduce'),
    changeTextColor: () => emitRichText('color', '#e2534d'),

    alignLeft: () => alignElementToCanvas(ElementAlignCommands.LEFT),
    alignCenter: () => alignElementToCanvas(ElementAlignCommands.HORIZONTAL),
    alignRight: () => alignElementToCanvas(ElementAlignCommands.RIGHT),
    alignTop: () => alignElementToCanvas(ElementAlignCommands.TOP),
    alignVertical: () => alignElementToCanvas(ElementAlignCommands.VERTICAL),
    alignBottom: () => alignElementToCanvas(ElementAlignCommands.BOTTOM),

    bringToFront: () => { const el = getEl(); if (el) orderElement(el, ElementOrderCommands.TOP) },
    sendToBack: () => { const el = getEl(); if (el) orderElement(el, ElementOrderCommands.BOTTOM) },
    bringForward: () => { const el = getEl(); if (el) orderElement(el, ElementOrderCommands.UP) },
    sendBackward: () => { const el = getEl(); if (el) orderElement(el, ElementOrderCommands.DOWN) },

    duplicate: () => {
      const el = getEl()
      if (el) addElementsFromData([JSON.parse(JSON.stringify(el))])
    },
    deleteEl: () => deleteElement(),

    // These open the existing toolbar tabs — handled via tab switching in the component
    changeFill: () => { /* handled via tab switch */ },
    changeOpacity: () => { /* no-op: complex UI needed */ },
    addShadow: () => { /* no-op: complex UI needed */ },
    addBorder: () => { /* no-op: complex UI needed */ },
    applyAnimation: () => { /* no-op: complex UI needed */ },

    // Image: flip
    flipHorizontal: () => {
      const el = getEl()
      if (el && (el.type === 'image' || el.type === 'shape')) {
        slidesStore.updateElement({ id: el.id, props: { flipH: !(el as { flipH?: boolean }).flipH } })
      }
    },
    flipVertical: () => {
      const el = getEl()
      if (el && (el.type === 'image' || el.type === 'shape')) {
        slidesStore.updateElement({ id: el.id, props: { flipV: !(el as { flipV?: boolean }).flipV } })
      }
    },
    fitToSlide: () => {
      const el = getEl()
      if (el && el.type === 'image') {
        const vw = slidesStore.viewportSize
        const vh = slidesStore.viewportSize * slidesStore.viewportRatio
        slidesStore.updateElement({ id: el.id, props: { left: 0, top: 0, width: vw, height: vh } })
      }
    },

    // Chart
    editChartData: () => emitter.emit(EmitterEvents.OPEN_CHART_DATA_EDITOR),
    // changeChartType: noop (complex UI)
    changeChartType: () => { /* no-op */ },

    // Table
    insertTableRow: () => {
      const el = getEl()
      if (el?.type === 'table') emitter.emit(EmitterEvents.TABLE_COMMAND, { targetId: el.id, command: 'insert-row', position: 'after' })
    },
    insertTableCol: () => {
      const el = getEl()
      if (el?.type === 'table') emitter.emit(EmitterEvents.TABLE_COMMAND, { targetId: el.id, command: 'insert-col', position: 'after' })
    },
    deleteTableRow: () => {
      const el = getEl()
      if (el?.type === 'table') emitter.emit(EmitterEvents.TABLE_COMMAND, { targetId: el.id, command: 'delete-row' })
    },
    deleteTableCol: () => {
      const el = getEl()
      if (el?.type === 'table') emitter.emit(EmitterEvents.TABLE_COMMAND, { targetId: el.id, command: 'delete-col' })
    },
  }

  // ── Prediction pipeline ──────────────────────────────────────────────────

  let aborted = false

  async function runPrediction() {
    if (aborted) return
    const el = handleElement.value
    if (!el) {
      mainStore.setAiMenuPredictions([])
      return
    }

    // Clear cache on selection change so we get fresh results
    clearPredictionCache()
    mainStore.setAiMenuLoading(true)

    try {
      // Slide summary
      const slide = currentSlide.value
      const elementCounts: Record<string, number> = {}
      for (const e of (slide?.elements ?? [])) {
        elementCounts[e.type] = (elementCounts[e.type] ?? 0) + 1
      }

      // Build selection properties snapshot (only lightweight scalar props)
      const props: Record<string, unknown> = el.type === 'line'
        ? { start: el.start, end: el.end }
        : { width: el.width, height: el.height, left: el.left, top: el.top }
      if (el.type === 'text') {
        props.defaultFontName = el.defaultFontName
        props.defaultColor = el.defaultColor
        // Extract a text snippet from the HTML content
        const tmp = document.createElement('div')
        tmp.innerHTML = el.content
        props.textSnippet = tmp.textContent?.slice(0, 60)
      }
      if (el.type === 'image') {
        props.fixedRatio = el.fixedRatio
      }
      if (el.type === 'chart') {
        props.chartType = el.chartType
      }

      const actionHistory = getHistory()
      const context = {
        actionHistory,
        selection: { type: el.type, id: el.id, properties: props },
      }

      const candidates = getCandidateActions(context, handlers)

      const fullContext = {
        ...context,
        slideSummary: {
          elementCounts,
          totalElements: slide?.elements?.length ?? 0,
        },
        candidates,
      }

      if (aborted) return

      const result = await predictMenuActions(fullContext)

      if (aborted) return

      if (result && result.length > 0) {
        mainStore.setAiMenuPredictions(result)
      } else {
        // Fall back: use top candidates from the heuristic
        mainStore.setAiMenuPredictions(candidates.slice(0, 5).map(c => c.id))
      }
    } catch (err) {
      console.warn('[AI Menu] useAiMenu prediction failed:', err)
      mainStore.setAiMenuPredictions([])
    } finally {
      if (!aborted) mainStore.setAiMenuLoading(false)
    }
  }

  const debouncedRunPrediction = debounce(runPrediction, 300, { trailing: true })

  // Watch for element changes
  const stopWatch = watch(handleElement, (el) => {
    if (!el) {
      mainStore.setAiMenuPredictions([])
      mainStore.setAiMenuLoading(false)
      return
    }
    debouncedRunPrediction()
  }, { immediate: true })

  // Also re-run when an action is recorded (captures format changes on same element)
  const onActionRecorded = () => debouncedRunPrediction()
  emitter.on(EmitterEvents.AI_MENU_ACTION_RECORDED, onActionRecorded)

  onUnmounted(() => {
    aborted = true
    stopWatch()
    debouncedRunPrediction.cancel()
    emitter.off(EmitterEvents.AI_MENU_ACTION_RECORDED, onActionRecorded)
  })

  // ── Public helpers ───────────────────────────────────────────────────────

  /**
   * Get a candidate action by ID with its bound handler.
   * Returns undefined if the ID is not found in the full catalogue.
   */
  function getActionForId(id: string): (ActionCandidate & { handler?: () => void }) | undefined {
    const base = ACTION_CATALOGUE.find(a => a.id === id)
    if (!base) return undefined
    return {
      ...base,
      handler: handlers[id as keyof ActionHandlers],
    }
  }

  /** Manually trigger a fresh prediction (e.g., from a retry button) */
  function retryPrediction() {
    clearPredictionCache()
    runPrediction()
  }

  // Attach global debug helper to window for easy browser devtools debugging
  if (typeof window !== 'undefined') {
    (window as any).__AI_MENU__ = {
      getStatus: () => {
        const el = handleElement.value
        const hist = getHistory()
        const preds = mainStore.aiMenuPredictions
        console.group('%c[AI Menu Debug Diagnostics]', 'color: #8b5cf6; font-weight: bold; font-size: 13px;')
        console.log('📌 Selected Element:', el ? `${el.type} (id: ${el.id})` : 'None (Click any slide element to select it)')
        console.log('📜 Total Recorded Actions in History:', hist.length)
        console.log('🕒 Recent Actions (last 5):', hist.slice(0, 5))
        console.log('✨ Current Predicted Actions in Store:', preds)
        console.log('⏳ Is Loading:', mainStore.aiMenuLoading)
        console.log('🤖 Mock AI Mode:', USE_MOCK_AI ? 'Active (Returning 5 text actions)' : 'Disabled (Calling remote LLM)')
        console.groupEnd()
        return {
          selectedElement: el,
          historyCount: hist.length,
          predictions: preds,
          isLoading: mainStore.aiMenuLoading,
          isMockMode: USE_MOCK_AI,
        }
      },
      getHistory: () => getHistory(),
      getPredictions: () => mainStore.aiMenuPredictions,
      triggerPrediction: () => retryPrediction(),
      setMockAi: (enabled: boolean) => setMockAi(enabled),
    }
  }

  return {
    aiMenuPredictions,
    aiMenuLoading,
    getActionForId,
    retryPrediction,
  }
}
