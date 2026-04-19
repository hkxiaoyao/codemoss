# Proposal: Fix Project Session Management Scope

## Why

当前 `Session Management` 的产品语义与实现语义已经出现明显断裂。

- UI 文案承诺“按项目统一管理真实会话历史”，但当前后端读取仍以单个 `workspaceId -> workspacePath` 为边界，主项目下的 worktree 会话不会自动并入同一个管理视图。
- `mossx` 的真实排查结果表明：主 workspace 可读到 5 条 Codex 会话，两个关联 worktree 还各自持有 3 条和 1 条会话；按“项目”语义应至少可见 9 条，但当前页面只会返回当前 workspace 自己那一部分。
- Codex 本地历史读取还存在第二层漏读风险：当 workspace 使用自定义 `codexHome` 或其它 source roots 时，单 workspace 查询会收窄到单组 roots，不再补扫默认 `~/.codex` roots，导致不同 source/provider 产生的历史被静默遗漏。
- 批量 `archive / unarchive / delete` 当前同样以单 workspace 为路由前提；一旦列表改成项目聚合视图，若不同时修正 mutation 路由，前端会出现“能看见但操作不准”甚至误删/漏删的问题。

这不是简单的 UI bug，而是“项目级治理能力”缺少稳定 contract。需要通过 OpenSpec 明确：什么叫 project-scoped session catalog、哪些 workspace 会被聚合、不同 source 的历史如何统一读取，以及批量操作如何保持精确路由。

## 目标与边界

### 目标

- 把 `Session Management` 的读取边界从“单 workspace 视图”收敛成稳定的“项目级会话目录”语义。
- 规定主 workspace 进入会话管理时，必须聚合其自身与受管 worktrees 的真实会话历史。
- 规定 Codex history 在项目会话目录里必须跨可用 source roots 统一读取，不得因为 source 切换或 codex home 配置差异而把旧历史静默隐藏。
- 规定项目聚合视图下的 `archive / unarchive / delete` 必须按会话真实归属 workspace 精确路由，而不是假设所有 entry 都属于当前 picker 选中的 workspace。
- 为前端补充可决策的来源信息，使用户能看出某条会话来自 main workspace 还是某个 worktree、来自哪个 source/provider。

### 边界

- 本提案只覆盖 `Session Management` 与其依赖的本地历史聚合 contract，不改动普通 sidebar/thread list 的默认展示策略。
- 本提案重点修正 `Codex` 项目会话目录与其批量治理语义；`Claude / Gemini / OpenCode` 仍需遵守统一项目聚合边界，但不在本轮扩展新的引擎能力。
- 本提案不重新设计整个设置页视觉结构，只要求现有管理页与其数据 contract 对齐。
- 本提案不引入新的 archive storage 机制，继续沿用现有 session-management metadata 方案，但要修正其适用范围与 identity 语义。

## 非目标

- 不在本轮重做主聊天页、sidebar 或 workspace home 的最近会话展示策略。
- 不在本轮引入远程会话同步、云端索引或数据库化会话目录。
- 不在本轮扩展 shared session 的归档/删除能力，shared session 仍可维持现有限制。
- 不在本轮把所有会话治理入口重构成全新页面流；现有入口只要语义正确即可。

## What Changes

- 明确 `Session Management` 的默认读取语义：
  - 当用户选择 main workspace 时，系统必须把该 main workspace 与其 child worktrees 视为同一 project scope。
  - 当用户明确选择某个 worktree 时，系统可以退回 worktree-only 视图。
- 明确项目级 session catalog 的聚合 contract：
  - 聚合结果必须包含 entry 的稳定 `sessionId`、`engine`、`updatedAt`、`archivedAt`、`source/sourceLabel`，以及真实归属 `workspaceId`。
  - 前端不得再假设“当前列表里的所有 entry 都属于当前 picker 的 workspaceId”。
- 修正 Codex history roots 解析策略：
  - 项目会话目录必须同时纳入 workspace override roots 与默认 `~/.codex` roots，并对 roots 去重。
  - source/provider 切换后，历史不得因为当前 active source 变化而消失。
