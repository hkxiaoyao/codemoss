## 1. Live Markdown Stabilization

- [x] 1.1 [P0][depends:none][I:`MessagesRows.tsx` live assistant render path][O: bounded live markdown flush/staging replacing zero-latency parse][V: targeted component tests assert live assistant no longer uses unstable zero-buffer semantic parse path] 收敛 live assistant markdown 的 flush 策略，移除 `streamingThrottleMs=0` 导致的语法未闭合即时重解析窗口。
- [x] 1.2 [P0][depends:1.1][I:`Markdown.tsx` normalization pipeline][O: inline-code protected-region parser and skip-normalization path][V: Markdown unit tests cover unmatched/closed backtick transitions without adjacent prose capture] 为 inline code span 建立 protected-region 边界，并让 live normalizer 跳过这些区域。

## 2. Upstream Merge And Normalize Safety

- [x] 2.1 [P0][depends:1.2][I:`threadReducerTextMerge.ts` assistant delta/snapshot merge logic][O: live merge no longer shifts or rewrites inline-code boundaries][V: reducer tests cover split delta and snapshot/delta interleave around backticks] 收紧 assistant live merge 逻辑，避免 partial snapshot/echo cleanup 破坏 backtick 边界。
- [x] 2.2 [P1][depends:2.1][I:`threadItems.ts` assistant text normalization][O: fragmented paragraph/sentence cleanup respecting inline-code protected regions][V: thread item tests prove code span content is not mutated by readability normalization] 让 assistant text normalization 在 inline code 周围保持边界安全。

## 3. Final Parity Regression Coverage

- [x] 3.1 [P0][depends:1.2,2.2][I:`Markdown` and `Messages` test suites][O: dedicated live inline-code regression matrix][V: tests cover unmatched backtick, delayed closing backtick, fragmented prose around code, completed flush] 补 live markdown inline-code 回归测试矩阵。
- [x] 3.2 [P1][depends:3.1][I:`useThreadsReducer` or history restore parity path][O: live/history final parity assertions for the same assistant message][V: tests prove completed live message and history reload produce equivalent inline-code structure] 增加 live/history 收敛一致性测试。

## 4. Verification

- [x] 4.1 [P0][depends:3.2][I: affected frontend modules and tests][O: passed targeted frontend quality gates][V: `npm run lint`, `npm run typecheck`, and relevant Vitest suites pass] 运行前端质量门禁并修复回归。
- [x] 4.2 [P1][depends:4.1][I: OpenSpec change artifacts][O: strict-valid change ready for apply][V: `openspec validate fix-live-inline-code-markdown-rendering --type change --strict --no-interactive` passes] 完成 OpenSpec 严格校验并确认该 change 可继续 apply。
