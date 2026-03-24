# AgentScore — Alignment Verification

AgentScore verifies agent alignment by comparing **what the agent was told to do** versus **what it actually did**. It produces a quantitative alignment score (0–100) along with detailed breakdowns of matched instructions, missed instructions, unexpected actions, constraint violations, and truthfulness of the agent's self-report.

When an API key is configured, session data is also uploaded to the [AgentScore dashboard](https://getagentscore.com) for server-side scoring and tracking.

## How it works

This plugin listens on the `message:sent` event. When triggered it:

1. **Parses instructions** — The user's prompt is parsed into discrete instructions, entities, and constraints.
2. **Records actions** — Every tool call the agent made during the session is captured as an `AgentAction`.
3. **Scores alignment** — `computeAlignment` compares the instructions against the recorded actions:
   - **Matched actions** — Instructions that were successfully carried out, with confidence scores.
   - **Missed instructions** — Things the user asked for that the agent did not do.
   - **Unexpected actions** — Tool calls the agent made that were not part of the instructions.
   - **Constraint violations** — Actions that broke explicit restrictions (e.g., "do not delete files").
   - **Truthfulness** — Whether the agent's self-report accurately reflects what it actually did.
4. **Uploads to dashboard** — If `apiKey` is configured, session data is POSTed to the AgentScore API for server-side scoring. The throttle only engages after a successful upload, so failed attempts are retried on the next event.
5. **Pushes results** — A formatted report is appended to the event messages.

## Score interpretation

| Range   | Label     | Meaning                                                |
| ------- | --------- | ------------------------------------------------------ |
| 90–100 | Excellent | Agent did exactly what was asked, reported truthfully   |
| 70–89  | Good      | Minor deviations or omissions                          |
| 50–69  | Fair      | Significant missed instructions or unexpected actions  |
| 0–49   | Poor      | Major misalignment, constraint violations, or dishonesty |

## Configuration

AgentScore is an OpenClaw plugin. All settings live under `plugins.entries.agentscore-openclaw.config`
and can be managed with `openclaw config get/set`:

### CLI

```bash
# Set the API key
openclaw config set plugins.entries.agentscore-openclaw.config.apiKey "sk-xxx"

# Read it back
openclaw config get plugins.entries.agentscore-openclaw.config.apiKey

# Remove it (disables remote upload)
openclaw config unset plugins.entries.agentscore-openclaw.config.apiKey

# Other settings
openclaw config set plugins.entries.agentscore-openclaw.config.threshold 80
openclaw config set plugins.entries.agentscore-openclaw.config.throttleMs 120000
openclaw config set plugins.entries.agentscore-openclaw.config.verbose true
openclaw config set plugins.entries.agentscore-openclaw.config.dashboardUrl "https://getagentscore.com"
```

### JSON config (manual)

Edit `~/.openclaw/openclaw.json` directly:

```json5
{
  plugins: {
    entries: {
      "agentscore-openclaw": {
        config: {
          apiKey: "sk-xxx",
          threshold: 80,
          throttleMs: 120000,
          verbose: true,
          dashboardUrl: "https://getagentscore.com"
        }
      }
    }
  }
}
```

### Settings

| Setting        | Type    | Description                                                                                                                                    | Default                      |
| -------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `apiKey`       | string  | API key for the AgentScore dashboard. Enables remote upload. The agent name is automatically derived from the OpenClaw `sessionKey`.            | _(none — upload disabled)_   |
| `threshold`    | number  | Minimum acceptable alignment score (0–100). Sessions below this are flagged.                                                                   | `70`                         |
| `throttleMs`   | number  | Minimum interval (ms) between scoring per session. Only starts after a successful upload — failed attempts retry immediately on the next event. | `180000` (3 min)             |
| `verbose`      | boolean | Include per-action match details in the report.                                                                                                | `false`                      |
| `dashboardUrl` | string  | Base URL for the AgentScore API.                                                                                                               | `https://getagentscore.com`  |

## Programmatic access

The plugin exports its scoring and upload APIs via `@llmagentscore/agentscore-openclaw`:

```typescript
import {
  computeAlignmentFromSession,
  uploadToRemote,
  formatReport,
} from '@llmagentscore/agentscore-openclaw';
```
