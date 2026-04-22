# Fix Claude Chat Canvas Cross-Platform Blanking

## Goal

将 `#392` 对应的 Claude 聊天幕布空白回归从“平台补丁”收敛为统一的 `Claude desktop render-safe mode`，保证在 Windows/macOS desktop surface 上，Claude live conversation 在第二轮及后续高频实时更新期间不会出现闪白后整块空白。

## Linked OpenSpec Change

- `fix-claude-chat-canvas-cross-platform-blanking`

## Requirements

- render-safe mode 必须作用于 `Claude + normalized processing + desktop surface`，不能继续写死为 Windows-only。
- `Messages` 内部与 processing 相关的关键渲染判定必须优先使用 normalized `conversationState`，避免 stale legacy props 漏触发。
- 在 render-safe mode 下，系统可以降级高风险 ingress 动画与 `content-visibility` 优化，但不能丢失 processing 可见性。
- history sticky、live sticky、collapsed history 等主阅读路径在 render-safe mode 下必须仍然可读、可滚动、可交互。
- Codex 路径不得被误伤，仍作为对照组保持现有行为。
- OpenSpec proposal/design/specs/tasks 必须完整并能通过严格校验。

## Acceptance Criteria

- [x] `Messages.tsx` 使用统一的 `claude-render-safe` class，而不是 `windows-claude-processing`。
- [x] `claude-render-safe` 在 Windows 与 macOS 的 desktop surface 上都能启用。
- [x] normalized `conversationState.meta.isThinking` 能覆盖 stale legacy `isThinking` 并触发 render-safe mode。
- [x] Codex desktop path 不会误挂 Claude render-safe class。
- [x] 定向测试通过：
  - `Messages.test.tsx`
  - `Messages.live-behavior.test.tsx`
  - `Messages.windows-render-mitigation.test.tsx`
  - `layout-swapped-platform-guard.test.ts`
- [x] `npm run typecheck` 通过。
- [x] `npm run check:large-files` 通过。
- [x] `openspec validate fix-claude-chat-canvas-cross-platform-blanking --type change --strict --no-interactive` 通过。

## Technical Notes

- Primary frontend files:
  - `src/features/messages/components/Messages.tsx`
  - `src/styles/messages.css`
  - `src/features/messages/components/Messages.windows-render-mitigation.test.tsx`
  - `src/styles/layout-swapped-platform-guard.test.ts`
- Primary spec files:
  - `openspec/changes/fix-claude-chat-canvas-cross-platform-blanking/proposal.md`
  - `openspec/changes/fix-claude-chat-canvas-cross-platform-blanking/design.md`
  - `openspec/changes/fix-claude-chat-canvas-cross-platform-blanking/specs/**`
- 当前实现不涉及 backend contract、Tauri command 或 storage schema 改动。
