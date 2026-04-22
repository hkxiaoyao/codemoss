## Context

当前仓库已经做过一轮明显的 realtime 性能治理：

- `Markdown.tsx` 对流式 Markdown 做了节流，且专门处理了 Windows 下“值变化过快导致 timer starvation”的情况。
- `useThreadItemEvents.ts` 已支持 realtime delta micro-batching。
- `Messages.tsx` 已对 scrollKey 与 streaming auto-scroll 做了节流，避免 smooth scroll 抢主线程。
- `docs/research/realtime-cpu/raw-report.json` 已记录 2026-03-23 的 replay 基线对比，证明“完全没有性能治理”并不成立。

但 issue #399 暴露的问题不是“系统完全没有优化”，而是“用户仍明显感知到 GUI 慢于 CLI，而且只在某些 provider/platform 组合上更显著”。这意味着我们缺少两类能力：

1. **归因能力不足**
   现有代码能处理 timeout 或 renderer lifecycle，但还不能把一次“出字慢”拆解成：
   - provider 首包慢
   - upstream chunk cadence 粗
   - 前端 render amplification

2. **定向 mitigation 缺口**
   当前通用 throttle/batching 是全局底座，但没有 provider/platform-scoped 的更强缓解档位，导致“部分用户问题”只能靠经验判断，缺少系统化入口。

同时，仓库内已经存在 Claude provider 读取能力，例如 `vendor_get_current_claude_config` 可提供 `providerId / providerName / baseUrl`，这说明本 change 可以复用现有 provider 维度，不需要发明一套新的 provider 探测机制。

## Goals / Non-Goals

**Goals:**

- 在不扩大 blast radius 的前提下，为 issue #399 这类“部分用户慢体验”补齐可诊断、可验证、可回退的治理路径。
- 将一次流式 turn 的慢体验拆解成 upstream latency、chunk cadence 与 client render pacing 三类证据。
- 让更激进的 mitigation 只在命中的 provider/model/platform 指纹上启用。
- 保持现有 conversation lifecycle、waiting/ingress、terminal state 语义不变。
- 让后续 issue triage 能回答“是否仍存在同类现象”，而不是继续靠主观体感争论。

**Non-Goals:**

- 不做整条消息幕布或 runtime orchestrator 的大重构。
- 不引入全局性能开关面板或复杂用户自定义调参。
- 不把所有 provider 都视为需要同等级 mitigation。
- 不承诺本次 change 直接消除所有“GUI 比 CLI 慢”的主观差异。

## Decisions

### Decision 1: 先补 diagnostics，再决定是否上更强 mitigation

**Decision**

- 优先实现 per-turn stream latency diagnostics。
- 把 issue #399 从“体感慢”转成可观测的 latency 分类问题。

**Why**

- 当前已经有通用 batching / throttle，再盲目加大全局节流很可能收益很低，还会误伤正常路径。
- 没有 first token、chunk cadence、render pacing 的关联数据，就无法区分是 upstream provider 还是 GUI 放大。

**Alternatives considered**

- 方案 A：直接加大全局 throttle  
  缺点：问题可能被“隐藏”而不是“定位”，且会让正常 provider 体验一起变钝。

### Decision 2: 复用现有 diagnostics surfaces，而不是新建独立性能存储

**Decision**

- 复用现有 `rendererDiagnostics`、thread-facing diagnostics、runtime diagnostics / timeout classification。
- 仅在这些 surfaces 上补充 stream latency 相关维度和事件标签。

**Why**

- 仓库已经有 renderer lifecycle diagnostics 与 runtime timeout 分类能力；复用现有面更符合当前工程风格，也降低了落地成本。
- 该问题本身是 triage 与 targeted mitigation 问题，不值得为它新增独立 telemetry system。

**Alternatives considered**

- 方案 A：单独做一套 stream perf DB 或专用日志仓库  
  缺点：过度设计，且超出本次修复边界。

### Decision 3: mitigation 由 provider/model/platform fingerprint + evidence 双重触发

**Decision**

- mitigation 不只看单一 provider 名称，也不只看单次慢体验。
- 采用双重条件：
  - provider/model/platform fingerprint 命中，例如 `Claude-compatible Qwen provider + Windows`
  - turn 内 evidence 达到阈值，例如 first token latency 或 inter-chunk gap 明显异常

