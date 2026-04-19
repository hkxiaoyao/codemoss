## MODIFIED Requirements

### Requirement: Session Management SHALL Read Workspace Session History With Real Pagination

系统 MUST 以 project-aware real session catalog 提供会话历史读取能力，并支持基于 cursor 或等效分页模型的真实分页。

#### Scenario: read first page from main workspace as project scope

- **WHEN** 用户选择某个 main workspace 并首次进入会话管理页
- **THEN** 系统 MUST 读取该 main workspace 与其 child worktrees 的真实会话目录第一页
- **AND** 结果 MUST 包含稳定会话标识、标题、引擎、更新时间、archive 状态与真实归属 `workspaceId`

#### Scenario: read first page from worktree as worktree-only scope

- **WHEN** 用户选择某个 worktree 并首次进入会话管理页
- **THEN** 系统 MUST 只读取该 worktree 自己的真实会话目录第一页
- **AND** 系统 MUST NOT 隐式并入其 parent main workspace 或 sibling worktrees 的会话

#### Scenario: subsequent page uses continuation cursor over aggregated result

- **WHEN** 用户继续加载下一页
- **THEN** 系统 MUST 基于上一页返回的 cursor 或等效 continuation token 读取聚合结果集的下一页
- **AND** 系统 MUST NOT 通过对当前已加载 UI 列表做本地切片伪装分页

#### Scenario: large project history remains queryable

- **GIVEN** 某 main workspace 与其 worktrees 拥有大量历史会话
- **WHEN** 用户按页读取项目级会话目录
- **THEN** 系统 MUST 保持稳定排序与可继续翻页
- **AND** 历史总量增大 MUST NOT 退化为一次性全量加载

### Requirement: Session Management SHALL Support Archive Unarchive And Delete

系统 MUST 支持对单条或多条会话执行 archive、unarchive 与 delete，并以 entry 真实归属 workspace 为路由依据处理部分失败与重试。

#### Scenario: archive selected sessions successfully in project scope

- **WHEN** 用户在项目聚合视图中对选中会话执行 archive 且后端成功
- **THEN** 系统 MUST 按每条会话的真实归属 `workspaceId` 执行 archive
- **AND** 这些会话 MUST 在当前结果集中切换为 archived 状态
- **AND** 若当前视图为 `active`，这些会话 MUST 从结果列表移除

#### Scenario: unarchive selected sessions successfully in project scope

- **WHEN** 用户在项目聚合视图中对 archived 会话执行 unarchive 且后端成功
- **THEN** 系统 MUST 按每条会话的真实归属 `workspaceId` 执行 unarchive
- **AND** 这些会话 MUST 恢复为 active 状态
- **AND** 若当前视图为 `archived`，这些会话 MUST 从结果列表移除

#### Scenario: delete selected worktree sessions does not affect sibling entries

- **WHEN** 用户在 main workspace 的项目聚合视图中删除某个 child worktree 的会话
- **THEN** 系统 MUST 只删除该会话真实归属 workspace 中的目标 entry
- **AND** 系统 MUST NOT 误删 main workspace 或其它 sibling worktree 中的会话

#### Scenario: batch operation partially fails across multiple owner workspaces

- **WHEN** 用户执行批量 archive、unarchive 或 delete
- **AND** 选中集合同时覆盖多个 owner workspaces
- **AND** 后端返回部分失败
- **THEN** 系统 MUST 仅更新成功项
- **AND** 失败项 MUST 保留在列表中并保持选中态以支持重试
- **AND** 系统 MUST 展示失败摘要与错误分类

#### Scenario: operation is non-reentrant while grouped mutation is in progress

- **WHEN** 系统已提交 archive、unarchive 或 delete 请求且尚未完成
- **THEN** 系统 MUST 禁用相关提交动作
- **AND** MUST 阻止重复提交同一批操作

## ADDED Requirements

### Requirement: Session Management Project View MUST Expose Entry Ownership

项目级会话管理视图 MUST 让用户区分每条会话的真实来源 workspace/worktree，避免聚合结果变成不可解释列表。

#### Scenario: project-scoped entry exposes owner workspace identity

- **WHEN** 某条会话出现在项目聚合视图中
- **THEN** entry payload MUST 包含真实归属 `workspaceId`
- **AND** 前端 MUST 能用该信息渲染所属 workspace 或 worktree 标识

#### Scenario: source-aware entry remains explainable in project view

- **WHEN** 某条聚合 entry 同时具备 source/provider 元数据
- **THEN** 前端 MUST 可以同时展示 owner workspace 信息与 source/provider 信息
- **AND** 用户 MUST 能理解该会话为何出现在当前项目视图中
