# Align Live Sticky With History Header

## Goal

把 realtime 用户问题吸顶从“原气泡 wrapper sticky”统一为与 history 一致的 condensed sticky header，并复用 history-style section handoff；同时保留 live window trimming 下对最新 ordinary user question source row 的 render-window 保底。

## Requirements

- realtime 与 history 使用同一种 sticky header 视觉与 DOM 语义
- realtime 对当前 rendered ordinary user sections 复用与 history 一致的 physical handoff 规则
- history section handoff 规则保持不变
- restored history、window trimming、pseudo-user 过滤继续正确
- 最新 ordinary user question 即使被 live window trimming 裁掉，也仍能重新参与 sticky 计算

## Acceptance Criteria

- [ ] realtime 不再渲染 `.messages-live-sticky-user-message`
- [ ] realtime/history 都通过同一条 sticky header 出口渲染
- [ ] realtime 回看更早 rendered sections 时，sticky header 会按 history-style handoff 接棒
- [ ] trimmed live latest question 仍然可以驱动 sticky header
- [ ] `Messages.live-behavior.test.tsx` 通过

## Technical Notes

- Primary files:
  - `src/features/messages/components/Messages.tsx`
  - `src/features/messages/components/MessagesTimeline.tsx`
  - `src/features/messages/components/messagesLiveWindow.ts`
  - `src/styles/messages.css`
  - `src/styles/messages.history-sticky.css`
  - `src/features/messages/components/Messages.live-behavior.test.tsx`
