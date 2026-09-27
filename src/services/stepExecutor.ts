/**
 * Step Executor Service
 *
 * Executes a sequence of ActionSteps from OpenClaw's predictions.
 * Each step's `command` maps to either:
 *   1. An ACTION_CATALOGUE handler (e.g., "bold", "alignCenter", "duplicate")
 *   2. A Pinia store method (e.g., "updateElement", "addElement")
 *
 * The executor runs steps sequentially, waiting for each to complete
 * before moving to the next.
 */

import { useSlidesStore, useMainStore } from '@/store'
import { ElementAlignCommands, ElementOrderCommands } from '@/types/edit'
import useOrderElement from '@/hooks/useOrderElement'
import useAlignElementToCanvas from '@/hooks/useAlignElementToCanvas'
import useDeleteElement from '@/hooks/useDeleteElement'
import useAddSlidesOrElements from '@/hooks/useAddSlidesOrElements'
import emitter, { EmitterEvents } from '@/utils/emitter'
import type { PPTElement } from '@/types/slides'
import { recordAction } from './actionHistory'

/**
 * Represents one step in a predicted action's execution sequence.
 */
export interface ExecutableStep {
  command: string
  args?: Record<string, unknown>
}

/**
 * Creates a step executor bound to the current Vue component context.
 * Must be called inside a Vue setup() function.
 *
 * Returns a function that executes an array of steps sequentially.
 */
export function useStepExecutor() {
  const slidesStore = useSlidesStore()
  const mainStore = useMainStore()

  const { orderElement } = useOrderElement()
  const { alignElementToCanvas } = useAlignElementToCanvas()
  const { deleteElement } = useDeleteElement()
  const { addElementsFromData } = useAddSlidesOrElements()

  function getEl(): PPTElement | null {
    return mainStore.handleElement ?? null
  }

  function emitRichText(command: string, value?: string) {
    emitter.emit(EmitterEvents.RICH_TEXT_COMMAND, { action: { command, value } })
  }

  /**
   * Map of command names to their execution logic.
   * Extends beyond simple ACTION_CATALOGUE handlers to include
   * store-level operations with args.
   */
  const commandMap: Record<string, (args?: Record<string, unknown>) => void> = {
    // ── Rich text ──────────────────────────────────────────────
    bold: () => emitRichText('bold'),
    italic: () => emitRichText('em'),
    underline: () => emitRichText('underline'),
    strikethrough: () => emitRichText('strikethrough'),
    fontSizeUp: () => emitRichText('fontsize-add'),
    fontSizeDown: () => emitRichText('fontsize-reduce'),
    changeTextColor: (args) => {
      const color = (args?.color as string) ?? '#e2534d'
      emitRichText('color', color)
    },

    // ── Alignment ──────────────────────────────────────────────
    alignLeft: () => alignElementToCanvas(ElementAlignCommands.LEFT),
    alignCenter: () => alignElementToCanvas(ElementAlignCommands.HORIZONTAL),
    alignRight: () => alignElementToCanvas(ElementAlignCommands.RIGHT),
    alignTop: () => alignElementToCanvas(ElementAlignCommands.TOP),
    alignVertical: () => alignElementToCanvas(ElementAlignCommands.VERTICAL),
    alignBottom: () => alignElementToCanvas(ElementAlignCommands.BOTTOM),

    // ── Order / layering ───────────────────────────────────────
    bringToFront: () => { const el = getEl(); if (el) orderElement(el, ElementOrderCommands.TOP) },
    sendToBack: () => { const el = getEl(); if (el) orderElement(el, ElementOrderCommands.BOTTOM) },
    bringForward: () => { const el = getEl(); if (el) orderElement(el, ElementOrderCommands.UP) },
    sendBackward: () => { const el = getEl(); if (el) orderElement(el, ElementOrderCommands.DOWN) },

    // ── Common element operations ──────────────────────────────
    duplicate: () => {
      const el = getEl()
      if (el) addElementsFromData([JSON.parse(JSON.stringify(el))])
    },
    deleteEl: () => deleteElement(),

    // ── Image ──────────────────────────────────────────────────
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

    // ── Chart ──────────────────────────────────────────────────
    editChartData: () => emitter.emit(EmitterEvents.OPEN_CHART_DATA_EDITOR),

    // ── Table ──────────────────────────────────────────────────
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

    // ── Store-level operations (with args) ─────────────────────
    updateElement: (args) => {
      if (!args) return
      const id = args.id as string
      const props = args.props as Record<string, unknown>
      if (id && props) {
        slidesStore.updateElement({ id, props })
      }
    },
    addElement: (args) => {
      if (!args) return
      const elementData = args as unknown as PPTElement
      addElementsFromData([elementData])
    },
  }

  /**
   * Execute a single step.
   */
  function executeStep(step: ExecutableStep): boolean {
    const handler = commandMap[step.command]
    if (!handler) {
      console.warn(`[StepExecutor] Unknown command: "${step.command}"`)
      return false
    }
    try {
      handler(step.args)
      return true
    }
    catch (err) {
      console.error(`[StepExecutor] Failed to execute "${step.command}":`, err)
      return false
    }
  }

  /**
   * Execute an array of steps sequentially.
   * Returns true if all steps succeeded.
   */
  function executeSteps(steps: ExecutableStep[], actionId?: string): boolean {
    let allSucceeded = true

    for (const step of steps) {
      const ok = executeStep(step)
      if (!ok) allSucceeded = false
    }

    // Record the action in history
    if (actionId) {
      const el = getEl()
      recordAction({
        type: 'format',
        targetType: el?.type ?? 'unknown',
        targetId: el?.id ?? '',
        details: { actionId, stepsExecuted: steps.length },
      })
    }

    return allSucceeded
  }

  return {
    executeStep,
    executeSteps,
    commandMap,
  }
}
