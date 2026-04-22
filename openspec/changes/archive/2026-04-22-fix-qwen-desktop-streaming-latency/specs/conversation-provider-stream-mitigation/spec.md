## ADDED Requirements

### Requirement: Provider-Scoped Stream Mitigation MUST Be Activated By Fingerprint And Evidence

系统 MUST 仅在命中的 provider/model/platform 指纹且存在对应 latency 证据时，启用更激进的流式渲染缓解策略。

#### Scenario: matched provider fingerprint activates stronger mitigation
- **WHEN** 某个流式会话命中预定义的 provider/model/platform 指纹，例如 `Claude-compatible Qwen provider + Windows`
- **AND** 同一次 turn 的 latency evidence 达到激活阈值
- **THEN** 系统 MUST 为该路径启用更激进的 stream mitigation profile
- **AND** 未命中的 provider 或没有证据的 turn MUST 继续使用当前基线路径

#### Scenario: unmatched providers retain baseline behavior
- **WHEN** 当前会话不命中该 provider/model/platform 指纹，或没有达到 latency evidence 阈值
- **THEN** 系统 MUST 保持现有 batching / throttle / render-safe 基线行为
- **AND** MUST NOT 因单个 issue 的修复把所有会话一并降级

### Requirement: Stream Mitigation MUST Reduce UI Amplification Without Breaking Conversation Semantics

更激进的 mitigation 可以调整 render/scroll/Markdown 的刷新策略，但 MUST 保持会话语义不变。

#### Scenario: mitigation adjusts pacing without losing ordering or terminal outcome
- **WHEN** mitigation profile 已启用
- **THEN** 系统 MAY 提高 Markdown throttle、收紧 render light path 或调整 realtime flush/scroll 节奏
- **AND** batched ordering、terminal lifecycle 与 conversation visible outcome MUST 与基线路径保持语义一致

#### Scenario: waiting and ingress visibility survive mitigation
- **WHEN** mitigation profile 已启用且会话仍处于 processing
- **THEN** 系统 MUST 保留 waiting/ingress/stop 等基础状态可见性
- **AND** 用户 MUST NOT 因 mitigation 失去对“仍在处理中”的判断能力

### Requirement: Active Mitigation MUST Be Observable And Rollback-Safe

系统 MUST 让 triage 与回退可以明确知道某次 turn 是否命中了 mitigation profile。

#### Scenario: diagnostics record active mitigation profile and activation reason
- **WHEN** 某个 turn 启用了 provider-scoped mitigation
- **THEN** diagnostics MUST 记录命中的 profile、触发证据摘要与关键 correlation dimensions
- **AND** triage 时 MUST 能区分“问题仍存在于基线路径”还是“问题出现在 mitigation 路径”

#### Scenario: rollback restores baseline path without breaking session continuity
- **WHEN** 某个 mitigation profile 被关闭、回退或临时禁用
- **THEN** 系统 MUST 能回到现有基线路径
- **AND** 该回退 MUST NOT 破坏当前会话连续性或引入新的 lifecycle drift
