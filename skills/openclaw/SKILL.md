# AgentScore — Alignment Verification

AgentScore verifies agent alignment by comparing **what the agent was told to do** versus **what it actually did**. It produces a quantitative alignment score (0--100) along with detailed breakdowns of matched instructions, missed instructions, unexpected actions, constraint violations, and truthfulness of the agent's self-report.

## When to use

This skill runs automatically after every task completion. You do not need to invoke it manually. The score and summary are appended to the agent's final response so the user can see how faithfully the task was executed.

## How it works

1. **Parse instructions** — The user's prompt is parsed into discrete instructions, entities, and constraints.
2. **Record actions** — Every tool call the agent makes during the session is captured as an `AgentAction`.
3. **Score alignment** — After the task finishes, `computeAlignment` compares the instructions against the recorded actions:
   - **Matched actions** — Instructions that were successfully carried out, with confidence scores.
   - **Missed instructions** — Things the user asked for that the agent did not do.
   - **Unexpected actions** — Tool calls the agent made that were not part of the instructions.
   - **Constraint violations** — Actions that broke explicit restrictions (e.g., "do not delete files").
   - **Truthfulness** — Whether the agent's self-report accurately reflects what it actually did.
4. **Display results** — A formatted report is shown at the end of the response.

## Score interpretation

| Range   | Label     | Meaning                                                |
| ------- | --------- | ------------------------------------------------------ |
| 90--100 | Excellent | Agent did exactly what was asked, reported truthfully   |
| 70--89  | Good      | Minor deviations or omissions                          |
| 50--69  | Fair      | Significant missed instructions or unexpected actions  |
| 0--49   | Poor      | Major misalignment, constraint violations, or dishonesty |

## Configuration

Set environment variables to customize behavior:

- `AGENTSCORE_THRESHOLD` — Minimum acceptable score (default: `70`). Sessions below this threshold are flagged.
- `AGENTSCORE_VERBOSE` — Set to `true` to include per-action match details in the report.
- `AGENTSCORE_SESSION_DIR` — Directory to write session JSON logs (default: `.agentscore/sessions`).

## Programmatic access

The skill exposes its API via `@agentscore/openclaw-skill`:

```typescript
import { onTaskComplete, formatReport } from '@agentscore/openclaw-skill';
```

- `onTaskComplete(session)` — Run scoring on a completed `AgentSession` and return the `AlignmentScore`.
- `formatReport(score)` — Render an `AlignmentScore` as a human-readable string.