**Why**

- 只看 fingerprint 会过宽，容易把正常用户一并降级。
- 只看 evidence 会缺少稳定 profile，难以做针对性测试与回退。

**Alternatives considered**

- 方案 A：只按 provider name 触发  
  缺点：同 provider 下不同行为差异会被误伤。
- 方案 B：只按采样 evidence 触发  
  缺点：profile 不稳定，难以建立回归矩阵。

### Decision 4: 更强 mitigation 只作用于 render amplification 路径，不改变 conversation semantics

**Decision**

- 更强 mitigation 允许调整：
  - Markdown 节流频率
  - realtime delta flush 粒度
  - streaming auto-scroll 的轻量化路径
- 但不允许改变：
  - per-thread event ordering
  - terminal lifecycle
  - waiting / ingress / stop button 的语义

**Why**

- 用户抱怨的是“慢”和“卡”，不是“想少看状态”。
- 该 change 仍需与现有 `conversation-realtime-cpu-stability` 目标保持一致：优化路径不能破坏语义。

**Alternatives considered**

- 方案 A：直接关闭大部分 streaming 可视反馈  
  缺点：会让问题从“慢”变成“状态不可见”，不可接受。

### Decision 5: provider 相关维度优先从现有 Claude current config 与 turn context 获取

**Decision**

- 优先使用现有 `vendor_get_current_claude_config`、model id、engine/platform 信息推导 provider fingerprint。
- 只有在这些维度不足以稳定关联时，才考虑补 thread metadata 或 runtime-side provider hint。

**Why**

- 当前仓库已经能读到 `providerId/providerName/baseUrl`，这是低成本且高置信的数据源。
- 先复用现有数据有助于把 change 控制在“诊断 + mitigation”而不是“元数据链路重构”。

**Alternatives considered**

- 方案 A：先改 thread/session schema，强制每个 turn 挂 provider hint  
  缺点：跨层改动扩大，当前提案不需要先走到这一步。

## Risks / Trade-offs

- [Risk] fingerprint 过宽，导致未受影响用户也进入更激进 mitigation  
  Mitigation: 要求 fingerprint 与 evidence 双重命中，并保留 rollback flag 或等效降级开关。

- [Risk] diagnostics 事件过多，反而污染现有诊断面  
  Mitigation: 每 turn 只记录有限关键事件，沿用 ring buffer/trim 机制，不做无限追加。

- [Risk] 仍然无法完全区分 upstream provider 慢和 client render 慢  
  Mitigation: 至少要把“未收到首包”和“已收到 chunk 但 render pacing 差”两类问题分开，避免继续把所有问题混成一类。

- [Risk] mitigation 调整节流参数后影响消息流畅度或状态可见性  
  Mitigation: 将 lifecycle semantics 作为强约束写进 spec，并补 baseline-compatible 测试。

- [Risk] 需要 provider 维度时，现有 current config 读取点与真实 turn provider 不完全一致  
  Mitigation: 先按“当前 active provider + turn model”落地最小闭环，必要时在后续 change 再补 thread-bound provider metadata。

## Migration Plan

1. 新增 `conversation-stream-latency-diagnostics` 与 `conversation-provider-stream-mitigation` 两条 capability。
2. 在不改 schema 的前提下，先把 stream latency 关键事件接入现有 diagnostics surfaces。
3. 基于 provider/model/platform fingerprint 与 sampled evidence 实现更激进 mitigation profile。
4. 为 mitigation profile 增加 rollback control，并保持未命中路径继续走当前基线实现。
5. 运行 targeted tests、基础质量门禁与最小手测矩阵。

**Rollback strategy**

- 如果 diagnostics 事件噪音过大，可先收紧事件数量与采样窗口，但保留核心 correlation dimensions。
- 如果 mitigation 误伤范围过大，可关闭 evidence-triggered profile，只保留 diagnostics。
- 如果某个 provider fingerprint 不稳定，可临时退回模型/平台更细的匹配条件。

## Open Questions

- provider fingerprint 的最稳组合是 `providerId + baseUrl + modelPrefix`，还是 `baseUrl + modelPrefix + platform` 已足够？
- 更强 mitigation 是否需要单独暴露一个 debug/perf flag 供回归与快速回退使用，还是直接复用现有 perf flag 体系即可？
