## Context

当前 `Session Management` 已经具备独立设置页、分页、筛选和批量操作，但其核心数据 contract 仍停留在 `workspace-scoped session catalog`：

- `list_workspace_sessions_core(...)` 只根据当前 `workspaceId` 解析一个 `workspacePath`，随后按该路径读取 Codex / Claude / Gemini / OpenCode 历史。
- Codex 本地历史进一步依赖 `local_usage::list_codex_session_summaries_for_workspace(...)`，该函数在传入具体 workspace path 时，会把 roots 解析收窄到该 workspace 对应的 `codexHome`，不会再补扫默认 `~/.codex` roots。
- `archive_workspace_sessions_core(...)` / `unarchive_workspace_sessions_core(...)` / `delete_workspace_sessions_core(...)` 同样假设本次批量操作中的所有 `sessionId` 都属于当前传入的 `workspaceId`。

这套实现对“单 workspace 自治”是成立的，但与当前产品文案“按项目统一管理真实会话历史”已经不一致。实际排查也证明了这一点：`mossx` main workspace 与两个 child worktrees 分别持有独立会话历史，当前 UI 只能看见 main 自己的 5 条，无法在同一个项目视图内治理全部 9 条真实会话。

约束与背景：

- 这是典型 cross-layer 变更，涉及 frontend picker/list model、Tauri IPC payload、Rust 聚合逻辑和本地历史扫描边界。
- 现有 archive metadata 已按 `workspaceId -> archivedAtBySessionId` 存储；新设计必须兼容这一路径，但要解决聚合视图下 entry ownership 的语义缺失。
- 现有 worktree 模型已存在 `parentId` 关联，可用于定义 project scope。
- 现有 `workspace-session-management` 与 `codex-cross-source-history-unification` 两份主 spec 已覆盖一部分需求，本次设计应尽量做“语义升级”，而不是引入第三套平行 contract。

## Goals / Non-Goals

**Goals:**

- 把项目会话管理的读取语义明确为 `project-scoped catalog`，且与当前 workspace/worktree 数据模型兼容。
- main workspace 选中时聚合 main + child worktrees；worktree 选中时保留 worktree-only 视图。
- Codex 历史读取在项目会话目录中统一覆盖 workspace override roots 和默认 roots，避免 source/root 漏读。
- 为聚合结果补充真实 `ownerWorkspaceId`，让批量 mutation 能精确路由到正确的 workspace scope。
- 保持当前分页、筛选、部分失败处理和 archive metadata 机制，不引入新的存储系统。

**Non-Goals:**

- 不改造 sidebar/thread list 的默认会话展示 contract。
- 不引入新的数据库或全局索引，只在现有文件扫描与内存聚合模型上修复语义。
- 不把 shared session 纳入本轮批量 archive/delete 支持。
- 不在本轮彻底重做设置页 UI，只补足必要的来源展示字段。

## Decisions

### Decision 1: 以“选中 workspace 的 project scope”作为项目会话目录边界

定义新的 catalog 视图规则：

- 若用户选中的是 main workspace，则 project scope = `main workspace + 所有 parentId 指向该 main 的 child worktrees`。
- 若用户选中的是 worktree，则 scope 仅为该 worktree 自己。

采用这个规则的原因：

- 它与用户对“项目”的直觉一致：选择主项目时就该看见整个项目树的真实会话历史。
- 它不需要新增 picker 类型或二次切换模型，能最大限度复用当前前端交互。
- 它避免把所有同名仓库或 unrelated workspace 粗暴合并到一起，聚合边界仍然清晰可推导。

备选方案对比：

- 只保留单 workspace 语义然后靠文案解释：会继续制造“明明是项目页却漏 worktree”的认知错位。
- 新增一个单独的“项目范围 / 当前 workspace”开关：可做，但不是解决核心问题的必要条件，会把本轮 focus 转成 UI 设计。

### Decision 2: 引入 owner-aware catalog entry，而不是继续假设“当前列表全属于当前 workspace”

