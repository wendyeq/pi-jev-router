---
name: pi-jev-router-inspect
disable-model-invocation: true
description: 查看 Pi 的 pi-jev-router 会话统计、Jev 评估用量与网关费用、模型和推理档位选择。用户询问 Pi Jev router 的统计、成本或路由记录时使用；dsh-jev-router 用其专用 skill。
---

# Pi Jev 路由统计

运行本 skill 的 `scripts/inspect.mjs`（路径相对本文件所在目录）。它只读 Pi 的路由统计，不读取对话正文，也不向网关发送请求：

```bash
node scripts/inspect.mjs sessions
node scripts/inspect.mjs show <session-id|latest>
```

从其他目录调用时，将示例中的 `scripts/inspect.mjs` 解析为本 skill 目录下的绝对路径。`--state-dir DIR` 可指定统计目录；默认在 Pi agent 目录（`PI_CODING_AGENT_DIR` 或 `~/.pi/agent`）下的 `jev-router/sessions`。用户没指定会话时，直接运行 `show latest`（不要只运行 `sessions`）并在回答中标明 sessionId。用户要最近会话列表时运行 `sessions`；即使列出会话，也对最新会话运行 `show latest`，给出与 dsh-jev-router-inspect 的 `show latest` 同等详细的摘要。需要跨会话合计时，从 `sessions` 取得 ID，再逐个 `show` 汇总评估记录；不要把 dsh 的 ledger 混入。

报告最新会话时，从 `records` 和 `aggregates` 汇总：按 model/effort/skill 给出评估次数、结果和实际应用次数；报告最近应用的目标模型与推理档位（仅凭 applied 记录，不将其称为固定模型或会话当前配置），按目标模型列出已应用的档位分布；列出 HTTP 尝试、输入/输出 tokens、网关报告费用、失败原因和 fallback 来源/原因。字段缺失时明确写“未记录”，不要当成零。Pi 当前记录没有 DSH sidecar 中的 modelMode、pinnedAt、effortMode、候选策略与 shortenedEvaluations：不臆测这些字段；如用户比较两边，点明差异。若 model/skill 没有评估，说明该会话仅有 effort 路由记录。`aggregates` 按 model、effort、skill 分类。`evaluations` 是实际评估次数，`httpAttempts` 包括重试；`skippedSingle` 没有 HTTP 评估。token 合计只涵盖返回了用量的评估；`missingInputTokens`、`missingOutputTokens` 大于零时说明相应合计不完整。`feeUnavailable` 是未返回费用的次数，`reportedZeroFees` 是明确返回零的次数；`gatewayCostUsd: 0` 仅表示网关报告为零，不等于实际免费。没有用户提供的单价时不推算费用。Pi 主模型调用费用不包含在这些 Jev 评估统计中。

## 选项概率

`show` 才包含概率。`probabilityDecisions` 是成功评估的最终选择，含推理强度评估。`intermediateProbabilities` 只是分块路由的中间评估；不要并进最终决策，也不要把两边的差值加总或平均。`sessions` 列表不含这些分布。

每条报告 `question`、`option`、`status`、`top`、`runnerUp`、`margin`。`status` 为 `available` 时同时给出分布。差值为 0 表示并列最高。`missing` 是没有返回概率，或这条记录早于概率字段。`invalid` 是概率未通过校验，不要补造分布。`skipped-single` 和 fallback 不在这两个列表里。

推理强度的键是档位名。选模型和换模型建议的键是「模型 @ 强度」；当前模型带 `keep`。不要把组合概率说成某个模型单独的得票。差值只说明选项拉开了多少，不是任务成功率，也不据此建议自动升降档或换模型。两个列表都空时，说明这次没有可展示的 Choice 分布。

若无会话记录，说明该目录下尚无已记录的路由活动或记录早于统计功能；先确认 Pi agent 目录和插件是否运行，再报告缺失，不以 dsh 数据代替。
