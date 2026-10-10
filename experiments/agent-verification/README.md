# Agent verification experiments

Downstream-only evidence branch for checking whether a streamed agent action actually produced the intended canvas state.

Base: upstream `main` at `7937be360bcb8239d89e420850843f81313fc07b`.

## Concrete fixes on this branch

### Zero-coordinate transform origins

`ResizeActionUtil` and `RotateActionUtil` used truthiness checks for `originX` / `originY`. A valid origin coordinate of `0` therefore caused the action to return without changing the canvas.

Tracked upstream in tldraw/tldraw#11081.

The branch changes only the origin presence checks. Existing zero-scale / zero-degree no-op behavior remains unchanged.

## Verification findings

### Unresolved lint suppression

A lint key is marked surfaced before the repair attempt. If the same lint remains after the attempted repair, the key is suppressed for the rest of the prompt chain and `working.onPromptEnd` can return to idle with the defect unresolved.

Tracked upstream in tldraw/tldraw#11079.

### Created-vs-existing lint blind spot

Working-mode lint detection passes only shapes created by the agent. That keeps scope narrow, but it also makes the created set the comparison universe, so a new shape overlapping an existing shape can be invisible to the linter.

Tracked upstream in tldraw/tldraw#11080.

### Successful-looking no-op actions

Several bulk-action sanitizers remove invalid ids but still accept an action whose remaining targets cannot perform the operation. Core editor methods correctly no-op for too few shapes, but `AgentActionManager` can still save the action with an empty diff and later history sends the action payload back to the model.

Tracked upstream in tldraw/tldraw#11082.

## Verification invariant

An agent action should have an observable execution outcome:

- `applied`: canvas state changed as intended
- `idempotent`: valid action, no change was needed
- `rejected`: invalid / unavailable targets or invalid arguments
- `failed`: execution threw or an asynchronous dependency failed
- `unresolved`: post-condition verification failed after bounded repair attempts

The model should not have to infer `applied` merely because an action payload exists in chat history.