- 修正项目聚合视图下的 mutation contract：
  - `archive / unarchive / delete` 必须按 entry owner workspace 路由到正确的 workspace scope。
  - 批量请求可按 workspace 分桶执行，但返回仍需回到统一结果集合，保持部分失败可见。
- 补充前端展示基线：
  - 项目聚合视图中的 entry 必须可显示所属 workspace/worktree。
  - 若 entry 带有 source/provider 元数据，UI 应能显示紧凑来源标识，避免“为什么这里只有这些会话”不可解释。
- 补充一致性与验证要求：
  - 主项目聚合视图的会话总量必须覆盖 main + worktrees 的真实本地历史。
  - 批量归档、取消归档、删除在聚合视图下必须只影响被选中的真实 entry，不得出现跨 workspace 误伤或遗漏。

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/成本 | 结论 |
|---|---|---|---|---|
| A | 维持单 workspace 读取，仅调整 UI 文案 | 改动最小 | 继续违背“按项目统一管理”承诺，真实漏会话问题不解决 | 不采用 |
| B | 保持单 workspace 读取，但新增“手动切换 worktree 查看”引导 | 实现简单 | 用户仍无法在一个项目视图里治理全量历史，批量治理体验割裂 | 不采用 |
| C | 定义 project-scoped session catalog，main workspace 聚合 main + worktrees，并修正 cross-source roots 与 mutation 路由 | 行为语义与产品文案重新对齐，可一次性修复漏读与操作不准 | 需要更新后端聚合、前端 entry model 和测试 | **采用** |

## Capabilities

### Modified Capabilities

- `workspace-session-management`
- `codex-cross-source-history-unification`

### Capability Focus

- `workspace-session-management` 必须从 workspace-scoped 读取语义升级为 project-scoped management contract。
- `codex-cross-source-history-unification` 必须覆盖 project session catalog 场景，不得在 session management 中退化为单 source / 单 root 读取。

## 验收标准

- 当用户在 `Session Management` 中选择 main workspace 时：
  - 系统必须聚合 main workspace 与其 child worktrees 的真实会话历史。
  - 结果不得只包含 main workspace 自己的会话。
- 当项目下存在 main + 2 个 worktrees，且真实会话分别分布在三者中时：
  - 项目聚合视图必须返回三者合并后的结果。
  - 结果排序必须保持稳定 recency order。
- 当 Codex 历史同时分布在 workspace override roots 与默认 `~/.codex` roots 时：
  - 项目会话目录必须统一读取并去重。
  - 切换 source/provider 不得让旧历史消失。
- 项目聚合视图中的每条 entry 必须携带真实归属 `workspaceId`，前端必须能够区分其来源 workspace/worktree。
- 在项目聚合视图执行批量 `archive / unarchive / delete` 时：
  - 系统必须按 entry owner workspace 精确路由。
  - 只更新成功项。
  - 失败项必须保留并可重试。
- 对某个 worktree 会话执行删除时：
  - 不得误删 main workspace 中同名或相邻时间的其它会话。
- 对某个项目聚合视图执行 archive 后：
  - `active / archived / all` 三种筛选结果必须与真实 archive metadata 一致。
  - 刷新后结果不得回跳或丢状态。
- 当项目会话目录部分 source 读取失败但其它 source 成功时：
  - 系统必须继续返回可用结果。
  - UI 必须仍可感知 partial source/degradation 信息，而不是直接展示不完整但无提示的列表。

## Impact

- Affected frontend:
  - `src/features/settings/components/settings-view/sections/SessionManagementSection.tsx`
  - `src/features/settings/components/settings-view/hooks/useWorkspaceSessionCatalog.ts`
  - `src/services/tauri/sessionManagement.ts`
- Affected backend:
  - `src-tauri/src/session_management.rs`
  - `src-tauri/src/local_usage.rs`
  - `src-tauri/src/local_usage/session_delete.rs`
  - 相关 session catalog metadata / identity routing
- Affected validation:
  - `session_management` Rust tests
  - `useWorkspaceSessionCatalog` / `SessionManagementSection` frontend tests
  - project-scope aggregation, cross-root unification, archive/delete routing regression coverage
