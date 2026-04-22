## Why

上游 issue `#400` 暴露了一个很典型的 live-only 缺陷：实时对话里，行内反引号 code span 偶发会把周边正文一起吃进去，导致 inline code 渲染错位；但同一条消息进入 history 后又恢复正常。这个现象说明问题不在历史回放或最终 Markdown parser 本身，而在 live streaming 路径对“半成品 Markdown”的合并、规整与即时解析。

## 目标与边界

- 目标：
  - 修复 assistant 实时对话中 inline code span 偶发错位的问题，保证 backtick 边界在 streaming 过程中可稳定收敛。
  - 让 live assistant message 与 history restore 在最终 Markdown 语义上保持一致，避免“实时看错、历史正常”的分叉。
  - 为 live Markdown 引入受控的稳定化策略，避免每个语法未闭合的中间片段都立即触发语义级重解析。
  - 通过回归测试覆盖 split delta、snapshot/delta 交错、未闭合 backtick、完成态收敛四类边界。
- 边界：
  - 仅覆盖消息区 assistant live markdown 渲染链路：`thread reducer/text merge`、`thread item normalization`、`Markdown` live render。
  - 不修改 file preview markdown renderer，不扩展到 file-view GitHub preview。
  - 不变更 backend event schema、Tauri payload、history loader 数据结构。
  - 不重写整个消息时间线或替换 `react-markdown` 技术栈。

## What Changes

- 为 live assistant markdown 增加“inline code protected region”契约，要求 text normalization 不得在未闭合或已闭合的 inline code span 内改写内容或移动 backtick 边界。
- 为实时消息引入受控的 markdown stabilization 策略，避免 `streamingThrottleMs=0` 这类零缓冲路径在高频 delta 下持续重算语法未闭合文本。
- 收敛 live merge / normalize / render 的最终语义，保证同一 assistant message 在 live 完成后与 history reload 的 inline code 结构一致。
- 增加专门的回归测试矩阵，覆盖 streaming partial backtick、fragmented prose around code、delta/snapshot interleave、final/history parity。

## 非目标

- 不处理 fenced code block、LaTeX、Mermaid、本地图像等其他 Markdown 能力的行为增强。
- 不实现任意“流式 Markdown parser 替换”或第三方 streaming parser 引入。
- 不为了本次修复顺手改造 unrelated 的 sticky header、history expansion、runtime reconnect。
- 不扩展到 user bubble、file preview、session activity preview 之外的所有 Markdown surface，除非它们直接复用同一 live assistant render path。

## 技术方案对比

### 方案 A：继续沿用现有 live 渲染路径，只补零星正则保护

- 做法：在现有 `Markdown.tsx` normalizer 上追加一两个 backtick 判断，保持 `streamingThrottleMs=0` 和现有 merge 策略不变。
- 优点：改动小，止血快。
- 缺点：无法解决根因。当前问题不是单一正则误伤，而是 `live merge + live normalize + immediate parse` 三层叠加，只补局部判断会继续留下 split delta / snapshot interleave 的空窗。

### 方案 B：引入 live markdown stabilization contract，并把 inline code span 视为 protected region（选中）

- 做法：把问题收口为“streaming markdown compatibility”能力，统一约束 live assistant 渲染在 partial syntax 下的保护策略、bounded flush、以及 live/history final parity。
- 优点：与 issue 现象一致，能够同时覆盖 inline code 边界、live/history 语义收敛和高频流式重解析问题。
- 缺点：需要同时调整 reducer merge、normalizer 边界和测试矩阵，范围比单点补丁更大。

取舍：采用方案 B。这个问题已经不是纯 parser bug，而是 streaming 中间态被当成最终 markdown 去做语义修正，必须升到 capability 级别治理。

## Capabilities

### New Capabilities

- `message-markdown-streaming-compatibility`: 定义 assistant live markdown 在 partial syntax、inline code span、bounded stabilization 与 live/history final parity 下的兼容性契约。

### Modified Capabilities

- 无。

## Impact

- Affected frontend
  - `src/features/messages/components/Markdown.tsx`
  - `src/features/messages/components/MessagesRows.tsx`
  - `src/features/threads/hooks/threadReducerTextMerge.ts`
  - `src/utils/threadItems.ts`
- Affected tests
  - `src/features/messages/components/Markdown.*.test.tsx`
  - `src/features/messages/components/Messages*.test.tsx`
  - `src/features/threads/hooks/useThreadsReducer.test.ts`
- No backend, storage, or Tauri command contract changes expected.

## 验收标准

- 在 assistant 实时对话中，当 inline code span 的 opening/closing backtick 被拆分到不同 delta 时，系统 MUST NOT 把相邻正文错误并入 code span。
- 在 live streaming 期间，inline code 附近的 fragmented text normalization MUST NOT 改写 protected region 内的内容或移动其边界。
- 在 turn completed 后，同一 assistant message 的最终渲染结果 MUST 与 history reload 的 inline code 结构一致。
- 实时消息渲染路径 MUST 使用 bounded stabilization，而不是对每个 syntax-incomplete fragment 都执行零缓冲语义级解析。
- 相关回归测试 MUST 覆盖 partial backtick、delta/snapshot interleave、final/history parity，并通过。
