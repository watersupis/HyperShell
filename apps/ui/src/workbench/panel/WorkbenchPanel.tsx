import { useEffect, useState, type ReactNode } from "react";
import { useI18n } from "../shared/i18n";
import { useWorkbenchPanelStore } from "./panelStore";

export interface WorkbenchPanelView {
  id: string;
  title: string;
  content: ReactNode;
}

export function WorkbenchPanel({ views, loading = false }: { views: WorkbenchPanelView[]; loading?: boolean }) {
  const { t } = useI18n();
  const isOpen = useWorkbenchPanelStore((state) => state.isOpen);
  const activeViewId = useWorkbenchPanelStore((state) => state.activeViewId);
  const viewContexts = useWorkbenchPanelStore((state) => state.viewContexts);
  const height = useWorkbenchPanelStore((state) => state.height);
  const setHeight = useWorkbenchPanelStore((state) => state.setHeight);
  const activateView = useWorkbenchPanelStore((state) => state.activateView);
  const setActiveView = useWorkbenchPanelStore((state) => state.setActiveView);
  const close = useWorkbenchPanelStore((state) => state.close);
  const removeViewContext = useWorkbenchPanelStore((state) => state.removeViewContext);
  const [resizeStart, setResizeStart] = useState<{ pointerId: number; y: number; height: number } | null>(null);
  const activeView = views.find((view) => view.id === activeViewId);

  useEffect(() => {
    if (loading) return;
    if (views.length === 0) {
      Object.keys(viewContexts).forEach(removeViewContext);
      if (activeViewId !== null || isOpen) {
        setActiveView(null);
        close();
      }
      return;
    }
    const viewIds = new Set(views.map((view) => view.id));
    Object.keys(viewContexts).filter((id) => !viewIds.has(id)).forEach(removeViewContext);
    if (!views.some((view) => view.id === activeViewId)) {
      setActiveView(views[0].id);
    }
  }, [activeViewId, activateView, close, isOpen, loading, removeViewContext, setActiveView, viewContexts, views]);

  if (!isOpen) return null;

  return (
    <>
      {/* The separator handles Arrow keys and pointer resizing directly. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={t("Resize panel")}
        aria-valuemin={120}
        aria-valuemax={640}
        aria-valuenow={height}
        tabIndex={0}
        className="h-1 shrink-0 cursor-row-resize bg-transparent hover:bg-accent/50 focus:bg-accent/50"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setResizeStart({ pointerId: event.pointerId, y: event.clientY, height });
        }}
        onPointerMove={(event) => {
          if (resizeStart?.pointerId === event.pointerId) {
            setHeight(resizeStart.height + resizeStart.y - event.clientY);
          }
        }}
        onPointerUp={() => setResizeStart(null)}
        onPointerCancel={() => setResizeStart(null)}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp") setHeight(height + 24);
          if (event.key === "ArrowDown") setHeight(height - 24);
        }}
      />
      <section
        className="flex min-h-0 shrink-0 flex-col border-t border-border bg-base-800"
        style={{ height }}
        aria-label={t("Panel")}
      >
        <header className="flex h-9 min-h-9 shrink-0 items-stretch border-b border-border bg-base-800">
          <div className="flex min-w-0 flex-1 overflow-x-auto" role="tablist" aria-label={t("Panel views")}>
            {views.map((view) => (
              <button
                key={view.id}
                type="button"
                role="tab"
                id={`panel-tab-${view.id}`}
                aria-controls={`panel-view-${view.id}`}
                aria-selected={view.id === activeViewId}
                onClick={() => activateView(view.id)}
                className={`max-w-52 shrink-0 truncate border-r border-border px-3 text-xs ${view.id === activeViewId ? "border-b-2 border-b-accent bg-surface text-text-primary" : "text-text-muted hover:bg-base-700 hover:text-text-primary"}`}
              >
                {view.title}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={close}
            className="grid w-9 shrink-0 place-items-center text-text-muted hover:bg-base-700 hover:text-text-primary"
            title={t("Close panel")}
            aria-label={t("Close panel")}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          {activeView ? (
            <div id={`panel-view-${activeView.id}`} role="tabpanel" aria-labelledby={`panel-tab-${activeView.id}`} className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
              {activeView.content}
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center text-xs text-text-muted">{t(loading ? "Loading plugin" : "No panel views are available")}</div>
          )}
        </div>
      </section>
    </>
  );
}
