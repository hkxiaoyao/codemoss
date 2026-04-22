## 1. Stream Latency Diagnostics

- [x] 1.1 [P0][depends:none][I: 现有 renderer diagnostics、thread/runtime diagnostics、issue #399 的 Qwen/Windows 反馈][O: 每 turn 可关联的 stream latency evidence contract][V: 设计审阅与 targeted tests 可确认 first token / cadence / render pacing / provider-model-platform 维度齐全] 收敛流式慢体验的 correlation dimensions 与事件边界。
- [x] 1.2 [P0][depends:1.1][I: `rendererDiagnostics.ts`、timeout/network error 分类、现有 bounded diagnostics 机制][O: 复用现有 surfaces 的 latency diagnostics 落点][V: Vitest 覆盖 bounded append、timeout 分类对齐与 turn correlation 不丢失] 让 latency diagnostics 进入现有 diagnostics surfaces，而不是另起存储系统。

## 2. Provider-Scoped Mitigation Profile

- [x] 2.1 [P0][depends:1.1][I: Claude current provider config、model id、platform 信息][O: 可测试的 provider/model/platform fingerprint 解析链][V: 单测覆盖 Qwen-compatible provider 命中、非命中 provider 保持 baseline] 定义 issue #399 对应的 provider-scoped mitigation fingerprint。
- [x] 2.2 [P0][depends:1.2,2.1][I: `Markdown.tsx`、`Messages.tsx`、`useThreadItemEvents.ts` 当前 batching/throttle 底座][O: evidence-backed 的更激进 mitigation profile][V: Vitest/replay coverage 断言 mitigation 激活后消息语义与终态不变] 在命中 profile 的路径上落更强的 render/scroll/Markdown 缓解策略。
- [x] 2.3 [P1][depends:2.2][I: 现有 perf flags / diagnostics path][O: 可观测且可回退的 mitigation 开关语义][V: 测试覆盖 mitigation active reason 记录与 rollback 回到 baseline path] 为 provider-scoped mitigation 补齐激活证据记录与回退路径。

## 3. Verification

- [x] 3.1 [P0][depends:2.3][I: 受影响前端 hooks/components 与 diagnostics surfaces][O: 通过的 targeted 回归矩阵][V: `npm run lint`、`npm run typecheck`、相关 Vitest/replay tests 全通过] 运行基础质量门禁与针对流式链路的回归测试。
- [ ] 3.2 [P1][depends:3.1][I: Qwen-compatible provider 与非命中 provider 的人工对照场景][O: 最小手测结论][V: 可明确回答“仍然慢的是上游、chunk cadence，还是 GUI render amplification”] 执行最小人工验证矩阵并沉淀 triage 结论。
