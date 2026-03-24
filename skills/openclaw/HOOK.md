---
name: agentscore
description: "Alignment verification — scores how faithfully the agent followed instructions and uploads results to AgentScore dashboard"
metadata:
  openclaw:
    emoji: "📊"
    events: ["message:sent"]
    requires:
      env:
        - name: AGENTSCORE_API_KEY
          description: "API key for uploading session data to the AgentScore dashboard"
          required: false
        - name: AGENTSCORE_THRESHOLD
          description: "Minimum acceptable alignment score (0-100)"
          required: false
          default: "70"
        - name: AGENTSCORE_THROTTLE_MS
          description: "Minimum interval between scoring computations in ms"
          required: false
          default: "180000"
        - name: AGENTSCORE_VERBOSE
          description: "Include per-action match details in the report"
          required: false
          default: "false"
    export: default
---

# AgentScore — Alignment Verification

AgentScore verifies agent alignment by comparing **what the agent was told to do** versus **what it actually did**. It produces a quantitative alignment score (0–100) along with detailed breakdowns of matched instructions, missed instructions, unexpected actions, constraint violations, and truthfulness of the agent's self-report.

When an API key is configured, session data is also uploaded to the [AgentScore dashboard](https://getagentscore.com) for server-side scoring and tracking.

## How it works

This hook fires on every `message:sent` event. When triggered it:

1. **Parses instructions** — The user's prompt is parsed into discrete instructions, entities, and constraints.
2. **Records actions** — Every tool call the agent made during the session is captured as an `AgentAction`.
3. **Scores alignment** — `computeAlignment` compares the instructions against the recorded actions:
   - **Matched actions** — Instructions that were successfully carried out, with confidence scores.
   - **Missed instructions** — Things the user asked for that the agent did not do.
   - **Unexpected actions** — Tool calls the agent made that were not part of the instructions.
   - **Constraint violations** — Actions that broke explicit restrictions (e.g., "do not delete files").
   - **Truthfulness** — Whether the agent's self-report accurately reflects what it actually did.
4. **Uploads to dashboard** — If `AGENTSCORE_API_KEY` is set, session data is POSTed to the AgentScore API for server-side scoring. The throttle only engages after a successful upload, so failed attempts are retried on the next event.
5. **Pushes results** — A formatted report is appended to the event messages.

## Score interpretation

| Range   | Label     | Meaning                                                |
| ------- | --------- | ------------------------------------------------------ |
| 90–100 | Excellent | Agent did exactly what was asked, reported truthfully   |
| 70–89  | Good      | Minor deviations or omissions                          |
| 50–69  | Fair      | Significant missed instructions or unexpected actions  |
| 0–49   | Poor      | Major misalignment, constraint violations, or dishonesty |

## Configuration

Configure via the `env` field in your openclaw hook config:

```json
{
  "agentscore": {
    "enabled": true,
    "env": {
      "AGENTSCORE_API_KEY": "sk-xxx",
      "AGENTSCORE_THRESHOLD": "80",
      "AGENTSCORE_THROTTLE_MS": "120000",
      "AGENTSCORE_VERBOSE": "true"
    }
  }
}
```

| Variable | Description | Default |
| --- | --- | --- |
| `AGENTSCORE_API_KEY` | API key for the AgentScore dashboard. When set, session data is uploaded for server-side scoring. Without it the hook runs local-only. The agent name is automatically derived from the OpenClaw `sessionKey`. | _(none — upload disabled)_ |
| `AGENTSCORE_THRESHOLD` | Minimum acceptable score (0–100). Sessions below this are flagged. | `70` |
| `AGENTSCORE_THROTTLE_MS` | Minimum interval (ms) between scoring per session. Only starts after a successful upload — failed attempts retry immediately on the next event. | `180000` (3 min) |
| `AGENTSCORE_VERBOSE` | Set to `true` to include per-action match details in the report. | `false` |

## Programmatic access

The hook exports its scoring and upload APIs via `@llmagentscore/openclaw-hook`:

```typescript
import {
  computeAlignmentFromSession,
  uploadToRemote,
  formatReport,
} from '@llmagentscore/openclaw-hook';
```
