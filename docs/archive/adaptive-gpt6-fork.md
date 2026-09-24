# Historical experiment: adaptiveThinking for gpt-6-luna / gpt-6-sol

> Archived notes from an earlier fork. The branch, local paths, and installation instructions below describe that experiment, not the current `main` checkout. For current installation, see [README](../../README.md) or the [中文使用手册](../guide.zh-CN.md).

Branch: `fork/adaptive-gpt6-luna-sol` (local at `/workspace/pi-jev-router`)

## Change
Upstream `mejiasd3v/pi-jev-router@0.5.0` hard-gated adaptive thinking to `openai-codex/gpt-6-astra` only.
This fork allows any provider whose model id is `gpt-6-astra`, `gpt-6-luna`, or `gpt-6-sol` (e.g. `gpt-load/gpt-6-luna`).

## Install
```bash
pi install /workspace/pi-jev-router
```
Already on this machine via `settings.packages`.

## Luna cache bakeoff (gpt-load → chatgpt.com group)

Large ~33k-token prefix (warm then continue):

| Arm | cached_tokens | reasoning_tokens | wall |
|---|---:|---:|---:|
| request-level `effort=high` | **0** | ~191–195 | ~7.5s |
| mid `configuration_update` → high (top-level stays low) | **~32512** | **0** (no lift) | ~2.3–3.6s |
| same `effort=low` | **~32512** | 0 | ~1.6–2.1s |

Short multi-turn (no large cache):

| Arm | reasoning_tokens |
|---|---:|
| mid `configuration_update` → high | ~74 |
| request-level high | ~204 |
| request-level low | 0 |

**Takeaway:** On this gateway, `configuration_update` **does** raise effort on short turns, and **does** preserve prompt cache on long turns — but on long cached turns the effort bump often **does not apply** (reasoning stays 0 while cache hits). Top-level effort changes always bust the cache. Token-cost win of adaptive is real for cache; reliability of mid-session effort lifts on large cached prompts needs more gateway/OpenAI verification.


## Sol complex bakeoff (same harness as luna)

See `/workspace/pi-jev-router-sol-complex/`. Correct P/Q = 5/1010.
Settings: `gpt-load/gpt-6-sol` now has `adaptiveThinking: true` with thinking choices (aligned with luna).
