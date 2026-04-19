import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  archiveWorkspaceSessions,
  deleteWorkspaceSessions,
  listWorkspaceSessions,
  unarchiveWorkspaceSessions,
  type WorkspaceSessionBatchMutationResponse,
  type WorkspaceSessionCatalogEntry,
  type WorkspaceSessionCatalogQuery,
} from "../../../../../services/tauri";

export type WorkspaceSessionCatalogStatus = "active" | "archived" | "all";

export type WorkspaceSessionCatalogFilters = {
  keyword: string;
  engine: string;
  status: WorkspaceSessionCatalogStatus;
};

type MutationKind = "archive" | "unarchive" | "delete";

export type WorkspaceSessionCatalogMutationResult = {
  selectionKey: string;
  sessionId: string;
  workspaceId: string;
  ok: boolean;
  archivedAt?: number | null;
  error?: string | null;
  code?: string | null;
};

export type WorkspaceSessionCatalogMutationResponse = {
  results: WorkspaceSessionCatalogMutationResult[];
};

type UseWorkspaceSessionCatalogOptions = {
  workspaceId: string | null;
  filters: WorkspaceSessionCatalogFilters;
};

const SESSION_CATALOG_PAGE_SIZE = 100;

export function buildWorkspaceSessionSelectionKey(
  entry: Pick<WorkspaceSessionCatalogEntry, "workspaceId" | "sessionId">,
): string {
  return `${entry.workspaceId}::${entry.sessionId}`;
}

function toSelectionKeySet(selectionKeys: string[]): Set<string> {
  return new Set(selectionKeys);
}

function toWorkspaceMutationFailure(
  entry: WorkspaceSessionCatalogEntry,
  error: unknown,
): WorkspaceSessionCatalogMutationResult {
  return {
    selectionKey: buildWorkspaceSessionSelectionKey(entry),
    sessionId: entry.sessionId,
    workspaceId: entry.workspaceId,
    ok: false,
    archivedAt: null,
    error: normalizeErrorMessage(error),
    code: "MUTATION_REQUEST_FAILED",
  };
}

function normalizeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toQuery(filters: WorkspaceSessionCatalogFilters): WorkspaceSessionCatalogQuery {
  return {
    keyword: filters.keyword.trim() || null,
    engine: filters.engine.trim() || null,
    status: filters.status,
  };
}

function patchArchivedState(
  current: WorkspaceSessionCatalogEntry[],
  results: WorkspaceSessionCatalogMutationResponse["results"],
): WorkspaceSessionCatalogEntry[] {
  if (results.length === 0) {
    return current;
  }
  const archivedAtBySelectionKey = new Map(
    results
      .filter((item) => item.ok)
      .map((item) => [item.selectionKey, item.archivedAt ?? null] as const),
  );
  return current.map((entry) =>
    archivedAtBySelectionKey.has(buildWorkspaceSessionSelectionKey(entry))
      ? {
          ...entry,
          archivedAt:
            archivedAtBySelectionKey.get(buildWorkspaceSessionSelectionKey(entry)) ?? null,
        }
      : entry,
  );
}

