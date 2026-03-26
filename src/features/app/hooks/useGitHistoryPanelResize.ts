import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { getClientStoreSync, writeClientStoreValue } from "../../../services/clientStorage";
import {
  GIT_HISTORY_PANEL_CLOSE_THRESHOLD,
  GIT_HISTORY_PANEL_MAX_SNAP_THRESHOLD,
  clampGitHistoryPanelHeight,
  getDefaultGitHistoryPanelHeight,
  getGitHistoryPanelResizeBounds,
} from "../../../app-shell-parts/utils";

type UseGitHistoryPanelResizeOptions = {
  appRootRef: RefObject<HTMLDivElement | null>;
  onClosePanel: () => void;
};

export function useGitHistoryPanelResize({
  appRootRef,
  onClosePanel,
}: UseGitHistoryPanelResizeOptions) {
  const [gitHistoryPanelHeight, setGitHistoryPanelHeight] = useState(() => {
    const stored = getClientStoreSync<number>("layout", "gitHistoryPanelHeight");
    if (typeof stored === "number" && Number.isFinite(stored)) {
      return clampGitHistoryPanelHeight(stored);
    }
    return getDefaultGitHistoryPanelHeight();
  });
  const gitHistoryPanelHeightRef = useRef(gitHistoryPanelHeight);

  useEffect(() => {
    gitHistoryPanelHeightRef.current = gitHistoryPanelHeight;
  }, [gitHistoryPanelHeight]);

  useEffect(() => {
    writeClientStoreValue("layout", "gitHistoryPanelHeight", gitHistoryPanelHeight);
  }, [gitHistoryPanelHeight]);

  useEffect(() => {
    const handleResize = () => {
      setGitHistoryPanelHeight((current) => clampGitHistoryPanelHeight(current));
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const onGitHistoryPanelResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const pointerId = event.pointerId;
      const startY = event.clientY;
      const startHeight = gitHistoryPanelHeightRef.current;
      const { maxHeight, minHeight, viewportHeight } = getGitHistoryPanelResizeBounds();
      const dragHandle = event.currentTarget;
      const appRoot = appRootRef.current;
      let latestRawHeight = startHeight;
      let latestClampedHeight = clampGitHistoryPanelHeight(startHeight, viewportHeight);
      let animationFrameId: number | null = null;

      const flushDraggedHeight = () => {
        animationFrameId = null;
        if (appRoot) {
          appRoot.style.setProperty(
            "--git-history-panel-height",
            `${latestClampedHeight}px`,
          );
        }
      };

      const scheduleDraggedHeightFlush = () => {
        if (animationFrameId !== null) {
          return;
        }
        animationFrameId = window.requestAnimationFrame(flushDraggedHeight);
      };

      dragHandle.setPointerCapture(pointerId);
      document.body.dataset.gitHistoryResizing = "true";

      const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) {
          return;
        }
        const delta = moveEvent.clientY - startY;
        const nextHeight = startHeight - delta;
        latestRawHeight = nextHeight;
        latestClampedHeight = clampGitHistoryPanelHeight(nextHeight, viewportHeight);
        scheduleDraggedHeightFlush();
      };

      const handlePointerUp = (upEvent: globalThis.PointerEvent) => {
        if (upEvent.pointerId !== pointerId) {
          return;
        }
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", handlePointerUp);
        if (dragHandle.hasPointerCapture(pointerId)) {
          dragHandle.releasePointerCapture(pointerId);
        }
        if (animationFrameId !== null) {
          window.cancelAnimationFrame(animationFrameId);
          flushDraggedHeight();
        }
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.body.style.webkitUserSelect = "";
        delete document.body.dataset.gitHistoryResizing;

        if (latestRawHeight <= minHeight - GIT_HISTORY_PANEL_CLOSE_THRESHOLD) {
          onClosePanel();
          return;
        }

        if (latestRawHeight >= maxHeight - GIT_HISTORY_PANEL_MAX_SNAP_THRESHOLD) {
          setGitHistoryPanelHeight(maxHeight);
          return;
        }

        setGitHistoryPanelHeight(latestClampedHeight);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handlePointerUp);
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
      document.body.style.webkitUserSelect = "none";
    },
    [appRootRef, onClosePanel],
  );

  return {
    gitHistoryPanelHeight,
    gitHistoryPanelHeightRef,
    onGitHistoryPanelResizeStart,
    setGitHistoryPanelHeight,
  };
}
