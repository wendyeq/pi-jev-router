# Jev Router 使用手册

这份手册只讲本仓库的两种用法。配置字段、隐私、费用和发布见仓库根目录的 [README](../README.md)。[archive](archive/adaptive-gpt6-fork.md) 是早期 bakeoff，不要按里面的路径安装。

| 用法 | 你选什么 | 推理强度 |
| --- | --- | --- |
| 自动选模型 | `auto / jev` | 钉住后，该路由打开了 `adaptiveThinking` 才会在后续请求里升降。 |
| 指定模型 | `gpt-6-luna`、`gpt-6-sol` 或 `gpt-6-astra`，Thinking 选 **low** | 每次请求前问 Jev。不需要 `adaptiveThinking`。菜单上仍显示 low。 |

需要 Pi、Node.js 22.19 或更高，以及 Vercel AI Gateway 的密钥。生成请求走所选模型在 Pi 里已经配置的 provider 和密钥，不经过 Jev。

## 安装

在仓库目录执行：

```sh
pi install <本仓库目录>
```

`~/.pi/agent/settings.json` 的 `packages` 里会出现指向该目录的一项。Pi 直接加载仓库里的 `index.ts`，不必先打成 npm 包。

如果以前装过 `npm:pi-jev-router`，先卸掉再装本地目录，避免两份路由同时生效：

```sh
pi remove npm:pi-jev-router@<版本>
pi install <本仓库目录>
pi list
```

然后在 Pi 里执行 `/reload`。Jev 评估还要登录 Gateway：`/login vercel-ai-gateway`。环境变量 `AI_GATEWAY_API_KEY` 同样可用。

## 配置

路由只读全局 `~/.pi/agent/settings.json` 里的 `jevRouter`。项目级设置不能覆盖它。改完后 `/reload`。已经钉住的会话不会改模型，也不会改最初那一档。

不写 `jevRouter` 时，内置默认是 `openai-codex/gpt-5.6-luna`（`max`）、`openai-codex/gpt-5.6-sol`（`auto`）、`openai-codex/gpt-6-astra`（`xhigh`），后备是 astra。下面这份不是默认列表，写上后会整表替换它们。它同时覆盖两种用法：`adaptiveThinking` 只管 `auto / jev` 钉住之后的升降；指定模型并把菜单设为 low 时，没有这个字段也会问 Jev。

三个 GPT-6 都打开自适应，后备模型用 sol：

```json
{
  "jevRouter": {
    "options": {
      "openai/gpt-6-luna": {
        "description": "最省的执行模型。目标清楚、做法已知时用：有界实现、已理解的修复、测试、翻译、摘要、常规配置。不用于开放式调查、不确定的根因、架构取舍，或还要先判断方案的任务。",
        "thinking": "auto",
        "adaptiveThinking": true
      },
      "openai/gpt-6-sol": {
        "description": "复杂编码和 agent 工作流的默认模型。调查、多文件实现、普通到困难的调试、仓库内的正确性检查，以及在现有系统里把功能做完，都选它。不用于 luna 就能做完的例行执行，也不用于跨系统的架构定案、安全关键的最终判断，或失败模式互相牵连、读改这个仓库收不了尾的端到端难题。任务难、含糊或像在要建议，仍先选它，除非上一句明确排除。",
        "thinking": "auto",
        "adaptiveThinking": true
      },
      "openai/gpt-6-astra": {
        "description": "最强模型，只用于最难的端到端工作：跨系统的架构取舍、安全关键的最终判断、多来源研究，或约束互相冲突且不是单仓库编码调查能解决的问题。不用于机械执行，也不用于一个仓库里的复杂编码、困难调试或实现建议；那些是 sol。不要因为任务重要、含糊或需要建议就选它。",
        "thinking": "auto",
        "adaptiveThinking": true
      }
    },
    "fallback": "openai/gpt-6-sol",
    "timeoutMs": 5000,
    "monitor": true,
    "skills": false
  }
}
```

`description` 决定 Jev 把任务分给谁。高推理强度不会扩大模型的职责。`options` 会整表替换内置默认路由，不会和默认列表合并。`fallback` 必须是 `options` 里的一项。

`thinking` 可以是：

| 值 | 作用 |
| --- | --- |
| `"auto"` | 在该模型支持的档位里，由 Jev 选够用的最低档。 |
| `"high"` 等固定档 | 钉死这一档。不能同时打开 `adaptiveThinking`。 |
| `{"low": "简单步骤", "high": "困难调试"}` | 只允许列出的档，并用这些说明让 Jev 选择。 |
| 省略 | 钉选时继承 Pi 当时的 Thinking。 |