export function useWorkspaceSessionCatalog({
  workspaceId,
  filters,
}: UseWorkspaceSessionCatalogOptions) {
  const [entries, setEntries] = useState<WorkspaceSessionCatalogEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [partialSource, setPartialSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const requestSeqRef = useRef(0);

  const query = useMemo(() => toQuery(filters), [filters]);

  const loadPage = useCallback(
    async (mode: "replace" | "append", cursor?: string | null) => {
      const requestId = requestSeqRef.current + 1;
      requestSeqRef.current = requestId;
      if (!workspaceId) {
        setEntries([]);
        setNextCursor(null);
        setPartialSource(null);
        setError(null);
        setIsLoading(false);
        setIsLoadingMore(false);
        return;
      }

      if (mode === "append") {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
        setError(null);
      }

      try {
        const response = await listWorkspaceSessions(workspaceId, {
          query,
          cursor: cursor ?? null,
          limit: SESSION_CATALOG_PAGE_SIZE,
        });
        if (requestSeqRef.current !== requestId) {
          return;
        }
        setEntries((current) =>
          mode === "append" ? [...current, ...response.data] : response.data,
        );
        setNextCursor(response.nextCursor ?? null);
        setPartialSource(response.partialSource ?? null);
        setError(null);
      } catch (incomingError) {
        if (requestSeqRef.current !== requestId) {
          return;
        }
        const message = normalizeErrorMessage(incomingError);
        if (mode !== "append") {
          setEntries([]);
          setNextCursor(null);
          setPartialSource(null);
        }
        setError(message);
      } finally {
        if (requestSeqRef.current === requestId) {
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    [query, workspaceId],
  );

  useEffect(() => {
    void loadPage("replace", null);
  }, [loadPage]);

  const reload = useCallback(async () => {
    await loadPage("replace", null);
  }, [loadPage]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) {
      return;
    }
    await loadPage("append", nextCursor);
  }, [isLoadingMore, loadPage, nextCursor]);

  const mutate = useCallback(
    async (
      kind: MutationKind,
      selectedEntries: WorkspaceSessionCatalogEntry[],
    ): Promise<WorkspaceSessionCatalogMutationResponse> => {
      if (!workspaceId) {
        throw new Error("workspace_id is required");
      }
      if (selectedEntries.length === 0) {
        return { results: [] };
      }

      setIsMutating(true);
      try {
        const entriesByWorkspaceId = new Map<string, WorkspaceSessionCatalogEntry[]>();
        selectedEntries.forEach((entry) => {
          const bucket = entriesByWorkspaceId.get(entry.workspaceId) ?? [];
          bucket.push(entry);
          entriesByWorkspaceId.set(entry.workspaceId, bucket);
        });

        const mutationResults: WorkspaceSessionCatalogMutationResult[] = [];
        for (const [entryWorkspaceId, entryBucket] of entriesByWorkspaceId) {
          const sessionIds = entryBucket.map((entry) => entry.sessionId);
          const selectionKeyBySessionId = new Map(
            entryBucket.map((entry) => [entry.sessionId, buildWorkspaceSessionSelectionKey(entry)]),
          );
          try {
            let response: WorkspaceSessionBatchMutationResponse;
            if (kind === "archive") {
              response = await archiveWorkspaceSessions(entryWorkspaceId, sessionIds);
            } else if (kind === "unarchive") {
              response = await unarchiveWorkspaceSessions(entryWorkspaceId, sessionIds);
            } else {
              response = await deleteWorkspaceSessions(entryWorkspaceId, sessionIds);
            }

            const respondedSessionIds = new Set<string>();
            response.results.forEach((item) => {
              respondedSessionIds.add(item.sessionId);
              mutationResults.push({
                selectionKey:
                  selectionKeyBySessionId.get(item.sessionId) ??
                  `${entryWorkspaceId}::${item.sessionId}`,
                sessionId: item.sessionId,
                workspaceId: entryWorkspaceId,
                ok: item.ok,
                archivedAt: item.archivedAt,
                error: item.error,
                code: item.code,
              });
            });

            entryBucket.forEach((entry) => {
              if (respondedSessionIds.has(entry.sessionId)) {
                return;
              }
              mutationResults.push({
                selectionKey: buildWorkspaceSessionSelectionKey(entry),
                sessionId: entry.sessionId,
                workspaceId: entry.workspaceId,
                ok: false,
                archivedAt: null,
                error: "Missing session mutation result",
                code: "MISSING_MUTATION_RESULT",
              });
            });
          } catch (error) {
            entryBucket.forEach((entry) => {
              mutationResults.push(toWorkspaceMutationFailure(entry, error));
            });
          }
        }

        const succeededSelectionKeys = mutationResults
          .filter((item) => item.ok)
          .map((item) => item.selectionKey);
        if (succeededSelectionKeys.length > 0) {
          const succeededSelectionKeySet = toSelectionKeySet(succeededSelectionKeys);
          setEntries((current) => {
            if (kind === "delete") {
              return current.filter(
                (entry) =>
                  !succeededSelectionKeySet.has(buildWorkspaceSessionSelectionKey(entry)),
              );
            }
            if (filters.status === "all") {
              return patchArchivedState(current, mutationResults);
            }
            return current.filter(
              (entry) =>
                !succeededSelectionKeySet.has(buildWorkspaceSessionSelectionKey(entry)),
            );
          });
        }
        return { results: mutationResults };
      } finally {
        setIsMutating(false);
      }
    },
    [filters.status, workspaceId],
  );

  return {
    entries,
    nextCursor,
    partialSource,
    error,
    isLoading,
    isLoadingMore,
    isMutating,
    reload,
    loadMore,
    mutate,
  };
}
