<p align="center">
  <img src="https://raw.githubusercontent.com/mejiasd3v/pi-jev-router/main/assets/logo.png" alt="Jev Router logo" width="144" height="144">
</p>
<h1 align="center">Jev Router</h1>
<p align="center">Choose once. Stay pinned.</p>
<p align="center">
  <a href="https://www.npmjs.com/package/pi-jev-router"><img src="https://img.shields.io/npm/v/pi-jev-router?style=flat-square&amp;color=67e8b4&amp;logo=npm&amp;logoColor=white" alt="npm version"></a>
  <a href="https://github.com/mejiasd3v/pi-jev-router/actions/workflows/test.yml"><img src="https://img.shields.io/github/actions/workflow/status/mejiasd3v/pi-jev-router/test.yml?branch=main&amp;style=flat-square&amp;label=tests&amp;logo=github" alt="Tests"></a>
  <a href="https://github.com/mejiasd3v/pi-jev-router/blob/main/LICENSE"><img src="https://img.shields.io/github/license/mejiasd3v/pi-jev-router?style=flat-square&amp;color=8b9cff" alt="MIT license"></a>
  <a href="https://pi.dev"><img src="https://img.shields.io/badge/Pi-0.85.1%2B-f8b86d?style=flat-square" alt="Pi 0.85.1 or later"></a>
</p>

