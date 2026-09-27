/**
 * Candidate Action Registry
 *
 * Defines all possible menu actions with metadata. `getCandidateActions()`
 * filters and scores them based on the current selection and action history.
 */

import type { UserAction } from './actionHistory'

export type ElementApplicability =
  | 'text'
  | 'image'
  | 'shape'
  | 'line'
  | 'chart'
  | 'table'
  | 'latex'
  | 'video'
  | 'audio'
  | 'any'

export interface ActionCandidate {
  id: string
  label: string
  description: string
  icon: string
  applicableTo: ElementApplicability[]
  /** Handler is bound at usage time via ActionHandlers */
  handler?: () => void
  score?: number
}

export interface ActionHandlers {
  // Text / rich-text
  bold: () => void
  italic: () => void
  underline: () => void
  strikethrough: () => void
  fontSizeUp: () => void
  fontSizeDown: () => void
  changeTextColor: () => void

  // Alignment
  alignLeft: () => void
  alignCenter: () => void
  alignRight: () => void
  alignTop: () => void
  alignVertical: () => void
  alignBottom: () => void

  // Order / layering
  bringToFront: () => void
  sendToBack: () => void
  bringForward: () => void
  sendBackward: () => void

  // Common element operations
  duplicate: () => void
  deleteEl: () => void
  changeFill: () => void
  changeOpacity: () => void
  addShadow: () => void
  addBorder: () => void
  applyAnimation: () => void

  // Image-specific
  cropImage: () => void
  fitToSlide: () => void
  flipHorizontal: () => void
  flipVertical: () => void

  // Chart-specific
  changeChartType: () => void
  editChartData: () => void

  // Table-specific
  insertTableRow: () => void
  insertTableCol: () => void
  deleteTableRow: () => void
  deleteTableCol: () => void
}

/** Full catalogue of all possible actions */
export const ACTION_CATALOGUE: ActionCandidate[] = [
  // ── Rich-text ────────────────────────────────────────────────────────────
  {
    id: 'bold',
    label: 'Bold',
    description: 'Make text bold',
    icon: 'bold',
    applicableTo: ['text', 'shape'],
  },
  {
    id: 'italic',
    label: 'Italic',
    description: 'Make text italic',
    icon: 'italic',
    applicableTo: ['text', 'shape'],
  },
  {
    id: 'underline',
    label: 'Underline',
    description: 'Underline text',
    icon: 'underline',
    applicableTo: ['text', 'shape'],
  },
  {
    id: 'strikethrough',
    label: 'Strikethrough',
    description: 'Add strikethrough to text',
    icon: 'strikethrough',
    applicableTo: ['text', 'shape'],
  },
  {
    id: 'fontSizeUp',
    label: 'Increase Font Size',
    description: 'Increase font size',
    icon: 'font-size-up',
    applicableTo: ['text', 'shape'],
  },
  {
    id: 'fontSizeDown',
    label: 'Decrease Font Size',
    description: 'Decrease font size',
    icon: 'font-size-down',
    applicableTo: ['text', 'shape'],
  },
  {
    id: 'changeTextColor',
    label: 'Text Color',
    description: 'Change text color',
    icon: 'font-color',
    applicableTo: ['text', 'shape', 'table'],
  },

  // ── Alignment ────────────────────────────────────────────────────────────
  {
    id: 'alignLeft',
    label: 'Align Left',
    description: 'Align element to left edge of slide',
    icon: 'align-left',
    applicableTo: ['any'],
  },
  {
    id: 'alignCenter',
    label: 'Center Horizontally',
    description: 'Center element horizontally',
    icon: 'align-center',
    applicableTo: ['any'],
  },
  {
    id: 'alignRight',
    label: 'Align Right',
    description: 'Align element to right edge of slide',
    icon: 'align-right',
    applicableTo: ['any'],
  },
  {
    id: 'alignTop',
    label: 'Align Top',
    description: 'Align element to top of slide',
    icon: 'align-top',
    applicableTo: ['any'],
  },
  {
    id: 'alignVertical',
    label: 'Center Vertically',
    description: 'Center element vertically',
    icon: 'align-vertically',
    applicableTo: ['any'],
  },
  {
    id: 'alignBottom',
    label: 'Align Bottom',
    description: 'Align element to bottom of slide',
    icon: 'align-bottom',
    applicableTo: ['any'],
  },

  // ── Order / layering ─────────────────────────────────────────────────────
  {
    id: 'bringToFront',
    label: 'Bring to Front',
    description: 'Bring element to front',
    icon: 'send-to-back',
    applicableTo: ['any'],
  },
  {
    id: 'sendToBack',
    label: 'Send to Back',
    description: 'Send element to back',
    icon: 'bring-to-front-one',
    applicableTo: ['any'],
  },
  {
    id: 'bringForward',
    label: 'Bring Forward',
    description: 'Move element one layer forward',
    icon: 'bring-to-front',
    applicableTo: ['any'],
  },
  {
    id: 'sendBackward',
    label: 'Send Backward',
    description: 'Move element one layer backward',
    icon: 'sent-to-back',
    applicableTo: ['any'],
  },

  // ── Common ───────────────────────────────────────────────────────────────
  {
    id: 'duplicate',
    label: 'Duplicate',
    description: 'Duplicate the selected element',
    icon: 'copy',
    applicableTo: ['any'],
  },
  {
    id: 'deleteEl',
    label: 'Delete',
    description: 'Delete the selected element',
    icon: 'delete',
    applicableTo: ['any'],
  },
  {
    id: 'changeFill',
    label: 'Fill Color',
    description: 'Change fill color',
    icon: 'fill-color',
    applicableTo: ['text', 'shape', 'chart', 'table'],
  },
  {
    id: 'changeOpacity',
    label: 'Opacity',
    description: 'Change element opacity',
    icon: 'transparency',
    applicableTo: ['text', 'image', 'shape'],
  },
  {
    id: 'addShadow',
    label: 'Add Shadow',
    description: 'Add drop shadow',
    icon: 'shadow',
    applicableTo: ['text', 'image', 'shape'],
  },
  {
    id: 'addBorder',
    label: 'Add Border',
    description: 'Add border/outline',
    icon: 'border-outer',
    applicableTo: ['text', 'image', 'shape'],
  },
  {
    id: 'applyAnimation',
    label: 'Add Animation',
    description: 'Apply entrance animation',
    icon: 'lightning',
    applicableTo: ['any'],
  },

  // ── Image-specific ───────────────────────────────────────────────────────
  {
    id: 'cropImage',
    label: 'Crop Image',
    description: 'Crop the image',
    icon: 'crop',
    applicableTo: ['image'],
  },
  {
    id: 'fitToSlide',
    label: 'Fit to Slide',
    description: 'Fit image to fill the slide',
    icon: 'fullscreen',
    applicableTo: ['image'],
  },
  {
    id: 'flipHorizontal',
    label: 'Flip Horizontal',
    description: 'Flip element horizontally',
    icon: 'flip-horizontally',
    applicableTo: ['image', 'shape'],
  },
  {
    id: 'flipVertical',
    label: 'Flip Vertical',
    description: 'Flip element vertically',
    icon: 'flip-vertically',
    applicableTo: ['image', 'shape'],
  },

  // ── Chart-specific ───────────────────────────────────────────────────────
  {
    id: 'changeChartType',
    label: 'Change Chart Type',
    description: 'Change chart type (bar, line, pie…)',
    icon: 'chart-histogram',
    applicableTo: ['chart'],
  },
  {
    id: 'editChartData',
    label: 'Edit Chart Data',
    description: 'Edit chart data',
    icon: 'table',
    applicableTo: ['chart'],
  },

  // ── Table-specific ───────────────────────────────────────────────────────
  {
    id: 'insertTableRow',
    label: 'Insert Row',
    description: 'Insert a table row below',
    icon: 'insert-table',
    applicableTo: ['table'],
  },
  {
    id: 'insertTableCol',
    label: 'Insert Column',
    description: 'Insert a table column to the right',
    icon: 'insert-table',
    applicableTo: ['table'],
  },
  {
    id: 'deleteTableRow',
    label: 'Delete Row',
    description: 'Delete selected table row',
    icon: 'delete-table',
    applicableTo: ['table'],
  },
  {
    id: 'deleteTableCol',
    label: 'Delete Column',
    description: 'Delete selected table column',
    icon: 'delete-table',
    applicableTo: ['table'],
  },
]