档位名称是 `off`、`minimal`、`low`、`medium`、`high`、`xhigh`、`max`。模型自己不支持的档不会出现。这三个 GPT-6 的 `minimal` 通常不可用；`off` 是否可用看模型映射。

`timeoutMs` 是单次 Jev 评估的超时，范围 1 到 60000 毫秒。`monitor` 为 true 时，新的用户消息可能提示换模型，但不会自动换。`skills` 默认关闭。

`minThinking` 可以写在全局或某个模型上，用来抬高最低档。这三个 GPT-6 如果写了自己的 `minThinking`，以该项为准，可以低于全局最低档。不写则跟随全局。低于最低档的选项不会交给 Jev。

## 用法一：自动选模型

1. 模型选 **auto / jev**。
2. `/new` 开新会话。
3. 直接写任务，不要在提示词里点名 luna、sol 或 astra。点名不会被当成选模型指令。

第一条用户消息按三条 `description` 钉住一个模型，并选定初始推理强度。之后这个会话不再换模型。该路由打开了 `adaptiveThinking` 时，主会话里的后续请求，包括工具返回后的下一步，会再问 Jev 要不要升降推理强度。没打开就停在初始档。一次回复正在输出时不会改档。

状态栏类似 `auto: openai/gpt-6-sol (high, adaptive)`。`adaptive` 表示还会继续升降；`pinned` 表示停在初始档。

压缩会话这类辅助请求不重新判断，只沿用当前档。同一段上下文的重试也不会再评一次。

Jev 返回 HTTP 503 时会立即重试一次；仍失败才使用 `fallback`。当前配置会钉到 sol，并给出警告。会话已经钉住之后再失败，不会改去后备模型，而是保持原模型。503 重试也适用于自适应强度、具体模型的 low 开关和技能匹配；再次失败时分别保持当前强度、沿用该模型上次成功且仍不低于最低档的强度（无可用记录则用该模型最低档，未设置时为 low），或跳过本次技能匹配。

`monitor` 打开时，Jev 可能建议 fork 到另一个模型，每个备选在本会话只提示一次。当前会话保持原模型。若要换，用 `/fork`，再在新会话里选模型和 Thinking。直接在原会话里改成具体模型会离开这条自动路由。

## 用法二：指定模型，用 low 升降推理强度

Pi 的 Thinking 菜单不能增加「auto」这一项。菜单上的 **low** 在这三个模型 id 上被用作开关，显示名字仍然是 low。provider 前缀不限。这个开关不读取 `adaptiveThinking`。

1. 模型选 `openai/gpt-6-luna`、`openai/gpt-6-sol` 或 `openai/gpt-6-astra`，不要选 auto / jev。
2. Thinking 选 **low**。
3. 发送任务。

每次向该模型发请求前，Jev 都会看最近一条用户原文，以及最近 8 条用户、助手和工具结果，再选一个够用的档。工具续写也会重判。简单步骤可以停在 low；困难调试、架构或互相约束很多的问题可以升到 high、xhigh 或 max。该模型的 `minThinking` 同样生效：低于它的档不会交给 Jev。例如 luna 和 sol 设为 `medium` 后，菜单仍显示 low，实际从 medium 起选。

请求顶层的 effort 仍写着 low，实际档位放在 `configuration_update` 里，用来保留前缀缓存。变档发生在两次请求之间，不发生在同一次输出中途。

判断时还会把本会话中同一模型上次实际用过的档位一并告诉 Jev，所以它可以选择保持升上去的档，而不是每次请求都从头重判。

Jev 超时、缺少 Gateway 密钥或返回无效档时，优先沿用本会话中同一模型上次成功判断、且仍不低于 `minThinking` 的强度（重新加载后也有效）；没有可用记录，或这次请求无法写入更新时，按该模型最低档发出。没设最低档时，最低档就是原来的 low。

Thinking 选 medium、high、xhigh 或 max 时，就是固定那一档，不会再问 Jev。

在 **auto / jev** 里，low 仍是 Jev 可以选中的真实低档，不是这个开关。

## 如何确认生效

在 Pi 里执行 `/jev`。看这几行：

- `Pinned`：auto / jev 钉住的模型和当前档，括号里的 `initial` 是会话最初那一档。
- `Last route`：来源是 `jev` 表示模型是 Jev 选的；来源是 `failed` 表示用了后备或保留了原钉选。
- `Last trace`：最近一次审计记录。

