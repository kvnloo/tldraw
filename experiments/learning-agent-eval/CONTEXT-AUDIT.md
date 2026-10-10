# Agent context audit

Findings from tracing the current agent starter against the learning-canvas workload.

## 1. Peripheral clustering

`convertTldrawShapesToPeripheralShapes` documents nearby-shape clustering, but padded boxes are merged only on full containment. Equal-sized adjacent nodes therefore remain separate.

Upstream: tldraw/tldraw#10972.

## 2. Unbounded history

`AgentChatManager` stores the entire session. `ChatHistoryPartUtil` clones it all on every request, and `buildMessages` only orders by priority. No history/token/byte budget is applied.

Upstream: tldraw/tldraw#10973.

## 3. Partial viewport visibility

`BlurryShapesPartUtil` and `ScreenshotPartUtil` require full viewport containment. `PeripheralShapesPartUtil` treats the inverse as offscreen. A shape crossing a viewport edge is therefore omitted from visible structured context and screenshot input while being labeled peripheral.

Upstream: tldraw/tldraw#10974.

## Eval additions

For long-canvas runs, record:

- current-page shape count
- visible shape count by full containment
- visible shape count by collision
- peripheral shape count
- peripheral cluster count
- chat-history item count
- serialized chat-history bytes
- total prompt bytes

The first useful comparison is a grid of 100 equal-sized nodes with 20px gaps, then 500 / 1000 nodes, with the viewport centered on one cluster.
