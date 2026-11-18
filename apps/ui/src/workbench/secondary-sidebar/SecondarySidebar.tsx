import { useState, type ReactNode } from "react";
import { useI18n } from "../shared/i18n";

export interface SecondarySidebarProps {
  open: boolean;
  title: string;
  width: number;
  onWidthChange: (width: number) => void;
  onClose: () => void;
  children: ReactNode;
}

export function SecondarySidebar({
  open,
  title,
  width,
  onWidthChange,
  onClose,
  children,
}: SecondarySidebarProps) {
  const { t } = useI18n();
  const [resizeStart, setResizeStart] = useState<{ pointerId: number; x: number; width: number } | null>(null);

  if (!open) return null;

  return (
    <>
      {/* The separator handles Arrow keys and pointer resizing directly. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t("Resize side panel")}
        tabIndex={0}
        className="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-accent/50 focus:bg-accent/50"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setResizeStart({ pointerId: event.pointerId, x: event.clientX, width });
        }}
        onPointerMove={(event) => {
          if (resizeStart?.pointerId === event.pointerId) {
            onWidthChange(resizeStart.width + resizeStart.x - event.clientX);
          }
        }}
        onPointerUp={() => setResizeStart(null)}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") onWidthChange(width + 24);
          if (event.key === "ArrowRight") onWidthChange(width - 24);
        }}
      />
      <aside className="flex h-full min-h-0 shrink-0 flex-col border-l border-border bg-base-800" style={{ width }}>
        <header className="flex h-11 shrink-0 items-center justify-between border-b border-border px-3">
          <span className="truncate text-sm font-medium text-text-primary">{t(title)}</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-text-muted hover:bg-base-700 hover:text-text-primary"
            aria-label={t("Close side panel")}
            title={t("Close side panel")}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        {children}
      </aside>
    </>
  );
}
