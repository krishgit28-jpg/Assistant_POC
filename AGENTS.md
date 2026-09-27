# PPTist - Agent Action Guide

This guide provides an overview of the APIs, state management stores, and functions available in the PPTist codebase to interact with the presentation editor. It specifies which APIs are directly available and which require wrappers (e.g., executing within the Vue component context).

## 1. Current State of the Slide
**Directly Available API:** Yes, via Pinia Stores (`useSlidesStore`).

To get the current state of the slide (including elements, background, animations), you can access the Pinia `useSlidesStore`:

```typescript
import { useSlidesStore } from '@/store'
import { storeToRefs } from 'pinia'

// Inside a Vue component or wrapper:
const slidesStore = useSlidesStore()

// Access all slides
const allSlides = slidesStore.slides

// Get current slide index
const currentIndex = slidesStore.slideIndex

// Get current active slide object (with elements)
const currentSlide = slidesStore.currentSlide

// Get current slide's animations
const animations = slidesStore.currentSlideAnimations
```
*Note: Since Pinia stores are global, you can import and use `useSlidesStore()` anywhere once the app is mounted.*

## 2. Current Selection of the Slide
**Directly Available API:** Yes, via Pinia Stores (`useMainStore`).

To get information about what elements or slides the user has currently selected:

```typescript
import { useMainStore } from '@/store'

const mainStore = useMainStore()

// Array of currently selected element IDs
const activeElementIdList = mainStore.activeElementIdList

// If a single element is selected, this is its ID
const handleElementId = mainStore.handleElementId

// Getter returning the actual PPTElement objects currently selected
const activeElements = mainStore.activeElementList

// Getter returning the single actively manipulated PPTElement object
const handleElement = mainStore.handleElement

// Array of selected slide indices (in the left thumbnail pane)
const selectedSlidesIndex = mainStore.selectedSlidesIndex
```

## 3. Tracking User Actions
**Directly Available API:** Yes, via the `actionHistory` service (`src/services/actionHistory.ts`).

To track which actions the user has recently performed (e.g., selecting, moving, formatting, inserting elements), you can use the `getHistory` function. The system automatically records these actions using Pinia `$onAction` subscriptions.

```typescript
import { getHistory, recordAction } from '@/services/actionHistory'

// Retrieve the history buffer (array of the most recent user actions, most recent first)
const recentActions = getHistory()

/* 
Example of a UserAction object in the history array:
{
  type: 'update' | 'format' | 'move' | 'select' | 'insert' | 'delete' | 'align' | 'resize' | 'order',
  targetType: 'text' | 'image' | 'shape' | 'slide' | 'unknown' | etc.,
  targetId: 'element-id',
  timestamp: 1690000000000,
  details: { props: ['fill', 'width'] } // Optional metadata
}
*/

// You can also manually record a custom action if needed:
recordAction({
  type: 'format',
  targetType: 'text',
  targetId: 'custom-id',
  details: { customProp: 'value' }
})
```

## 4. Editing or Hiding Available Menu
**Directly Available API:** Yes, via `useMainStore`.

The visibility of context menus, floating menus, and toolbars is controlled entirely by the main store state.

```typescript
const mainStore = useMainStore()

// Toggle the floating "Bubble Menu" for rich text editing
mainStore.setBubbleMenuState(false) // Hide
mainStore.setBubbleMenuState(true)  // Show

// Change the state of the right-side Toolbar (e.g., styling vs. animations)
import { ToolbarStates } from '@/types/toolbar'
mainStore.setToolbarState(ToolbarStates.SLIDE_DESIGN)
mainStore.setToolbarState(ToolbarStates.MULTI_POSITION)
```

## 5. Showing an AI Menu in its Place
**Directly Available API:** Partial (Wrapper/Component Context Required).

PPTist has a dedicated AI Menu prediction hook (`src/hooks/useAiMenu.ts`) that listens to the `handleElement` (current selection) and fetches context-aware predicted actions.

To display an AI menu, you can toggle the state and use the `useAiMenu` composable inside a component:

```typescript
// 1. Update State to show AI Dialog/Menu
const mainStore = useMainStore()
mainStore.setAIPPTDialogState(true) 
// mainStore.aiMenuPredictions holds the top-5 predicted action IDs
// mainStore.aiMenuLoading indicates prediction in progress

// 2. Inside a Vue Component (Wrapper Required)
import { useAiMenu } from '@/hooks/useAiMenu'

export default {
  setup() {
    const { aiMenuPredictions, aiMenuLoading, getActionForId, retryPrediction } = useAiMenu()
    
    // To execute a predicted action:
    const actionId = aiMenuPredictions.value[0]
    const action = getActionForId(actionId)
    if (action && action.handler) {
      action.handler()
    }
  }
}
```

## 6. Showing a Preview of the Changed Components of the Slide
**Directly Available API:** Component available, needs wrapper to render.

To show a preview of a slide (or how it would look after changes), use the existing `<ThumbnailSlide>` Vue component. It renders a scaled, read-only version of a full slide object.

*Wrapper Required:* You must mount or use this component within a Vue template.

```vue
<!-- Wrapper Component to Preview a Slide -->
<template>
  <ThumbnailSlide 
    :slide="previewSlideObject" 
    :size="400" 
    :visible="true" 
  />
</template>

<script setup lang="ts">
import ThumbnailSlide from '@/views/components/ThumbnailSlide/index.vue'
import type { Slide } from '@/types/slides'

// Construct your modified slide state
const previewSlideObject: Slide = {
  // ... current slide state + proposed modifications
}
</script>
```

For individual element previews, you can also use `<ThumbnailElement :elementInfo="element" />`.

## 7. Real-Time Action Triggers and Interception
**Directly Available API:** Yes, via `CommunicationTriggers.ts`.

To fire custom logic instantly when the user performs specific actions (like selecting an element, deleting a slide, or modifying shapes), the `CommunicationTriggers` class is used. It safely hooks into Pinia's `$onAction` and operates without polluting the global event bus.

**Relevant Files:**
- `src/services/CommunicationTriggers.ts`: Houses the watcher and payload generation logic.
- `src/App.vue`: Initializes the watcher globally during the `onMounted` lifecycle hook.

```typescript
import { CommunicationTriggers } from '@/services/CommunicationTriggers'

// Initialized in App.vue using the global Pinia instance
const commTriggers = new CommunicationTriggers(piniaInstance)

// Starts intercepting user actions (e.g., setActiveElementIdList, updateElement)
commTriggers.startWatching()

// When an action occurs, it prepares an MCP Payload containing:
// 1. Current Selection (mainStore.activeElementList)
// 2. Current Slide State (slidesStore.currentSlide)
// 3. Last 5 Actions (getHistory().slice(0, 5))
```
*Note: The triggers use a `Promise.resolve().then(...)` microtask to ensure that the underlying store mutations and `actionHistory` updates have completely finished before the trigger fires.*
