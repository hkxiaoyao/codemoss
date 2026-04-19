## 1. Scope Resolution

- [x] 1.1 [P0][Input: current `session_management.rs` workspace lookup][Output: effective project scope resolver for main/worktree selection][Verify: Rust test covers main -> main+children and worktree -> self only] 在后端补 `selectedWorkspaceId -> effective scope workspaces` 解析逻辑。
- [x] 1.2 [P0][Depends: 1.1][Input: current catalog entry model][Output: owner-aware catalog entries carrying real `workspaceId`][Verify: Rust test asserts aggregated entries expose correct owner workspace ids] 调整 session catalog entry 组装链路，保证聚合结果保留真实 owner workspace。

## 2. Codex History Unification

- [x] 2.1 [P0][Input: `local_usage::resolve_sessions_roots` / Codex home resolution][Output: owner roots + default roots union strategy][Verify: Rust test covers override roots plus default `~/.codex` roots in one query] 修正项目会话目录中的 Codex roots 解析。
- [x] 2.2 [P0][Depends: 2.1][Input: current Codex summary scan + dedupe logic][Output: deterministic dedupe across default/override roots][Verify: Rust test proves same logical session appears once after mixed-root scan] 补齐 Codex mixed-root 去重与稳定排序。
- [x] 2.3 [P1][Depends: 1.1,2.1][Input: aggregated project scope with partial scan failures][Output: partial-source degradation survives successful owner workspaces][Verify: Rust test asserts failure in one owner/root does not collapse the whole response] 补 scope-aware partial source/degradation 处理。

## 3. Mutation Routing

- [x] 3.1 [P0][Input: current frontend batch mutation path][Output: selection grouped by owner workspace before IPC][Verify: frontend hook/component test asserts archive/delete split requests by entry owner workspace] 将前端批量 mutation 改为按 entry owner workspace 分桶。
- [x] 3.2 [P0][Depends: 3.1][Input: current archive/unarchive/delete result handling][Output: merged mutation result preserving partial failures and retry selection][Verify: frontend test covers mixed success/failure across multiple workspace buckets] 保持聚合视图下的统一结果提示与失败项重试语义。
- [x] 3.3 [P0][Depends: 1.2,3.1][Input: delete path for worktree-owned entries][Output: precise delete routing without sibling/main collateral damage][Verify: Rust + frontend regression cover deleting worktree entry from main project view] 补 worktree 会话删除精确路由回归。

## 4. UI Explainability

- [x] 4.1 [P1][Input: current `SessionManagementSection` list item layout][Output: visible workspace/worktree ownership label on aggregated entries][Verify: component test asserts project view renders owner workspace label] 在列表项渲染 owner workspace/worktree 来源。
- [x] 4.2 [P1][Depends: 4.1][Input: current source label rendering][Output: source/provider + workspace ownership coexist without ambiguity][Verify: component test covers entry showing both owner workspace and sourceLabel] 提升聚合视图的来源可解释性。

## 5. Verification

- [x] 5.1 [P0][Input: updated Rust session management and local usage tests][Output: passing targeted Rust regression suite][Verify: `cargo test --manifest-path src-tauri/Cargo.toml session_management local_usage`] 跑后端聚合范围、mixed-root、delete 路由测试。
- [x] 5.2 [P0][Input: updated frontend hook/component tests][Output: passing session management frontend regressions][Verify: `npm run test -- SessionManagementSection useWorkspaceSessionCatalog`] 跑前端聚合视图与 mutation 分桶测试。
- [x] 5.3 [P1][Input: integrated app behavior][Output: manual proof that mossx main view covers main + worktrees and operations stay precise][Verify: main workspace project view sees full set and archive/delete only affect selected entries] 完成一次真实项目手测并记录结果。
