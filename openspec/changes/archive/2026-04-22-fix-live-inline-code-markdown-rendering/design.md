## Context

当前消息区 assistant live markdown 存在明显的双路径分叉：

- `MessagesRows` 对 live assistant 传入 `streamingThrottleMs={0}`，而非 live/history 路径使用有界节流。
- `Markdown.tsx` 在交给 `react-markdown` 之前会执行多层正文规整，但目前只用 code fence 作为保护边界，没有把 inline code span 视为 protected region。
- `threadReducerTextMerge.ts` 与 `threadItems.ts` 还会在 live 阶段对 assistant 文本做 merge / echo-strip / fragmented paragraph merge / sentence dedupe，这些规则对 block markdown 有保护，对 inline backtick 没有保护。

这解释了为什么问题只在 live streaming 中偶发出现，而 history 恢复后正常：history 拿到的是 completed 收敛文本，live 拿到的是“持续被合成和规整的半成品 markdown”。

## Goals / Non-Goals

**Goals:**

- 为 live assistant markdown 建立统一的 streaming compatibility contract。
- 把 inline code span 从“普通正文字符”提升为 protected region，避免 live normalizer 和 merge 规则误伤。
- 为语法未闭合的 live markdown 引入 bounded stabilization，减少零缓冲重解析导致的语义抖动。
- 保证 live completion 与 history reload 的最终 inline code 语义一致。

**Non-Goals:**

- 不替换 `react-markdown` / `remark-gfm` 主技术栈。
- 不引入新的 backend/runtime 事件类型。
- 不扩展到 file preview markdown renderer。
- 不重构整个 conversation timeline 或 unrelated message UI。

## Decisions

### Decision 1：把修复对象定义为 live markdown stabilization，而不是 history/parser bug

- 方案 A：把问题当成 parser 偶发错误，只在 `Markdown.tsx` 上做局部补丁。
  - 优点：改动小。
  - 缺点：无法解释“history 正常、live 异常”的路径分叉。
- 方案 B：明确把问题定义为 live streaming markdown contract 缺失（选中）。
  - 优点：与根因一致，能统一约束 merge、normalize、render 三层。
  - 缺点：需要横跨多个前端模块补齐约束与测试。

取舍：采用方案 B。

### Decision 2：inline code span 视为 protected region，normalizer 不得跨边界改写

- 方案 A：继续只保护 fenced code block。
  - 优点：实现简单。
  - 缺点：无法覆盖本次 issue 的核心场景，因为问题正是 inline code span。
- 方案 B：对 inline code span 建立 protected-region 识别，并让 live normalizer/repair 规则跳过这些区域（选中）。
  - 优点：能直接阻断 fragmented paragraph merge、resource repair、link/path enhancement 等逻辑跨入 code span。
  - 缺点：需要定义未闭合 backtick 的保守处理策略。

取舍：采用方案 B。

### Decision 3：live assistant markdown 使用 bounded stabilization，而不是 `0ms` 即时重解析

- 方案 A：继续 `streamingThrottleMs=0`，依赖更强的正则保护。
  - 优点：视觉延迟最小。
  - 缺点：会把每个语法未闭合的中间片段都立即送去做语义解析，最容易放大误判。
- 方案 B：把 live assistant markdown 收敛到一个小而明确的 flush window，并在 completed 时立即刷新最终态（选中）。
  - 优点：可以显著减少“半个 backtick span”触发的误渲染窗口，同时不影响最终完成态。
  - 缺点：会引入一个很小的 live 显示延迟。

取舍：采用方案 B。稳定优先于零延迟，因为这里的失败模式是语义错位，不是纯视觉闪动。

### Decision 4：最终 correctness 以 live/history final parity 为准

- 方案 A：只要求 live 过程中“看起来不太错”。
  - 优点：门槛低。
  - 缺点：容易留下 completed 之后仍与 history 语义不一致的状态。
- 方案 B：把“同一 assistant message 在 completed 后与 history reload 一致”作为最终 correctness contract（选中）。
  - 优点：验证标准清晰，也便于测试。
  - 缺点：需要建立 parity regression tests。

取舍：采用方案 B。

## Risks / Trade-offs

- [Risk] bounded stabilization 过大，导致 live 文本显示延迟体感变差  
  Mitigation: 使用小窗口并在 completed 时强制立即收敛，避免拖慢最终态。

- [Risk] protected-region 识别过宽，导致某些普通文本增强规则失效  
  Mitigation: 仅在 inline code span 和 syntax-incomplete backtick 区间内禁用语义改写，不扩大到整段文本。

- [Risk] 只改 `Markdown.tsx` 仍会被上游 merge/normalize 二次破坏  
  Mitigation: 同时检查 `threadReducerTextMerge.ts` 与 `threadItems.ts` 的 assistant text path，把边界保护上移。

- [Risk] parity 测试不足，后续优化再次把 live/history 拉开  
  Mitigation: 补 dedicated regression tests，覆盖 split delta、snapshot interleave、completed parity。

## Migration Plan

1. 在 proposal/spec 中新增 `message-markdown-streaming-compatibility` capability。
2. 收紧 live assistant markdown flush/staging 策略，移除零缓冲语义级解析路径。
3. 为 inline code span 增加 protected-region 边界，并让相关 normalizer/merge 逻辑跳过这些区域。
4. 为 live assistant message 增加 final/history parity regression tests。
5. 运行 OpenSpec 校验与前端定向测试，确认该 change 可继续 apply。

**Rollback strategy**

- 若 bounded stabilization 带来不可接受的延迟，可先缩小窗口，但保留 protected-region 保护。
- 若某个 normalizer 的 protected-region 跳过范围过大，可逐条回滚增强逻辑，而不是回滚整个 capability。
- 本 change 不涉及 backend/schema 迁移，回滚仅限前端实现与 specs delta。

## Open Questions

- live assistant markdown 的稳定化窗口最终是统一常量，还是按 engine / item type 区分更稳？
- session activity preview 等复用消息 markdown 的 surface，是否需要同步继承同一 protected-region 逻辑，还是保持只修主聊天幕布？
