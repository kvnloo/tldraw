---
title: Zer0 canvas copilot
component: ./Zer0CanvasExample.tsx
category: use-cases
priority: 1
keywords: [zer0, xyflow, architecture, copilot, structured artifacts]
multiplayer: false
---

Tldraw owns the infinite canvas while XYFlow renders a persistent structured architecture artifact.

The graph is stored in the props of a custom tldraw shape, so it participates in selection, movement,
resizing, persistence, and undo/redo like other canvas content. The versioned JSON contract lets
voice, meeting, and harness adapters propose deterministic graph mutations without owning the editor.
