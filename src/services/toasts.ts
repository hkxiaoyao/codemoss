export type ErrorToastVariant = "error" | "info" | "success";

export type ErrorToastAction = {
  label: string;
  pendingLabel?: string;
  run: () => Promise<void> | void;
  dismissOnSuccess?: boolean;
  variant?: "primary" | "secondary";
};

export type ErrorToast = {
  id: string;
  instanceId?: string;
  title: string;
  message: string;
  variant?: ErrorToastVariant;
  durationMs?: number | null;
  sticky?: boolean;
  actions?: ErrorToastAction[];
};

export type ErrorToastInput = Omit<ErrorToast, "id"> & {
  id?: string;
};

type ErrorToastListener = (toast: ErrorToast) => void;

const errorToastListeners = new Set<ErrorToastListener>();

function makeToastId() {
  return `error-toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function pushErrorToast(input: ErrorToastInput) {
  const toast: ErrorToast = {
    id: input.id ?? makeToastId(),
    instanceId: makeToastId(),
    title: input.title,
    message: input.message,
    variant: input.variant,
    durationMs: input.durationMs,
    sticky: input.sticky,
    actions: input.actions,
  };

  for (const listener of errorToastListeners) {
    try {
      listener(toast);
    } catch (error) {
      console.error("[toasts] error toast listener failed", error);
    }
  }

  return toast.id;
}
export function subscribeErrorToasts(listener: ErrorToastListener) {
  errorToastListeners.add(listener);
  return () => {
    errorToastListeners.delete(listener);
  };
}
