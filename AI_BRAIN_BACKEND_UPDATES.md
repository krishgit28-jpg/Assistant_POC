# Upgraded AI Brain & Backend Actions

## Overview
Expanded the capabilities of the AI Assistant to support complex text generation and multi-object alignment, transitioning away from hardcoded heuristics toward a dynamic LLM-driven payload.

## Technical Implementation
1. **Action Execution (`src/services/stepExecutor.ts`)**:
   - Augmented the `commandMap` to support new AI-driven commands:
     - `updateTextContent`: Updates the rich text content of an existing text element.
     - `generateSubtitle`: Generates a brand new text element and mounts it to the slide.
     - `alignGroupLeft`: Leverages `useAlignActiveElement` to align multiple selected objects collectively.
2. **MCP Bridge Integration (`mcp-server/src/mcpServer.ts`)**:
   - Updated the Zod validation schema in the `send_predicted_actions` tool.
   - The server now safely accepts the new `updateTextContent`, `generateSubtitle`, and `alignGroupLeft` commands from the LLM.
3. **LLM Guidelines (`OPENCLAW_SKILL.md`)**:
   - Documented the new commands in the skill definition, explicitly granting the LLM the capability to generate text and group alignments.
4. **Heuristic Decoupling (`mcp-server/src/aiAssistantRunner.ts`)**:
   - Bypassed the hardcoded local AI heuristics.
   - Ensures that the system strictly defers to the LLM via the MCP payload for true intelligence. *(Note: The mock data was temporarily preserved strictly to facilitate local UI testing without an active LLM connection).*
