# AgentScore — Agent Runtime Governance

AgentScore verifies whether AI agents DID what they were TOLD and honestly SAID what they did. It compares three signals across every agent session:

- **TOLD** — the user's prompt instructions
- **DID** — the agent's actual tool calls
- **SAID** — the agent's self-reported summary

This produces an **alignment score** (0-100) and a **truthfulness score** (0-100), surfaced via CLI, SDK, or web dashboard.


## Tech Stack

| Concern | Choice |
|---------|--------|
| Language | TypeScript 5.5 |
| Build | Turbo 2, npm workspaces |
| Test | Vitest |
| Validation | Zod 3 |
| LLM | @anthropic-ai/sdk (peer dep for core/cli) |
| Module | ESM only (`"type": "module"`, use `.js` in relative imports) |

## Scoring Architecture

### Data Flow (End to End)

```
Agent session (any framework)
    │
    │  SDK / CLI / Plugin collects raw {prompt, actions[], report}
    ▼
POST /api/v1/score  (Bearer sk_xxx)  ← dashboard repo
    │
    ├─ Zod validation
    ├─ Optional Haiku pre-classification (skip chat messages)
    ├─ Find-or-create agent record
    ├─ Dedup check: skip if (agentId, startedAt) exists
    │
    ├─► scoreSession() dispatches to:
    │   ├─ Deterministic: computeAlignment() + computeTruthfulness()
    │   └─ LLM-as-judge: computeAlignmentLLM() (4-step pipeline)
    │
    ├─ Store in sessions table (JSONB breakdown for replay)
    ▼
Response: { id, alignmentScore, truthfulnessScore, matched, missed, unexpected, violations }
```

### Deterministic Scoring (align.ts)

1. **Parse** prompt into imperative instructions + constraints via regex (100+ action verbs)
2. **Match** each instruction to actions using weighted similarity:
   - Tool-verb mapping (40%) — curated dictionary, 58+ entries
   - Entity overlap (30%) — emails, URLs, filenames, quoted strings
   - TF-IDF cosine similarity (30%) — semantic text matching
3. **Threshold**: >= 0.4 = match, >= 0.7 = strong match
4. **Score**: `base = (matched / total_expected) * 100`, then `-5 per unexpected action`, `-15 per constraint violation`, clamped [0, 100]
5. **Truthfulness**: extract claims from report (past-tense verb patterns), verify each against action log

### LLM-as-Judge Pipeline (llm-align.ts)

4 structured-output steps using LlmProvider abstraction:
1. Extract checkpoints from prompt
2. Verify each checkpoint against actions
3. Check constraint compliance
4. Verify truthfulness of individual claims

### Constraint Types

- `dont` — enforced (word overlap + tool name match)
- `only` — stubbed (TODO v2)
- `limit` — stubbed (TODO v2)

## Key Files

### Scoring Engine (packages/core/)
| File | Purpose |
|------|---------|
| `packages/core/src/scorer/align.ts` | Deterministic alignment algorithm |
| `packages/core/src/scorer/llm-align.ts` | LLM 4-step pipeline |
| `packages/core/src/scorer/truthful.ts` | Claim extraction & verification |
| `packages/core/src/scorer/drift.ts` | Behavioral drift detection |
| `packages/core/src/score-session.ts` | Unified entry: routes deterministic vs LLM |
| `packages/core/src/parser/prompt.ts` | Prompt → instructions + constraints |
| `packages/core/src/parser/types.ts` | ScoringInput, AgentAction, AgentSession |
| `packages/core/src/scorer/types.ts` | AlignmentScore, DriftReport, LlmJudgeLogs |
| `packages/core/src/utils/semantic.ts` | TF-IDF tokenization, cosine similarity |
| `packages/core/src/utils/tool-verbs.ts` | Tool name → verb mapping dictionary |
| `packages/core/src/utils/entities.ts` | Entity extraction (emails, URLs, etc.) |
| `packages/core/src/index.ts` | Public API — all exports |

### SDK (packages/sdk/)
| File | Purpose |
|------|---------|
| `packages/sdk/src/session.ts` | AgentScoreSession class (start → record → end) |
| `packages/sdk/src/interceptor.ts` | Monkey-patch fetch() to capture LLM API calls |
| `packages/sdk/src/reporter.ts` | HTTP client to POST sessions to dashboard |
| `packages/sdk/src/middleware.ts` | Express/Fastify middleware for automatic scoring |
| `packages/sdk/src/log-writer.ts` | Anti-tampering session log serialization |

### CLI (packages/cli/)
| Command | Purpose |
|---------|---------|
| `check` | Score a session file or directory |
| `diff` | Side-by-side prompt vs actions comparison |
| `drift` | Behavioral drift over time |
| `sync` | Push scores to dashboard |
| `watch` | Monitor agent process live |
| `wrap` | Tamper-proof subprocess logging + scoring |

## Development

```bash
npm install
npm run build       # turbo build → dist/ in each package
npm run test        # turbo test → vitest
npm run typecheck   # turbo typecheck
npm run dev         # turbo dev (watch mode)
```

## Critical Conventions

### ESM Only
All packages use `"type": "module"`. Use `.js` extensions in relative imports (e.g., `import { foo } from './bar.js'`).

### Scoring Thresholds
`MATCH_THRESHOLD = 0.4` and `STRONG_MATCH_THRESHOLD = 0.7` in `align.ts` affect all scoring globally. Change with care.

### Core Dependency in Dashboard
The sibling dashboard repo imports this package via Git SHA: `"@llmagentscore/core": "github:Singularity-tian/agentscore#1b98f5a"`. After publishing changes to core, update the SHA in `../dashboard/package.json` and run `pnpm install` there.

### Server-Side Scoring Only
The dashboard's `POST /api/v1/score` endpoint accepts raw session data and computes scores server-side. This is intentional — it prevents agents from fabricating their own scores. The SDK/CLI should never send pre-computed scores.

### Zod Version
This repo uses **Zod 3**. The dashboard uses **Zod 4**. Do not cross-import schemas.

## Dashboard API: POST /api/v1/score

**Auth**: `Authorization: Bearer sk_xxx` (API key from dashboard)

### Single session
```json
{
  "agentName": "my-agent",
  "prompt": "Send an email to bob@example.com",
  "actions": [
    { "tool": "gmail_send", "params": { "to": "bob@example.com" }, "timestamp": "2025-03-29T..." }
  ],
  "report": "I sent the email to Bob.",
  "startedAt": "2025-03-29T...",
  "framework": "custom",
  "source": "sdk"
}
```

### Batch (heartbeat)
```json
{
  "agentName": "my-agent",
  "framework": "openclaw",
  "source": "heartbeat",
  "tasks": [
    { "prompt": "...", "actions": [...], "report": "...", "startedAt": "..." }
  ]
}
```

**Response**: `{ id, agentId, alignmentScore, truthfulnessScore, matched, missed, unexpected, violations, details }`

**Dedup**: sessions with identical `(agentId, startedAt)` are skipped.

## Vision

**Phase 1 (now)**: Open-source alignment scoring with free + paid dashboard for developers.
**Phase 2**: Aggregate alignment data becomes actuarial dataset for AI agent liability insurance.
**Phase 3**: Trust ratings ("FICO scores") for agent-to-agent commerce.
