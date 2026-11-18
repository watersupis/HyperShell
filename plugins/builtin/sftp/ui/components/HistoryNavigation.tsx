import { useStore } from "zustand";
import type { StoreApi } from "zustand";

import type { SftpPane, SftpStoreState } from "../sftpStore";
import { useSftpI18n } from "../hostServices";

export function HistoryNavigation({
  store,
  pane
}: {
  store: StoreApi<SftpStoreState>;
  pane: SftpPane;
}) {
  const { t } = useSftpI18n();
  const canGoBack = useStore(store, (state) =>
    pane === "local" ? state.localHistoryIndex > 0 : state.remoteHistoryIndex > 0
  );
  const canGoForward = useStore(store, (state) =>
    pane === "local"
      ? state.localHistoryIndex < state.localHistory.length - 1
      : state.remoteHistoryIndex < state.remoteHistory.length - 1
  );
  const back = useStore(store, (state) => state.back);
  const forward = useStore(store, (state) => state.forward);

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        aria-label={t("Back")}
        title={t("Back")}
        disabled={!canGoBack}
        onClick={() => back(pane)}
        className="rounded p-0.5 text-text-secondary hover:bg-base-700 hover:text-text-primary disabled:cursor-default disabled:opacity-35"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>
      <button
        type="button"
        aria-label={t("Forward")}
        title={t("Forward")}
        disabled={!canGoForward}
        onClick={() => forward(pane)}
        className="rounded p-0.5 text-text-secondary hover:bg-base-700 hover:text-text-primary disabled:cursor-default disabled:opacity-35"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>
    </div>
  );
}
