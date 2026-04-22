## Why

issue [#399](https://github.com/zhukunpenglinyutong/desktop-cc-gui/issues/399) 反馈的是一个很具体但归因不清的体验问题：`Windows + 阿里云 Qwen 3.6 Plus` 在桌面端会出现“整体速度慢、出字一卡一卡、明显慢于 CLI”的感知，而且用户补充说明 `0.4.5`、`0.4.6` 都存在，重装无效。当前最新代码已经具备 realtime batching、Markdown throttle、scroll throttle 与 desktop render-safe 等缓解能力，因此这更像“部分 provider / 平台 / 流式节奏”被放大的链路问题，而不是一个简单的全局性能缺陷。

最稳的修复方向不是继续盲目加大通用 throttle，而是先补齐可归因的 stream latency diagnostics，再只对命中的 provider/platform 指纹落定向 mitigation。这样既能回应用户体感，也能避免把现有正常路径一起拖慢。

## 目标与边界

### 目标

- 将该问题正式定义为“流式慢体验的可观测性缺口 + provider-scoped mitigation 缺口”，而不是未经证实的通用性能 bug。
- 为每个受影响 turn 记录可关联的 latency 证据，至少覆盖：
  - first token latency
  - chunk cadence / inter-chunk gap
  - renderer 侧节流/重渲染/scroll 开销
  - `workspace/thread/engine/provider/model/platform` 维度
- 基于现有代码已有的 batching / throttle 底座，增加 evidence-backed 的 provider/platform 定向 mitigation，而不是对所有会话一刀切。
- 保持当前 `Codex / Gemini / OpenCode` 以及未命中问题指纹的 Claude provider 行为不被误伤。
- 保持现有等待态、处理中语义和终态语义不变，修的是“慢体验”和“误归因”，不是重写会话生命周期。

### 边界

- 本 change 只覆盖诊断与定向缓解，不重写整条消息时间线或 runtime 管理架构。
- 本 change 不承诺把所有 provider 的体感都优化到与 CLI 完全等价。
- 本 change 不引入新的持久化 schema 或单独的性能数据库，优先复用现有 diagnostics surfaces。
- 本 change 不改变 Claude / Codex / Gemini 的对话协议，不修改 Tauri command payload contract。
- 本 change 不把任何 provider 永久降级到全局低频渲染模式。

## 非目标

- 不做“全局流式性能大重构”。
- 不把所有慢体验都归因到前端渲染。
- 不新增复杂的用户可编辑性能参数矩阵。
- 不顺手处理与本 issue 无关的 runtime reconnect、history replay、sticky header 样式问题。

## What Changes

- 新增一条 stream latency diagnostics capability，要求系统在流式会话中记录 first token、chunk cadence、render/scroll 热点以及相关 provider/model/platform 维度，并复用现有 renderer/runtime/thread diagnostics surfaces。
- 新增一条 provider-scoped stream mitigation capability，要求系统只在证据明确命中的 provider/platform 指纹上启用更激进的节流或轻量渲染路径，例如 `Windows + Claude-compatible Qwen provider`。
- 保持现有 realtime batching、Markdown throttle、scroll throttle 与 stream activity phase 作为通用底座；本 change 不把它们替换成新的通用策略。
- 明确修复验收方式：必须能够回答“是上游首包慢”“是 chunk cadence 粗”“还是 GUI render amplification”三者中的哪一种或哪几种。

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/成本 | 结论 |
|---|---|---|---|---|
| A | 直接继续全局加大 throttle / batching | 代码改动最直接 | 会把未受影响路径一起拖慢，且无法证明问题根因 | 不采用 |
| B | 诊断先行，基于 provider/model/platform 指纹做定向 mitigation | 可归因、blast radius 小、便于回退 | 需要补齐 diagnostics 维度与测试矩阵 | **采用** |
| C | 把问题全部归因到上游 provider，只做 issue 回复不修代码 | 成本最低 | 用户体感问题无处沉淀，后续仍无法定位是否为客户端放大 | 不采用 |

## Capabilities

### New Capabilities

- `conversation-stream-latency-diagnostics`: 约束流式对话必须记录 first token latency、chunk cadence、renderer pacing 与 provider/model/platform 相关维度，便于归因与回归比较。
- `conversation-provider-stream-mitigation`: 约束系统仅在命中的 provider/platform 指纹上启用更激进的流式渲染缓解，并保持会话语义不丢失。

### Modified Capabilities

- （无）

## 验收标准

- 对于 issue #399 这类反馈，系统 MUST 能通过现有 diagnostics surfaces 回答至少以下之一：
  - 上游 provider 首包慢
  - chunk cadence 粗或长时间无新 chunk
  - 前端 render/scroll/Markdown 路径放大了慢体验
- 当命中的 provider/platform 指纹需要更激进 mitigation 时，系统 MUST 只影响该命中路径，而不是全局降低所有会话的流式刷新频率。
- 未命中问题指纹的 Claude provider，以及 Codex/Gemini/OpenCode 路径 MUST 保持当前行为基线。
- 任何 mitigation 激活后，系统 MUST 继续保留 waiting/ingress/processing/terminal lifecycle 的既有语义，不得丢消息、乱序或伪完成。
- 相关测试至少覆盖：
  - diagnostics 维度采集与相关字段完整性
  - 命中 provider/profile 时 mitigation 生效
  - 未命中 provider/profile 时基线路径不变
  - mitigation 激活后 conversation semantics 与 terminal outcome 不变

## Impact

- Affected frontend:
  - `src/features/messages/components/Markdown.tsx`
  - `src/features/messages/components/Messages.tsx`
  - `src/features/threads/hooks/useThreadItemEvents.ts`
  - `src/features/threads/hooks/useThreadMessaging.ts`
  - `src/services/rendererDiagnostics.ts`
  - `src/services/tauri.ts`
- Affected backend / bridge:
  - 可能复用 `vendor_get_current_claude_config` 与现有 runtime diagnostics surfaces
  - 不预期引入新的持久化 schema 或 command payload breaking change
- Affected specs:
  - new `conversation-stream-latency-diagnostics`
  - new `conversation-provider-stream-mitigation`
