# Journal - chenxiangning (Part 3)

> Continuation from `journal-2.md` (archived at ~2000 lines)
> Started: 2026-04-21

---



## Session 69: 加固 Codex runtime 异常退出恢复链路

**Date**: 2026-04-21
**Task**: 加固 Codex runtime 异常退出恢复链路
**Branch**: `feature/f-v0.4.6`

### Summary

(Add summary)

### Main Changes

任务目标：对当前工作区进行全面 review，重点检查 runtime recovery 相关改动在边界条件、异常输入、大文件治理和 Windows/macOS 兼容性上的完整性，并直接修复发现的问题后提交。

主要改动：
- 为 Codex runtime 异常退出链路补齐 OpenSpec 变更与后端模块拆分，新增 runtime lifecycle / plan enforcement 模块。
- 在 Rust runtime pool 中记录 active work protection、last exit diagnostics、pending request count，并在 runtime ended / manual release 等场景下正确清理 lease 与状态。
- 在前端 useAppServerEvents 中完善 runtime/ended 事件处理，支持仅凭 affectedActiveTurns 做线程 teardown，并把 pendingRequestCount 归一化为非负整数。
- 在 Runtime Pool Console 与消息恢复卡片中补齐 runtime ended 诊断展示及中英文文案。
- 新增/更新前端与 Rust 定向测试，覆盖 runtime ended、共享线程映射、恢复提示与稳定性诊断。
- 将 runtime ledger 原子写实现对齐项目现有 storage 模式，降低 Windows 文件替换失败时的残留临时文件风险。

涉及模块：
- src-tauri/src/backend/app_server*.rs
- src-tauri/src/runtime/mod.rs
- src/features/app/hooks/useAppServerEvents*
- src/features/messages/components/RuntimeReconnectCard.tsx
- src/features/settings/components/settings-view/sections/RuntimePoolSection.tsx
- src/features/threads/utils/stabilityDiagnostics*
- src/i18n/locales/en.part1.ts
- src/i18n/locales/zh.part1.ts
- openspec/changes/harden-codex-runtime-exit-recovery/**

验证结果：
- npm run typecheck 通过。
- npm run check:runtime-contracts 通过。
- npm run check:large-files 通过，未新增超过 3000 行文件。
- npx vitest run src/features/app/hooks/useAppServerEvents.test.tsx src/features/app/hooks/useAppServerEvents.runtime-ended.test.tsx src/features/messages/components/Messages.runtime-reconnect.test.tsx src/features/threads/utils/stabilityDiagnostics.test.ts 通过（70 tests）。
- cargo test --manifest-path src-tauri/Cargo.toml runtime_ended 通过。
- npm run lint 通过，但仓库内仍存在既有 react-hooks/exhaustive-deps warnings，本次未新增 lint error。

后续事项：
- app_server 模块拆分后，auto-compaction 触发链仍被临时禁用，当前保留手动 compact 路径，后续若恢复自动 compact 需单独补 capability 回归测试。
- 这次录入了新的 OpenSpec change，后续如继续推进该链路，建议补充 validate/sync/archive 流程。


### Git Commits

| Hash | Message |
|------|---------|
| `d34a18547b1b0dd957eeb1dcc2fc94f0c8c85bed` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 70: 统一 runtime 实例保留时长默认值与上限

**Date**: 2026-04-21
**Task**: 统一 runtime 实例保留时长默认值与上限
**Branch**: `feature/f-v0.4.6`

### Summary

(Add summary)

### Main Changes

任务目标:
- 调整 Runtime Pool Console 中 Codex Warm 实例保留时长配置
- 将默认值统一为 7200 秒，将最大值统一为 14400 秒
- 消除 frontend 与 backend 默认值、输入约束、持久化清洗之间的配置漂移

主要改动:
- 更新 frontend app settings 默认值与 normalize 兜底逻辑，统一 codexWarmTtlSeconds 为 7200/14400
- 更新 RuntimePoolSection 的本地草稿默认值、保存时 clamp 逻辑与输入 max 属性
- 更新 backend AppSettings 默认值与 sanitize_runtime_pool_settings 上限，避免落库后被旧约束回收
- 同步调整 SettingsView 与 runtimePoolSection 工具测试，以及 Rust sanitize 测试期望

涉及模块:
- src/features/settings/hooks/useAppSettings.ts
- src/features/settings/components/settings-view/sections/RuntimePoolSection.tsx
- src/features/settings/components/settings-view/sections/runtimePoolSection.utils.test.ts
- src/features/settings/components/SettingsView.test.tsx
- src-tauri/src/types.rs

验证结果:
- 通过: npx vitest run src/features/settings/components/settings-view/sections/runtimePoolSection.utils.test.ts src/features/settings/components/SettingsView.test.tsx
- 通过: npm run typecheck
- 通过: cargo test --manifest-path src-tauri/Cargo.toml app_settings_sanitize_runtime_pool_settings_clamps_budget_fields
- 通过: cargo test --manifest-path src-tauri/Cargo.toml read_settings_sanitizes_runtime_pool_values

后续事项:
- 若产品侧还希望限制更精细的输入体验，可补充输入框 help 文案，直接展示 7200 秒默认值与 14400 秒上限


### Git Commits

| Hash | Message |
|------|---------|
| `cf87cb3be0666158a508cfc3a9fcb6f85363aae6` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 71: 支持历史幕布按分段吸顶用户问题

**Date**: 2026-04-21
**Task**: 支持历史幕布按分段吸顶用户问题
**Branch**: `feature/f-v0.4.6`

### Summary

(Add summary)

### Main Changes

任务目标:
- 落地 pin-history-user-question-bubble，对历史幕布提供按分段吸顶的用户问题气泡。
- 保持 realtime sticky 现有 contract，不与 history sticky 混用。

主要改动:
- 在 Messages.tsx 中拆分 live sticky 与 history sticky 的资格判断。
- 在 messagesLiveWindow.ts 中导出 ordinary user 问题判定，复用伪 user 过滤逻辑。
- 在 messages.css 中为 history sticky 复用现有 sticky wrapper 视觉与 top offset。
- 在 Messages.live-behavior.test.tsx 中补充 history sticky、realtime 优先级、伪 user 排除、collapsed-history 边界回归测试。
- 新增 OpenSpec change: pin-history-user-question-bubble，并补齐 proposal/design/specs/tasks。
- 新建 Trellis task: 04-21-pin-history-user-question-bubble。

涉及模块:
- src/features/messages/components/Messages.tsx
- src/features/messages/components/messagesLiveWindow.ts
- src/features/messages/components/Messages.live-behavior.test.tsx
- src/styles/messages.css
- openspec/changes/pin-history-user-question-bubble/*
- .trellis/tasks/04-21-pin-history-user-question-bubble/task.json

验证结果:
- pnpm vitest run src/features/messages/components/Messages.live-behavior.test.tsx 通过（27 tests）。
- npm run typecheck 通过。
- npm run check:large-files 通过。
- npm run lint 通过（仓库已有 warnings，无 errors）。
- openspec validate pin-history-user-question-bubble --type change --strict --no-interactive 通过。
- git diff --check 通过。

后续事项:
- 建议补一次人工滚动验收，确认真实浏览器/Tauri 中 sticky 接棒体感符合预期。
- 若人工验收无问题，可继续准备 archive 或后续合并流程。


### Git Commits

| Hash | Message |
|------|---------|
| `be4384f23fef61ee5903a24492fe8214575aeaf7` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete
