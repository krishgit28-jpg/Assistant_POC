# Ghost Overlay Hover Previews

## Overview
Replaced the traditional thumbnail popover preview with a native "Ghost Overlay" on the main canvas. When a user hovers over an AI prediction card, the proposed changes are simulated and rendered as a translucent layer directly on top of the actual slide, providing a seamless "what-if" preview without altering the true slide state.

## Technical Implementation
1. **State Management (`src/store/main.ts`)**: 
   - Introduced a `previewElements: PPTElement[]` array in the Pinia main store to track elements currently being previewed.
   - Added the `setPreviewElements` action to securely mutate this state.
2. **Prediction Simulation (`src/views/Editor/AiPredictionsPanel.vue`)**:
   - On `@mouseenter` of an AI prediction card, the currently active element is deep-cloned.
   - The sequence of predicted commands (e.g., `bold`, `alignCenter`, `changeTextColor`, `duplicate`) are iterated and mathematically simulated on the clone.
   - For `duplicate` commands, the X and Y coordinates are offset by `20px`.
   - **Crucial fix**: The clone's ID is appended with `-preview` (e.g., `targetEl.id + '-preview'`) to avoid Vue reactivity collisions with the original element on the canvas.
   - The clone is then pushed to `mainStore.previewElements`. On `@mouseleave`, the array is wiped clean.
3. **Canvas Rendering (`src/views/Editor/Canvas/index.vue`)**:
   - A dedicated `.ai-ghost-preview` container was added to the main viewport.
   - It iterates through `previewElements` and mounts them using the existing `<EditableElement>` component.
   - The container is styled with `opacity: 0.6` and `pointer-events: none` to ensure it acts purely as a visual indicator and doesn't intercept user clicks or drag events.
   - It uses `z-index: 9999` to ensure it renders above all other elements.
