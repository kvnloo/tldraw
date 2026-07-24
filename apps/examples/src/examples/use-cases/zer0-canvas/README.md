---
title: Zer0 canvas copilot
component: ./Zer0CanvasExample.tsx
category: use-cases
priority: 1
keywords: [zer0, xyflow, architecture, copilot, structured artifacts]
multiplayer: true
---

Tldraw owns the infinite canvas while XYFlow renders a persistent structured architecture artifact.

The graph is stored in the props of a custom tldraw shape, so it participates in selection, movement,
resizing, persistence, and undo/redo like other canvas content. The versioned JSON contract lets
voice, meeting, and harness adapters propose deterministic graph mutations without owning the editor.
`Track Meet live` is an explicit-consent browser adapter: the user selects the
active Meet tab with tab audio, local Faster-Whisper commits bounded transcript
segments to the shared relay, and the same persistent meeting-note projection
updates every connected canvas. It does not claim that the Google transcript
REST API is a live caption stream.
When `VITE_ZERO_SYNC_URL` is set, the canvas uses its self-hosted
`@tldraw/sync` room and SQLite-backed WebSocket server; without it, local
IndexedDB persistence remains available for standalone development.
