/**
 * Action History Recorder
 *
 * A singleton ring-buffer that maintains the last N user actions by subscribing
 * to Pinia store $onAction hooks. Call `initActionHistory()` once at app startup.
 *
 * Does NOT modify any existing store logic — purely observational.
 */

import type { Pinia } from 'pinia'
import emitter, { EmitterEvents } from '@/utils/emitter'

export type ActionType =
  | 'select'
  | 'insert'
  | 'delete'
  | 'update'
  | 'align'
  | 'format'
  | 'move'
  | 'resize'
  | 'order'

export type TargetElementType =
  | 'text'
  | 'image'
  | 'shape'
  | 'line'
  | 'chart'
  | 'table'
  | 'latex'
  | 'video'
  | 'audio'
  | 'slide'
  | 'unknown'

export interface UserAction {
  type: ActionType
  targetType: TargetElementType
  targetId?: string
  timestamp: number
  details?: Record<string, unknown>
}

const MAX_HISTORY = 10
const history: UserAction[] = []

/** Text-formatting related props that indicate a format action vs a generic update */
const FORMAT_PROPS = new Set([
  'defaultFontName', 'defaultColor', 'lineHeight', 'wordSpace',
  'paragraphSpace', 'vertical', 'fill', 'outline', 'shadow',
  'opacity', 'color',
])

/** Geometry-related props that indicate a move/resize action */
const GEOMETRY_PROPS = new Set(['left', 'top', 'width', 'height', 'rotate'])

/**
 * Classify props dict returned from updateElement to determine action type
 */
function classifyUpdateProps(props: Record<string, unknown>): ActionType {
  const keys = Object.keys(props)
  if (keys.every(k => GEOMETRY_PROPS.has(k))) return 'move'
  if (keys.some(k => FORMAT_PROPS.has(k))) return 'format'
  return 'update'
}

/**
 * Record a single user action into the ring buffer.
 */
function record(action: UserAction) {
  history.push(action)
  if (history.length > MAX_HISTORY) history.shift()
  // Broadcast so the prediction service knows to refresh
  emitter.emit(EmitterEvents.AI_MENU_ACTION_RECORDED)
}

/**
 * Public function to record a user action.
 */
export function recordAction(action: Omit<UserAction, 'timestamp'>) {
  record({
    ...action,
    timestamp: Date.now(),
  })
}

/**
 * Return a copy of the action history, most recent first.
 */
export function getHistory(): UserAction[] {
  return [...history].reverse()
}

/**
 * Clear the history buffer (useful for testing or on slide change).
 */
export function clearHistory() {
  history.length = 0
}

let initialized = false

/**
 * Initialize the action history recorder by subscribing to Pinia store actions.
 * Should be called once in App.vue onMounted().
 */
export function initActionHistory() {
  if (initialized) return
  initialized = true

  // Dynamically import stores to avoid circular deps at module load time
  import('@/store/main').then(({ useMainStore }) => {
    import('@/store/slides').then(({ useSlidesStore }) => {
      const mainStore = useMainStore()
      const slidesStore = useSlidesStore()

      // ── Main store subscriptions ─────────────────────────────────────────────

      mainStore.$onAction(({ name, args, after }) => {
        after(() => {
          if (name === 'setActiveElementIdList') {
            const [idList] = args as [string[]]
            if (!idList || idList.length === 0) return // Deselect — not interesting

            // Derive element type from the current slide
            const slide = slidesStore.currentSlide
            const el = slide?.elements?.find((e: { id: string }) => e.id === idList[0])
            const targetType: TargetElementType = (el?.type as TargetElementType) ?? 'unknown'

            record({
              type: 'select',
              targetType,
              targetId: idList[0],
              timestamp: Date.now(),
              details: { count: idList.length },
            })
          }
        })
      })

      // ── Slides store subscriptions ───────────────────────────────────────────

      slidesStore.$onAction(({ name, args, after }) => {
        after(() => {
          switch (name) {
            case 'addElement': {
              const [elementOrList] = args as [unknown]
              const elements = Array.isArray(elementOrList) ? elementOrList : [elementOrList]
              for (const el of elements as Array<{ id: string; type: string }>) {
                record({
                  type: 'insert',
                  targetType: (el.type as TargetElementType) ?? 'unknown',
                  targetId: el.id,
                  timestamp: Date.now(),
                })
              }
              break
            }

            case 'deleteElement': {
              const [idOrList] = args as [unknown]
              const ids = Array.isArray(idOrList) ? idOrList : [idOrList]
              for (const id of ids as string[]) {
                record({
                  type: 'delete',
                  targetType: 'unknown',
                  targetId: id,
                  timestamp: Date.now(),
                })
              }
              break
            }

            case 'updateElement': {
              const [data] = args as [{ id: string | string[]; props: Record<string, unknown>; slideId?: string }]
              const ids = Array.isArray(data.id) ? data.id : [data.id]
              const slide = slidesStore.currentSlide
              const actionType = classifyUpdateProps(data.props)

              for (const id of ids) {
                const el = slide?.elements?.find((e: { id: string }) => e.id === id)
                record({
                  type: actionType,
                  targetType: (el?.type as TargetElementType) ?? 'unknown',
                  targetId: id,
                  timestamp: Date.now(),
                  details: { props: Object.keys(data.props) },
                })
              }
              break
            }

            case 'addSlide': {
              record({
                type: 'insert',
                targetType: 'slide',
                timestamp: Date.now(),
              })
              break
            }

            case 'deleteSlide': {
              record({
                type: 'delete',
                targetType: 'slide',
                timestamp: Date.now(),
              })
              break
            }

            default:
              break
          }
        })
      })
    })
  })
}
