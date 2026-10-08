import { useSlidesStore, useMainStore } from '@/store'
import { getHistory } from '@/services/actionHistory'
import type { CanvasElement, CanvasState, HistoryEntry, StateSupplier, Unsubscribe } from '@pptist/sdk'

type StateListener = (snapshot: CanvasState) => void

/**
 * PPTist's StateSupplier.
 *
 * Watches the Pinia stores for meaningful user actions (select, move, edit, insert,
 * delete) and emits a debounced, serialized `CanvasState` snapshot to its listeners.
 * It does NOT talk to the network — the SDK's `McpBridgeClient` subscribes to it.
 */
export class CommunicationTriggers implements StateSupplier<CanvasState> {
  // Store the unsubscribe functions so we can clean up if needed
  private unsubscribeSlides: (() => void) | null = null
  private unsubscribeMain: (() => void) | null = null
  private listeners = new Set<StateListener>()

  /**
   * The "Watcher": Subscribes to store actions and calls the trigger.
   * Must be called after Pinia is installed and stores are available
   * (e.g., inside onMounted in App.vue).
   */
  public startWatching() {
    const slidesStore = useSlidesStore()
    const mainStore = useMainStore()

    console.log('[CommunicationTriggers] startWatching() called — subscribing to store actions')

    // Watch for modifications (move, edit, insert, delete)
    this.unsubscribeSlides = slidesStore.$onAction(({ name, after }) => {
      after(() => {
        const targetActions = ['addElement', 'deleteElement', 'updateElement', 'addSlide', 'deleteSlide']
        if (targetActions.includes(name)) {
          this.triggerFunction(name)
        }
      })
    })

    // Watch for selections (clicking on different elements)
    this.unsubscribeMain = mainStore.$onAction(({ name, after }) => {
      after(() => {
        if (name === 'setActiveElementIdList') {
          this.triggerFunction(name)
        }
      })
    })
  }

  /**
   * Clean up watchers (useful if the app is destroyed or you want to pause tracking)
   */
  public stopWatching() {
    if (this.unsubscribeSlides) this.unsubscribeSlides()
    if (this.unsubscribeMain) this.unsubscribeMain()
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
  }

  // ── StateSupplier contract ─────────────────────────────────────────────────

  public subscribe(listener: StateListener): Unsubscribe {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  public getSnapshot(trigger = 'snapshot'): CanvasState {
    const slidesStore = useSlidesStore()
    const mainStore = useMainStore()

    return this.serialize({
      trigger,
      selection: mainStore.activeElementList,
      slide: slidesStore.currentSlide,
      // getHistory() returns most recent first
      history: getHistory().slice(0, 5),
      viewport: {
        width: slidesStore.viewportSize,
        height: slidesStore.viewportSize * slidesStore.viewportRatio,
      },
    })
  }

  private debounceTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * The central trigger function called by the watcher
   */
  private triggerFunction(actionName: string) {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }

    // Debounce for 1.5 seconds. This prevents spamming the LLM
    // when the user is continuously dragging or resizing an element.
    this.debounceTimer = setTimeout(() => {
      const snapshot = this.getSnapshot(actionName)
      console.log(`[CommunicationTriggers] State snapshot ready (Triggered by ${actionName}):`, snapshot)
      this.listeners.forEach(listener => listener(snapshot))
    }, 1500)
  }

  /**
   * Serialize raw Pinia Proxy objects into plain, compact JSON
   * that can be safely sent over HTTP.
   */
  private serialize(raw: {
    trigger: string
    selection: any[]
    slide: any
    history: any[]
    viewport: { width: number; height: number }
  }): CanvasState {
    const now = Date.now()

    const compressElement = (el: any, contentLimit: number): CanvasElement => ({
      id: el.id,
      type: el.type,
      left: Math.round(el.left ?? 0),
      top: Math.round(el.top ?? 0),
      width: Math.round(el.width ?? 0),
      height: Math.round(el.height ?? 0),
      ...(el.fill ? { fill: el.fill } : {}),
      ...(el.type === 'text' ? {
        defaultColor: el.defaultColor,
        defaultFontName: el.defaultFontName,
        defaultSize: el.defaultSize,
        content: String(el.content).replace(/<[^>]*>/g, '').slice(0, contentLimit),
      } : {}),
    })

    const slide = raw.slide
    const background = slide?.background?.type === 'solid' ? slide?.background?.color : slide?.background?.type

    // Serialize actions — keep details that help the AI understand the action
    const history: HistoryEntry[] = raw.history.map((a: any) => ({
      type: a.type,
      targetType: a.targetType,
      ...(a.targetId ? { targetId: a.targetId } : {}),
      ...(typeof a.timestamp === 'number' ? { secondsAgo: Math.max(0, Math.round((now - a.timestamp) / 1000)) } : {}),
      ...(a.details ? { details: a.details } : {}),
    }))

    return {
      trigger: raw.trigger,
      selection: raw.selection.map(el => compressElement(el, 100)),
      slide: {
        id: slide?.id ?? '',
        ...(background ? { background } : {}),
        viewport: raw.viewport,
        elements: (slide?.elements || []).map((el: any) => compressElement(el, 40)),
      },
      history,
    }
  }
}
