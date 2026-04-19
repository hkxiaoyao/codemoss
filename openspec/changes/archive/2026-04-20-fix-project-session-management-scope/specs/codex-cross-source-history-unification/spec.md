## MODIFIED Requirements

### Requirement: Codex Thread History MUST Be Unified Across Sources Per Workspace

For the same effective session-management scope, Codex history list MUST aggregate entries across available sources/providers and present them in one default view.

#### Scenario: aggregate codex history for main workspace project scope

- **WHEN** session management requests Codex history for a main workspace
- **THEN** the system MUST aggregate local Codex session summaries for that main workspace and its child worktrees
- **AND** the system MUST return a single unified list instead of per-workspace sublists

#### Scenario: aggregate codex history for worktree-only scope

- **WHEN** session management requests Codex history for a worktree
- **THEN** the system MUST aggregate only that worktree's Codex history
- **AND** it MUST NOT implicitly merge sibling worktrees or the parent main workspace

#### Scenario: source switch does not hide old history by default

- **WHEN** user has history generated under source A and source B, and current active source is B
- **THEN** entries from source A MUST remain visible in the unified catalog
- **AND** user MUST NOT need app restart or source rollback to view source A history entries

#### Scenario: session catalog query pages unified history with stable cursor

- **WHEN** session management reads Codex history for an effective scope
- **THEN** the unified history capability MUST support cursor-based continuation over the aggregated result set
- **AND** repeated reads with identical inputs MUST preserve deterministic ordering across pages

### Requirement: Unified History MUST Degrade Gracefully

Failure in one source path MUST NOT collapse the entire Codex history list response.

#### Scenario: one codex root fails but other roots still return entries

- **WHEN** one Codex local history root fails to scan
- **AND** other roots for the same effective scope still succeed
- **THEN** the system MUST continue returning entries from successful roots
- **AND** response MUST indicate fallback or partial-source condition for diagnostics

#### Scenario: local scan fails for one owner workspace but others succeed

- **WHEN** project-scoped Codex history spans main workspace and worktrees
- **AND** local scan fails for one owner workspace but succeeds for others
- **THEN** the system MUST still return entries discovered from successful owner workspaces
- **AND** the failure MUST NOT collapse the whole project-scoped history response

## ADDED Requirements

### Requirement: Session Management Codex Catalog MUST Scan Default And Override Roots Together

When session management reads Codex history, it MUST combine workspace-specific override roots and default Codex roots so history is not silently hidden by home/source drift.

#### Scenario: default and override roots are scanned together

- **WHEN** a workspace has an explicit Codex home override and the user opens session management
- **THEN** the system MUST scan both the workspace override roots and the default Codex roots
- **AND** the system MUST deduplicate repeated session identities before returning results

#### Scenario: default-root history remains visible after workspace override is configured

- **WHEN** older Codex sessions for the same workspace still live under default `~/.codex`
- **AND** newer sessions are written under a workspace override root
- **THEN** session management MUST continue showing both sets of history in one unified catalog
- **AND** users MUST NOT need to manually switch source or codex-home configuration to see the older sessions

### Requirement: Unified Codex Session Catalog MUST Preserve Owner Workspace Identity In Project Scope

Project-scoped Codex history entries MUST preserve the workspace that actually owns the session so downstream archive/delete routing can stay correct.

#### Scenario: unified codex entry carries owner workspace id

- **WHEN** a Codex entry is returned in a project-scoped session management catalog
- **THEN** the payload MUST carry the owner workspace id for that session
- **AND** downstream mutation flow MUST be able to route archive or delete to that owner workspace without guessing
