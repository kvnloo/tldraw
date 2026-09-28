# Learning agent eval

Goal: stress the tldraw agent with a multi-turn tutoring workflow and collect evidence about context growth, spatial correctness, and action reliability before proposing upstream changes.

## Baseline

Run against the agent template without changing agent behavior. Enable existing completed-action logging plus the local prompt-metrics patch in this directory.

## Workload

Use one canvas for 20 turns.

1. Ask the agent to teach Newton's second law with a small concept map.
2. Ask for a worked force / mass / acceleration example.
3. Move one node and ask the agent to repair the layout without changing semantics.
4. Add an incorrect learner answer and ask the agent to diagnose it visually.
5. Ask the agent to add a second example that reuses the existing concept map.
6. Pan away from the main cluster and ask a question that depends on an offscreen node.
7. Select one node and ask for a local explanation only.
8. Ask the agent to connect the example to momentum without deleting prior work.
9. Add a learner-created shape in the wrong cluster and ask the agent to relocate it.
10. Ask for a retrieval question without adding explanatory text.
11-20. Repeat the same patterns with progressively larger canvas state.

## Record per request

- serialized prompt bytes, total and by prompt part
- number and type of completed actions
- unknown / rejected / failed actions
- number of corrective actions
- whether the requested spatial change was correct
- whether unrelated canvas regions changed
- whether the agent had to move its viewport
- total shapes before / after the request
- elapsed request time

## Primary acceptance criteria

The first run is complete when all 20 turns have receipts.

A candidate upstream issue needs:

- a reproducible failure on current `main`
- the smallest affected API or subsystem identified
- at least three repetitions for quantitative claims
- no product-specific requirement in the proposed fix
- a clear distinction between SDK behavior and tldraw.com policy

Do not open upstream issues for tutor-specific behavior. Extract the general canvas / agent primitive first.
