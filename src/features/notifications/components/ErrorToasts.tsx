import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ErrorToast } from "../../../services/toasts";

type ErrorToastsProps = {
  toasts: ErrorToast[];
  onDismiss: (id: string) => void;
};

export function ErrorToasts({ toasts, onDismiss }: ErrorToastsProps) {
  const { t } = useTranslation();
  const runningActionKeysRef = useRef(new Set<string>());
  const [runningActionKeys, setRunningActionKeys] = useState<Record<string, true>>(
    {},
  );
  const [actionErrorByToastInstanceKey, setActionErrorByToastInstanceKey] = useState<
    Record<string, string>
  >({});

  const getToastInstanceKey = useCallback(
    (toast: ErrorToast) => toast.instanceId ?? toast.id,
    [],
  );

  const normalizeActionError = useCallback((error: unknown) => {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === "string") {
      return error;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }, []);

  const handleActionClick = useCallback(
    async (toast: ErrorToast, actionIndex: number) => {
      const action = toast.actions?.[actionIndex];
      if (!action) {
        return;
      }
      const toastInstanceKey = getToastInstanceKey(toast);
      const actionKey = `${toastInstanceKey}:${actionIndex}`;
      if (runningActionKeysRef.current.has(actionKey)) {
        return;
      }
      runningActionKeysRef.current.add(actionKey);
      setRunningActionKeys((previous) => ({
        ...previous,
        [actionKey]: true,
      }));
      setActionErrorByToastInstanceKey((previous) => {
        const next = { ...previous };
        delete next[toastInstanceKey];
        return next;
      });
      try {
        await action.run();
        if (action.dismissOnSuccess ?? true) {
          onDismiss(toast.id);
        }
      } catch (error) {
        setActionErrorByToastInstanceKey((previous) => ({
          ...previous,
          [toastInstanceKey]: normalizeActionError(error),
        }));
      } finally {
        runningActionKeysRef.current.delete(actionKey);
        setRunningActionKeys((previous) => {
          const next = { ...previous };
          delete next[actionKey];
          return next;
        });
      }
    },
    [getToastInstanceKey, normalizeActionError, onDismiss],
  );

  useEffect(() => {
    const activeInstanceKeys = new Set(toasts.map((toast) => getToastInstanceKey(toast)));

    setActionErrorByToastInstanceKey((previous) => {
      let changed = false;
      const next: Record<string, string> = {};
      for (const [instanceKey, message] of Object.entries(previous)) {
        if (activeInstanceKeys.has(instanceKey)) {
          next[instanceKey] = message;
        } else {
          changed = true;
        }
      }
      return changed ? next : previous;
    });

    if (runningActionKeysRef.current.size === 0) {
      return;
    }

    const nextRunningKeys = new Set<string>();
    for (const actionKey of runningActionKeysRef.current) {
      const separatorIndex = actionKey.lastIndexOf(":");
      const instanceKey =
        separatorIndex >= 0 ? actionKey.slice(0, separatorIndex) : actionKey;
      if (activeInstanceKeys.has(instanceKey)) {
        nextRunningKeys.add(actionKey);
      }
    }

    if (nextRunningKeys.size === runningActionKeysRef.current.size) {
      return;
    }

    runningActionKeysRef.current = nextRunningKeys;
    setRunningActionKeys((previous) => {
      const next: Record<string, true> = {};
      for (const actionKey of Object.keys(previous)) {
        if (nextRunningKeys.has(actionKey)) {
          next[actionKey] = true;
        }
      }
      return next;
    });
  }, [getToastInstanceKey, toasts]);

  if (!toasts.length) {
    return null;
  }

  return (
    <div className="error-toasts" role="region" aria-live="assertive">
      {toasts.map((toast) => (
        <div
          key={getToastInstanceKey(toast)}
          className={`error-toast error-toast-${toast.variant ?? "error"}`}
          role={toast.variant === "error" || !toast.variant ? "alert" : "status"}
        >
          <div className="error-toast-header">
            <div className="error-toast-title">{toast.title}</div>
            <button
              type="button"
              className="ghost error-toast-dismiss"
              onClick={() => onDismiss(toast.id)}
              aria-label={t("errors.dismissError")}
              title={t("common.dismiss")}
            >
              ×
            </button>
          </div>
          <div className="error-toast-body">{toast.message}</div>
          {toast.actions?.length ? (
            <div className="error-toast-actions">
              {toast.actions.map((action, index) => {
                const actionKey = `${getToastInstanceKey(toast)}:${index}`;
                const isRunning = Boolean(runningActionKeys[actionKey]);
                return (
                  <button
                    key={actionKey}
                    type="button"
                    className={`error-toast-action${
                      action.variant === "secondary" ? "" : " is-primary"
                    }`}
                    onClick={() => {
                      void handleActionClick(toast, index);
                    }}
                    disabled={isRunning}
                  >
                    {isRunning ? (action.pendingLabel ?? action.label) : action.label}
                  </button>
                );
              })}
            </div>
          ) : null}
          {actionErrorByToastInstanceKey[getToastInstanceKey(toast)] ? (
            <div className="error-toast-action-error" aria-live="polite">
              {actionErrorByToastInstanceKey[getToastInstanceKey(toast)]}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
