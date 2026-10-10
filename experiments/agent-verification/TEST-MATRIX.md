# Agent verification test matrix

## Transform coordinates

| Case | Expected |
| --- | --- |
| resize around `(0, 50)` | applied |
| resize around `(50, 0)` | applied |
| resize around `(0, 0)` | applied |
| rotate around `(0, 50)` | applied |
| rotate around `(50, 0)` | applied |
| rotate around `(0, 0)` | applied |
| rotate by `0deg` | explicit idempotent / no-op |
| missing streamed origin | do not apply yet |

## Lint repair loop

| Case | Expected |
| --- | --- |
| lint appears, repair resolves it | one repair pass, then idle |
| lint appears, repair leaves same defect | lint may be verified again |
| same lint fails repeatedly | stop after bounded retry count and report unresolved |
| old unrelated canvas lint | do not surface solely because the agent ran |

## Lint comparison scope

| Case | Expected |
| --- | --- |
| new shape overlaps new shape | lint |
| new shape overlaps existing shape | lint |
| existing overlaps existing, untouched by agent | no new lint |
| new growY text collides with existing geo | lint |

## Target validation

| Action | Minimum meaningful validated targets |
| --- | ---: |
| align | 2 |
| distribute | 3 |
| stack | 2 |
| rotate | 1 |
| resize | 1 |
| bring-to-front | 1 |
| send-to-back | 1 |

For every rejected target set, verify that no successful-looking action is added to model-facing history.