`WorkspaceSessionCatalogEntry` 需要补足 entry 真实归属信息：

- 保留现有 `workspaceId` 作为“ownerWorkspaceId / entry 来源 workspace”语义。
- 聚合请求中的 `selectedWorkspaceId` 只作为查询 scope 输入，不再等同于每条结果的 owner。

前端/后端都要遵守这个 contract：

- 前端 selection state 仍按 `sessionId` 跟踪，但 mutation 请求前必须按 entry 的 `workspaceId` 分桶。
- 后端 batch response 仍保持扁平 results，避免前端额外处理嵌套结构。

这样做的原因：

- 聚合视图里，同一个结果页天然会混入 main/worktree 多个 owner workspace。
- 如果不把 owner 放回 entry payload，delete/archive 在聚合视图下只能继续错用当前 picker 的 workspaceId，风险太高。

### Decision 3: 后端采用“两阶段聚合”而不是重新设计全局目录索引

项目会话目录读取分成两个阶段：

1. 先解析 scope workspaces
   - 根据 `selectedWorkspaceId` 找到当前 workspace
   - 若是 main，则一并收集其 child worktrees
   - 产出 `Vec<WorkspaceEntry>` 作为 scope
2. 再对每个 scope workspace 聚合各引擎历史
   - 逐个 workspace 读取 Claude / Gemini / OpenCode / Codex 本地历史
   - 为每条结果写入 owner workspace metadata
   - 最后统一做 dedupe / filter / stable sort / pagination

原因：

- 复用现有按 workspace 读取各引擎历史的能力，避免一次性重构所有引擎 adapter。
- 统一分页必须发生在“全量聚合后”的结果集上，否则 cursor 会不稳定。
- 可以沿用现有 `partial_source` 语义，只需把它升级为 scope-aware 聚合的 degradation 汇总。

### Decision 4: Codex roots 在项目会话目录中采用“owner roots + default roots”的并集策略

对 Codex 本地历史读取，单个 owner workspace 的 roots 解析改为：

- 先取该 owner workspace 解析出的 override roots（若存在）
- 再补上默认 `resolve_default_codex_home()` 派生的 roots
- roots 去重后统一扫描 `sessions/` 与 `archived_sessions/`

原因：

- 当前 `resolve_sessions_roots(..., Some(workspace_path))` 语义过窄，只适合“某 workspace 明确隔离自己的 codex home”这种强假设。
- 实际用户场景里，同一项目历史可能混在默认 `~/.codex` 与 workspace override roots 中；项目会话目录不应该猜哪一个才是“真源”。
- 采用并集策略可以保住历史可见性，再通过 workspace metadata / session id 去重消除重复。

风险控制：

- roots 变多会增加扫描量，但本次只发生在 session management 目录查询，且已有分页与 timeout 防护。
- 去重规则必须保持 deterministic，避免相同 session 同时命中两个 roots 时重复出现在目录中。

### Decision 5: 聚合视图下的 batch mutation 采用“前端分桶 + 后端原子执行单 workspace”模型

mutation 方案：

- 前端拿到 selected entries 后，按 `entry.workspaceId` 分桶。
- 对每个 workspace bucket 调用一次现有 Tauri command。
- 前端把多个 bucket 的结果合并成一个 `WorkspaceSessionBatchMutationResponse` 风格对象供 UI 消费。

不直接把“跨 workspace 批量 mutation”收口成一个新后端 command，原因是：

- 现有 command contract 已稳定，按 workspace 执行 archive/delete 的下层逻辑也都依赖 workspacePath 解析。
- 本轮首要目标是修正语义，而不是重新定义 IPC 体系。
- 前端分桶后，失败范围更清晰，便于保留失败项并支持重试。

实现约束：

- 前端聚合结果必须仍按原 selection 顺序映射回统一提示，不得因为分桶导致反馈顺序随机化。
- 同一个 sessionId 若理论上跨 workspace 冲突，前端 key 需要以 entry payload 为准，不能靠当前 picker 的 workspaceId 推断。