Let [TypeSafe's Jev](https://vercel.com/ai-gateway/models/jev) choose a model and reasoning effort for [Pi](https://pi.dev). The model stays fixed for the session. Effort stays fixed too, unless adaptive effort is enabled for a route whose model id is `gpt-6-astra`, `gpt-6-luna`, or `gpt-6.1-sol`, or you use the thinking menu's `low` entry on one of those models. Generation uses your existing Pi providers and credentials.

## Get started

Requires Pi **0.85.1+**, Node.js **22.19+**, and a **Vercel AI Gateway key**.

```sh
pi install npm:pi-jev-router
```

Git also works: `pi install git:github.com/mejiasd3v/pi-jev-router`. Keep only one installation.

| Document | What it is |
| --- | --- |
| This README | Configuration, session rules, privacy, cost, and publishing. |
| [中文使用手册](docs/guide.zh-CN.md) | Local install and the two GPT-6 workflows: `auto/jev`, and a concrete model with the thinking menu set to `low`. |
| [Archive](docs/archive/adaptive-gpt6-fork.md) | Old bakeoff notes and paths. Not installation instructions. |

1. Use `/login` for your generation provider and `/login vercel-ai-gateway` for Jev. `AI_GATEWAY_API_KEY` also works.
2. Run `/reload`, then `/model auto/jev`.
3. Start with your actual task. `/jev` shows the pin, selected effort, and fork suggestions.

## Shared effort policy

Automatic effort for `gpt-6-astra`, `gpt-6-luna`, and `gpt-6.1-sol` is implemented in the sibling directory `../jev-router-policy`, not in this package. `index.ts` imports `../jev-router-policy/src/index.ts` at runtime. There is no build step and no `package.json` dependency. Pi loads that file when it loads this extension, so `/reload` picks up changes to either file. An already running session does not. `pi install npm:pi-jev-router` does not include the sibling; this checkout expects the directory beside the repository. Changing the pinned model or its initial effort still applies only to a new session.

## Configure

Merge `jevRouter` into **global** `~/.pi/agent/settings.json`, then `/reload`:

```json
{
  "jevRouter": {
    "options": {
      "openai-codex/gpt-5.6-luna": {
        "description": "Small fixes, tests, and routine implementation.",
        "thinking": "auto"
      },
      "openai-codex/gpt-6-astra": {
        "description": "Architecture, difficult debugging, and complex reasoning.",
        "thinking": "auto"
      }
    },
    "fallback": "openai-codex/gpt-6-astra",
    "timeoutMs": 5000,
    "monitor": true,
    "skills": false
  }
}
```

Only listed, authenticated models are eligible; `fallback` must be listed too. Routes replace the default list; they aren't merged. `PI_CODING_AGENT_DIR` is respected; project settings cannot override routing.

Without configuration, defaults are Luna/`max`, Sol/`auto`, Astra/`xhigh`, Astra fallback, a five-second timeout, and monitoring on. The example above enables automatic effort.

Descriptions accept either a nonempty string or a structured rubric with `role`, `use_when`, `not_for`, and `boundary`. The role and boundary must be nonempty strings; both lists must contain nonempty strings. Structured rubrics are passed intact as each Choice option's `task`, including during monitoring.

Use Luna for known-approach execution, Sol for bounded investigation and implementation within an established architecture, and Astra for advisory judgment, architecture, critical thinking, and difficult debugging. High effort never expands a model's scope. Sol's middle-tier role should be validated on your workload. Existing string descriptions remain supported.

### Thinking

| `thinking` | Behavior |
| --- | --- |
| `"auto"` | Jev chooses the lowest effort it judges sufficient. |
| `"high"` | Force a level, clamped to the model's capabilities. |
| `{"low": "Small changes", "high": "Hard problems"}` | Customize the allowed choices and their descriptions. |
| Omitted | Inherit Pi's thinking level when the pin is created. |

Levels: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`. Automatic choices are filtered to supported levels. Model and effort are chosen in one evaluation: task fit determines the model first, then Jev selects the lowest sufficient allowed effort within that model. Effort labels are model-relative; another model's lower label does not make it a better fit. A configured floor can intentionally exceed what a routine task needs.

Set `jevRouter.minThinking` for a global floor, and `minThinking` inside a model's option for a per-model floor. For example, global `"medium"` plus a non-GPT-6 route at `"high"` lets Jev choose medium or higher for routes that omit a model floor, and high or higher for that stricter route, when both use `"thinking": "auto"`. An omitted model minimum inherits the global floor. A route whose model id is `gpt-6-astra`, `gpt-6-luna`, or `gpt-6.1-sol` may set its own floor below the global one: an explicit `"minThinking": "low"` permits low effort even with global `"medium"`, for initial routing, adaptive effort, and the thinking-menu `low` switch. The provider prefix is not part of this check. Every other model can only raise the global floor. Both fields are optional and default to no additional restriction.

Automatic and custom choices below the floor are excluded. Fixed or inherited effort below the floor is raised to the lowest supported level meeting it. Routes with no eligible level are excluded, including non-reasoning models when the floor is above `off`; fallback errors if it has no eligible choice. `/jev` shows configured minimums. Reload after editing; existing session pins keep their original effort.

### Adaptive GPT-6 effort (opt-in)

Set `"adaptiveThinking": true` on a route whose model id is `gpt-6-astra`, `gpt-6-luna`, or `gpt-6.1-sol`, alongside `"thinking": "auto"` or custom thinking choices. The provider prefix is ignored, so `openai/gpt-6-luna` and `gpt-load/gpt-6.1-sol` qualify. Any other model id, or a fixed or inherited effort policy, is rejected when the extension loads.

```json
"openai-codex/gpt-6-astra": {
  "description": "Architecture and difficult debugging.",
  "thinking": "auto",
  "adaptiveThinking": true
}
```

After the initial route, Jev assesses the next step before each main model request, including tool continuations. It can raise effort for unresolved failures or difficult decisions and lower it for routine work. It chooses only supported levels allowed by your choices and minimums. This is a heuristic, not a guarantee that Jev detects every stall. Changes take effect between responses, never inside a running response.

- **Keep the model and request prefix.** The original request-level effort stays fixed. Changes use that model's append-only `configuration_update` items, replayed at their original input positions. This follows [OpenAI's cache-preserving mechanism](https://developers.openai.com/api/docs/guides/reasoning#change-reasoning-mid-conversation); normal cache requirements still apply. Do not use provider-side automatic compaction, automatic truncation, or another hook that inserts configuration updates.
- **Persist and recover.** Decisions follow the active branch across reload/resume. If local Pi compaction or edited history invalidates an update's original prefix, the current effort is re-established on the rebuilt input. Forks choose afresh. Auxiliary requests reuse effort without evaluating or saving changes.
- **Bound overhead.** At most one additional evaluation per distinct request context, bounded by `timeoutMs`, with no retries and a 28,000-byte request budget. Failure retains current effort; cancellation stops the request. `monitor: false` disables model-switch suggestions, not adaptive effort.
- **See changes.** Notifications, the status line, and `/jev` show current effort. `/jev` also shows the initial effort used at request level. Pi's thinking picker still does not control or track the router's effort.

Reload after changing the flag. Enabling it can adapt an existing pin of one of these models on its next request. Disabling it stops new decisions but preserves and replays prior updates; use a new session for a fresh pin. This flag is separate from the thinking-menu `low` switch described under session behavior: that switch does not require `adaptiveThinking`.

**Additional data and cost:** effort checks send the latest user-text excerpt plus up to eight recent user, assistant, and tool-result excerpts to Vercel/TypeSafe. Each excerpt keeps up to 1,600 characters, split between its beginning and end. Tool names and error flags are included; tool-call arguments, reasoning blocks, images, and system messages are excluded. Tool-result text can contain secrets and is not redacted. These evaluations are billed separately and appear separately in read-only session statistics when recorded.

### Automatic skill loading (opt-in)

Set `"skills": true` inside your existing global `jevRouter` configuration, then `/reload`. It defaults to `false` and works with both `auto/jev` and concrete models, independently of `monitor`.

Before generation for each new user turn, including steering messages, Jev checks Pi's discovered skill names and descriptions against recent user/assistant text. It loads up to **three** matches with a returned probability of at least **0.8**. These probabilities are heuristic relevance signals, not guarantees.

- Uses Pi's catalog, including its trust and discovery settings. Skills marked `disable-model-invocation` are never auto-loaded.
- Injects full skill instructions with their source path and reference directory. It does not execute scripts or eagerly load linked references.
- Skips skills already included as `<skill>` blocks or successfully loaded through a complete `read` call in the current context. Path aliases are canonicalized. Arbitrary shell commands or unmarked pasted instructions cannot reliably be recognized as skill loads.
- Saves selections and instructions on the active session branch. Tool continuations and `/reload` reuse them without another evaluation or file read. Skills removed by compaction or branch navigation can be selected again when needed.
- Makes at most one additional evaluation per user turn, bounded by `timeoutMs` with no retries and the same **28,000-byte** request budget. Older history is dropped first; oversized tasks/catalogs skip selection rather than using a partial task. Full injected instructions are limited to **50,000 bytes** per turn; unreadable or oversized skills are skipped with a warning.

`/jev` shows whether this feature is enabled. Failures leave ordinary skill loading available. Turning it off stops selection and reinjection; it does not erase instructions the model already read or remove saved session records.

### Long prompts

The latest task takes priority; older history is dropped before splitting it. Requests have a **28,000-byte serialized UTF-8 budget**, including route descriptions. This is a conservative proxy for Jev's [roughly 32K-token request budget](https://docs.typesafe.ai/primitives#ask-speculative-questions), not an exact token count.

Tasks that don't fit are split into at most **eight overlapping chunks**, evaluated **two at a time**, then combined in one final evaluation. The final evaluation is instructed to weigh requirements, not vote counts. This is still a heuristic: relationships across sections may be missed.

Tasks over **192,000 UTF-8 bytes**, excessive chunk plans, or incomplete evaluations use fallback (or retain the existing pin during monitoring). The coding model always receives the original input; its context limits still apply.

## Session behavior

- **Pin once.** The model and initial effort survive tool calls, compaction, `/reload`, and `/resume`. Effort remains fixed unless adaptive effort is enabled for that GPT-6 route. `/new`, `/fork`, and `/clone` choose afresh. Model and initial-effort configuration changes don't rewrite existing pins.
- **Suggest, never switch.** Monitoring checks new user text and may suggest a fork with another model, once per alternative per session. Use `/fork`, then `/model` and `/thinking` in the fork to follow it. No automatic forks or model switches.
- **Control overhead.** A Jev HTTP 503 gets one immediate retry within the same timeout; if it fails again, the normal fallback/keep-current behavior applies. Routing and model-monitor evaluation timeouts retry up to three attempts of `timeoutMs` each (1 to 60,000 ms). The entire operation shares a ceiling of **3 × `timeoutMs`**, including chunks and combination: 15 seconds by default. Skill and effort checks also retry 503 once but do not retry timeouts. Set `"monitor": false` to disable model-switch advisory checks; tool continuations don't trigger those checks. Adaptive effort has its own per-request check described above.
- **Fail explicitly.** Initial routing failures use the fallback, with its fixed/inherited effort or highest supported automatic choice. If an existing pin becomes unavailable or cannot accept the input, the router errors instead of switching.

Context limits follow the pinned backend. The status and `/jev` show its current effort; Pi's thinking picker does not track automatic choices. Selecting a concrete model bypasses model routing, but not opt-in skill selection. On `gpt-6-astra`, `gpt-6-luna`, and `gpt-6.1-sol`, the thinking menu's `low` entry asks Jev for that request's effort. The menu label stays `low`. The request also reports the effort this session last applied to that model, so Jev can keep a raised level instead of re-deciding from scratch. Choices below a configured `minThinking` are not offered. If the check fails or times out, it reuses the last successfully chosen effort for that model in this session when that effort still meets the minimum (including after reload); without a usable prior choice, it uses the configured minimum, or sends `low` unchanged when the minimum is low or unset. Other levels stay fixed. `auto/jev` still treats `low` as a real effort it may choose. Deferred/background generation is unsupported by `auto/jev`.

Route, monitor, effort, and low-switch decisions are also appended as `jev-trace` session entries. `/jev` shows the latest one. Reasons are short labels such as `budget`, `missing-key`, `invalid-choice`, `payload`, `timeout`, or `unavailable`; evaluation error bodies are not stored. These entries are an audit log and are not replayed into later requests.

## Privacy and cost

Routing and monitoring consider up to **eight recent user/assistant text messages**, limited to **192,000 UTF-8 bytes of source text**. Evaluations send selected text, route/effort descriptions, and chunk assessments to Vercel/TypeSafe. Overlaps, excerpts, and retries can send the same text more than once. System prompts, reasoning blocks, tool-result blocks, images, and provider credentials are excluded from model-routing evaluations. Opt-in adaptive effort additionally sends tool-result excerpts as described above. **Conversation text is not redacted and may contain secrets.**

Opt-in skill selection additionally sends eligible skill names and descriptions to Vercel/TypeSafe. Skill file contents are read locally and stored in the session; automatically injected skill messages are excluded from subsequent Jev evaluations. Manually pasted or expanded skill instructions in user messages remain conversation text.

Gateway evaluations are billed separately. Chunking uses at most nine evaluations before timeout retries, or 27 attempts total. `/jev` reports recent route usage when available; failed, cancelled, or timed-out calls may still be billed without returning usage. Skill-selection evaluations are additional. Evaluation costs are not in Pi's footer totals. Pinning favors cache reuse but guarantees neither cache hits nor savings.

### Read-only session statistics

The inspect implementation and its agent instructions live in `skills/pi-jev-router-inspect`. `node scripts/inspect.mjs` calls that script. Link the skill directory into your agent skills directory so edits stay in one place. `node scripts/inspect.mjs sessions` lists sessions with recorded router activity. `node scripts/inspect.mjs show <session-id|latest>` gives one session's model-selection sources, **actual effort per request**, fallback sources/reasons, evaluation failures, HTTP attempts, elapsed evaluation time, missing token fields, and Gateway-reported fees. `probabilityDecisions` lists each successful evaluation's Choice distribution, with `top`, `runnerUp`, and `margin`. A tie has margin `0`. `intermediateProbabilities` lists chunk assessments separately; they are not averaged into the final decision. Use `--state-dir DIR` to point to a different private ledger directory. The inspector reads only metadata; it never reads Pi conversation files or sends anything to Gateway. No cross-session success rate is calculated: an effort share is not a task-success rate, and a probability margin is not one either.

Metadata lives at `<Pi agent dir>/jev-router/sessions/<session-id>.jsonl` (directory mode `0700`, files `0600`). It contains no prompts, response bodies, credentials, or raw Gateway responses. Successful Choice evaluations also store `probabilityStatus` (`available`, `missing`, or `invalid`) and, when available, the provider's probabilities. Effort keys are thinking levels. Initial routing and fork suggestions use `model @ thinking` combination labels, including `keep` for the pinned model; those probabilities are not model-only votes. Values follow the AI SDK's Choice check, including its declared rounding tolerance, and are not renormalized. A missing or invalid distribution does not change the selected choice, cause another retry, or switch on fallback. Records written before this field existed show as missing. Skipping HTTP because only one option was offered does not invent a distribution. Pi's existing `jev-pin`, `jev-effort`, and `jev-trace` session entries remain the source of live routing state; the separate private JSONL is only a read-only statistics source, not a Harness-style session sidecar. In-memory sessions can still produce a metadata ledger under their Pi session ID. A failed ledger write warns and does not interrupt generation. Sessions predating this feature, and sessions without router activity, do not appear in the list. Skill loading still uses its own boolean threshold and does not consult these Choice margins.

`skippedSingle` means there was only one offered profile and **no HTTP evaluation**. `evaluations: 0` means no paid evaluation was recorded; `feeUnavailable` means the Gateway supplied no fee, while `reportedZeroFees` counts explicit zero reports. Totals only include returned usage and reported fees; incomplete usage must not be interpreted as zero cost. A fallback is an actual applied route or effort, not a successful Jev selection. Model monitoring may suggest a fork, but it does not change the session model. Routing data cannot establish whether low effort was sufficient for a task without independent acceptance outcomes and same-task comparisons.

<details>
<summary>Migrating from file-based configuration</summary>

Move the old `routes.json` contents under `jevRouter` and unset `JEV_ROUTES_FILE`; neither is read anymore. Sessions created before pinning was introduced select a pin on their next main request.

</details>

## Development

```sh
nub install --frozen-lockfile --ignore-scripts
nub run test
```

Tests mock network responses; no API keys or paid requests are needed.

## Publishing

`.github/workflows/publish.yml` publishes stable GitHub releases to npm using [trusted publishing](https://docs.npmjs.com/trusted-publishers/). It checks that the release tag matches `package.json`, installs from the frozen lockfile, and runs tests before publishing. Prereleases are skipped. The publish step uses npm's native OIDC flow; installs and tests use Nub.

### One-time npm setup

In [pi-jev-router package settings](https://www.npmjs.com/package/pi-jev-router/access), add a **GitHub Actions** trusted publisher:

| Field | Value |
| --- | --- |
| Organization or user | `mejiasd3v` |
| Repository | `pi-jev-router` |
| Workflow filename | `publish.yml` |
| Environment name | Leave blank |
| Allowed actions | Allow direct `npm publish`, not just staged publishing |

No npm token or GitHub secret is needed. Keep account 2FA enabled. This connection must be saved on npm before the first automated release; committing the workflow alone does not authorize npm publishing.

### Release a version

1. Bump `package.json`, commit, and push to `main`.
2. Create and push the matching `vX.Y.Z` tag.
3. Publish its GitHub release, for example `gh release create vX.Y.Z --verify-tag --generate-notes`.
4. Wait for **Publish to npm** to succeed and verify the new npm version.

Publishing a GitHub release triggers npm publication; pushing a tag alone does not. Release tags must include the publish workflow. A failed run can be rerun after fixing the npm connection; an already-published npm version cannot be overwritten.

[MIT](LICENSE).
