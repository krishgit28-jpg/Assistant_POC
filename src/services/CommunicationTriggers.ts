import { useSlidesStore, useMainStore } from '@/store'
import { getHistory } from '@/services/actionHistory'

export class CommunicationTriggers {
  // Store the unsubscribe functions so we can clean up if needed
  private unsubscribeSlides: (() => void) | null = null
  private unsubscribeMain: (() => void) | null = null

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
  }

  /**
   * The central trigger function called by the watcher
   */
  private triggerFunction(actionName: string) {
    // Using a microtask is near-instant and much more efficient than setTimeout.
    // It guarantees actionHistory is fully updated first without delaying execution to the macrotask queue.
    Promise.resolve().then(() => {
      const slidesStore = useSlidesStore()
      const mainStore = useMainStore()
  
      // 1. Current Selection (The actual element objects currently selected)
      const currentSelection = mainStore.activeElementList
      
      // 2. Current Slide State
      const currentSlide = slidesStore.currentSlide
  
      // 3. Last 5 Actions (getHistory() returns most recent first)
      const last5Actions = getHistory().slice(0, 5)
  
      const mcpPayload = {
        triggerAction: actionName,
        currentSelection,
        currentSlide,
        last5Actions
      }
  
      // Log the payload so we can inspect it in the browser console
      console.log(`[CommunicationTriggers] Data prepared for MCP Bridge (Triggered by ${actionName}):`, mcpPayload)
      
      // Send to the MCP Bridge server
      this.sendToMCPBridge(mcpPayload)
    }).catch(err => {
      console.error('[CommunicationTriggers] Error in trigger promise:', err)
    })
  }

  /**
   * Serialize raw Pinia Proxy objects into plain, compact JSON
   * that can be safely sent over HTTP.
   */
  private serializePayload(payload: any): object {
    const now = Date.now()

    // Serialize selected elements — only what's needed to identify them
    const currentSelection = (payload.currentSelection || []).map((el: any) => ({
      id: el.id,
      type: el.type,
      ...(el.type === 'text' && el.content ? { content: String(el.content).replace(/<[^>]*>/g, '').slice(0, 60) } : {}),
    }))

    // Serialize slide — include geometry and colors of all elements for alignment/contrast detection
    const slide = payload.currentSlide
    const elements = slide?.elements || []
    
    const compressedElements = elements.map((el: any) => ({
      id: el.id,
      type: el.type,
      left: Math.round(el.left ?? 0),
      top: Math.round(el.top ?? 0),
      width: Math.round(el.width ?? 0),
      height: Math.round(el.height ?? 0),
      ...(el.fill ? { fill: el.fill } : {}),
      ...(el.type === 'text' ? { 
        defaultColor: el.defaultColor,
        content: String(el.content).replace(/<[^>]*>/g, '').slice(0, 40)
      } : {}),
    }))

    const currentSlide = {
      id: slide?.id ?? '',
      background: slide?.background?.type === 'solid' ? slide?.background?.color : slide?.background?.type,
      elements: compressedElements,
    }

    // Serialize actions — keep details that help AI understand the action (skip timestamps)
    const last5Actions = (payload.last5Actions || []).map((a: any) => ({
      type: a.type,
      targetType: a.targetType,
      ...(a.targetId ? { targetId: a.targetId } : {}),
      ...(a.details ? { details: a.details } : {}),
    }))

    return {
      triggerAction: payload.triggerAction,
      currentSelection,
      currentSlide,
      last5Actions,
    }
  }

  /**
   * POST the serialized payload to the MCP Bridge HTTP server.
   * Silently fails if the server is not running — the app should never break.
   */
  private async sendToMCPBridge(payload: any) {
    try {
      const serialized = this.serializePayload(payload)

      const response = await fetch('http://localhost:3100/context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serialized),
        signal: AbortSignal.timeout(2000), // 2s timeout
      })

      if (response.ok) {
        console.log('[CommunicationTriggers] ✅ Context sent to MCP server')
      }
      else {
        console.warn(`[CommunicationTriggers] MCP server returned ${response.status}`)
      }
    }
    catch {
      // Silently ignore — MCP server may not be running
    }
  }
}