### Decision 6: archive metadata 继续以 owner workspace 为隔离边界

`session-management/workspaces/<workspaceId>.json` 的 archive metadata 不改存储形态，但语义明确为：

- metadata 只记录 owner workspace 下的会话 archive 状态。
- main project 聚合视图读取时，需要对 scope 中每个 owner workspace 单独读取 metadata，然后在 entry 拼装时按 owner 应用。

原因：

- 这与当前 delete/unarchive 的物理语义一致，不需要迁移现有 metadata。
- archive 是“会话实体状态”，应跟着真实 owner 走，而不是跟着当前浏览视图走。

### Decision 7: 前端必须把“项目聚合视图”解释出来，而不是只增加数据不增加可见性

前端最少要补三点：

- 结果项显示所属 workspace/worktree 名称。
- 结果项继续显示 `sourceLabel`，帮助用户理解跨 source 历史为何同时出现。
- 顶部 workspace picker 的 main workspace 选中态默认解释为“项目范围”，避免用户误以为只看 main 自己。

原因：

- 这次问题的核心不是“没有数据”，而是“用户无法知道系统到底按什么范围在查”。
- 如果只修后端，不补来源可见性，用户仍然很难信任归档/删除是不是落到了正确的目标。

## Risks / Trade-offs

- [Risk] roots 并集后，Codex 本地历史扫描成本上升  
  → Mitigation：仅在 session management 目录场景启用；保留 timeout、防抖刷新和 deterministic dedupe。

- [Risk] 前端分桶 mutation 让一次“批量操作”变成多次 IPC，局部成功/失败更常见  
  → Mitigation：保持统一结果汇总；失败项继续保留选中并可重试；成功项立即从当前视图更新。

- [Risk] 同一个 session 同时出现在 default roots 与 override roots 时，可能重复计数  
  → Mitigation：统一使用现有 canonical session identity 规则，并在 owner-aware entry 拼装后再做 deterministic dedupe。

- [Risk] main workspace 聚合 worktrees 后，UI 的会话计数和旧测试基线会整体变化  
  → Mitigation：显式更新前端测试快照与文案断言，避免把“数量变多”误判成回归。

- [Risk] archive metadata 仍按 owner workspace 分散存储，调试时不如单文件直观  
  → Mitigation：这是刻意选择的低迁移成本方案；后续若需要统一索引，可在不破坏现有语义的前提下再演进。

## Migration Plan

1. 后端先落 scope 解析与 owner-aware catalog entry
   - 给 session catalog 读取链路增加 project scope 解析
   - 确保 main workspace 可聚合 child worktrees
2. 后端补 Codex roots 并集策略与相关 tests
   - 修正 `local_usage` roots 解析
   - 补充 default + override roots 共存场景测试
3. 前端接 owner-aware entry model
   - 在列表项展示 workspace/worktree 来源
   - mutation 改为按 owner workspace 分桶执行
4. 更新 spec-based regression coverage
   - Rust: 聚合范围、去重、archive metadata、delete 路由
   - Frontend: 列表展示、selection、partial failure、跨 workspace mutation
5. 手动验证与回滚
   - main workspace 聚合可见 main + worktrees 历史
   - 删除/归档只影响所选 entry

回滚策略：

- 若 project scope 聚合引入严重性能或错误路由问题，可临时回退到旧的 workspace-scoped 读取逻辑。
- 回滚时不需要迁移 metadata，因为本设计没有改 archive metadata 的物理结构。

## Open Questions

- 当前 main workspace 选中时是否需要在 UI 上显式文案标注“包含 worktrees”，还是靠列表项来源标签已足够？
- Claude / Gemini / OpenCode 的 owner-aware 聚合是否需要在后续继续补 sourceLabel 级别的可诊断信息，还是本轮只要求 Codex 明确即可？