变档时会有提示，例如 `Jev: thinking xhigh (low switch).` 或 `Jev: thinking high (was medium).`。失败时会提示保持当前档或保持 low。

会话文件在 `~/.pi/agent/sessions/`，每行一个 JSON。搜 `jev-trace` 可以顺着看。它只作记录，不会被拿去重放。

| 记录 | 含义 |
| --- | --- |
| `route applied` | 新会话由 Jev 钉住了模型和初始档。 |
| `route failed` | 选模型失败，用了后备模型。 |
| `monitor kept` | 已钉住，这次不建议换模型。 |
| `monitor suggested` | 建议换模型，当前会话不变。 |
| `effort applied` | auto / jev 上推理强度变了。 |
| `effort kept` | auto / jev 上问过，强度不变。 |
| `effort failed` | 强度检查失败，沿用当前档。 |
| `low-switch applied high` | 指定模型且菜单为 low，这次升到了 high。xhigh、max 同理。 |
| `low-switch kept low` | 问过，判断 low 就够。 |
| `low-switch failed` | 检查失败，优先沿用同模型上次成功且仍不低于最低档的强度；没有可用记录时按最低档发出。没设最低档时按 low 发出。 |

失败原因只有这几个词：`budget`、`missing-key`、`invalid-choice`、`payload`、`timeout`、`unavailable`。接口返回的原文不会写进记录。

另外还有行为用的记录：`jev-route`、`jev-pin`、`jev-effort`、`jev-monitor`、`jev-suggestion`。Pi 自己的 `model_change` 和 `thinking_level_change` 只表示菜单上选了什么，不是 Jev 的判断。

用量里的 `reasoning` 为 0，只说明接口没有单独报出推理 token。要看档位有没有升，以 `jev-trace` 为准。

## 用来核对的提示词

指定模型并把 Thinking 设为 low 之后，用难题检查会不会升档：

```text
这是一个困难的正确性与安全问题，不要使用工具。系统同时满足这些互相约束的条件：跨两个可用区的账本，写入需多数派确认；时钟会跳变最多 5 秒；幂等键只在单节点内存里保存 30 秒；故障切换时旧主可能继续提交；审计日志允许乱序但监管要求最终能证明没有双花。请给出一个不会双花、也不会在时钟跳变和脑裂同时发生时丢单的提交协议，并指出至少两个你拒绝的方案以及它们失败的具体交错。
```

期望 `Last trace` 类似 `low-switch applied xhigh openai/gpt-6-sol`。`high`、`xhigh`、`max` 都算升档。

对照用简单题：

```text
只用一行回答：17乘23等于多少？
```

期望是 `low-switch kept low`，或只升到 `medium`。

## 只读概率统计

统计脚本和配套 skill 的正本都在 `skills/pi-jev-router-inspect`。`node scripts/inspect.mjs` 只是转调用它。把这个目录链接到 agent 的 skills 目录后，改仓库即改 skill。

成功的 Choice 评估会把选项概率写进私有账本 `<Pi agent 目录>/jev-router/sessions/<session-id>.jsonl`。`node scripts/inspect.mjs show <session-id|latest>` 的 `probabilityDecisions` 列出每次最终评估的分布、最高项、次高项和差值；并列时差值为 0。分块路由的中间评估在 `intermediateProbabilities`，不和最终决策混在一起算。

推理强度的键是档位名。首次选模型和换模型建议的键是「模型 @ 强度」；当前模型会带 `keep`。不要把这些数读成单独的模型概率。概率只说明选项拉开了多少，不代表任务成功，也不会自动换模型或升降档。没有概率记为缺失，校验不通过记为无效；这项字段出现之前的旧记录也视为缺失。两种情况都不改变当时的选择。只有一个候选项因而没发请求时，不会编造概率。账本仍然不记录正文、凭证或原始响应。

## 限制

- Thinking 菜单不能改名，也不能增加 auto。low 在三个 GPT-6 上是开关，在 auto / jev 里是真实低档。
- 自适应只覆盖模型 id 为 `gpt-6-astra`、`gpt-6-luna`、`gpt-6-sol` 的请求，provider 前缀不限。其它模型即使写了 `adaptiveThinking` 也会在加载配置时报错。
- 中途改档依赖 Responses 的 `configuration_update`。不要同时打开服务商侧的自动压缩或自动截断，也不要让别的钩子插入 `configuration_update`。
- 评估把消息当任务证据。提示词里写「使用 astra」不会强制换模型。
- 发往 Jev 的摘录不脱敏。工具结果里的密钥也会被送去评估。
- `auto / jev` 不支持延后生成或后台生成。