export interface PredictionContext {
  actionHistory: UserAction[]
  selection: {
    type: string
    id: string
    properties: Record<string, unknown>
  } | null
  slideSummary: {
    elementCounts: Record<string, number>
    totalElements: number
  }
  candidates: ActionCandidate[]
}

/**
 * Returns up to 20 action candidates filtered and scored for the current context.
 * Scoring:
 *   - Exact element-type match: +4
 *   - 'any' applicability: +1
 *   - Each matching action type in recent history: +2 (max 5 entries checked)
 */
export function getCandidateActions(
  context: Pick<PredictionContext, 'actionHistory' | 'selection'>,
  handlers: Partial<ActionHandlers>,
): ActionCandidate[] {
  const selType = context.selection?.type ?? ''

  // Recent history for recency scoring (up to last 5)
  const recentIds = new Set<string>(
    context.actionHistory.slice(0, 5).map(a => {
      // Map action details back to candidate IDs if available
      if (a.details && Array.isArray(a.details.props)) {
        const props = a.details.props as string[]
        if (props.includes('fill')) return 'changeFill'
        if (props.includes('opacity')) return 'changeOpacity'
        if (props.includes('shadow')) return 'addShadow'
        if (props.includes('outline')) return 'addBorder'
      }
      return null
    }).filter(Boolean) as string[]
  )

  const recentActionTypes = context.actionHistory.slice(0, 5).map(a => a.type)

  const scored = ACTION_CATALOGUE
    .filter(action => {
      if (action.applicableTo.includes('any')) return true
      if (!selType) return false
      return action.applicableTo.includes(selType as ElementApplicability)
    })
    .map(action => {
      let score = 0

      // Element-type match scoring
      if (action.applicableTo.includes('any')) {
        score += 1
      } else if (selType && action.applicableTo.includes(selType as ElementApplicability)) {
        score += 4
      }

      // Recency bonus — if this exact action was recently performed
      if (recentIds.has(action.id)) score += 2

      // Action-type heuristics based on recent history patterns
      if (recentActionTypes.includes('format') && ['text', 'shape'].includes(selType)) {
        if (['bold', 'italic', 'underline', 'changeTextColor', 'changeFill'].includes(action.id)) score += 1
      }
      if (recentActionTypes.includes('move') || recentActionTypes.includes('resize')) {
        if (['alignCenter', 'alignVertical', 'fitToSlide'].includes(action.id)) score += 1
      }
      if (recentActionTypes.includes('insert')) {
        if (['duplicate', 'applyAnimation', 'alignCenter'].includes(action.id)) score += 1
      }

      // Bind the handler if available
      const boundHandler = handlers[action.id as keyof ActionHandlers]
      return {
        ...action,
        score,
        handler: boundHandler,
      }
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))

  return scored.slice(0, 20)
}
