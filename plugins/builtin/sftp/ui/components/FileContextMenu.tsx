import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

export interface FileContextMenuAction {
  label: string;
  action: () => void;
  disabled?: boolean;
  separator?: boolean;
  icon?: ReactNode;
  shortcut?: string;
}

const iconClassName = "h-4 w-4";
export const fileContextIcons = {
  copy: <svg className={iconClassName} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/></svg>,
  cut: <svg className={iconClassName} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="m8 8 12 12M8 16 20 4"/></svg>,
  paste: <svg className={iconClassName} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5h6v3H9z"/></svg>,
  rename: <svg className={iconClassName} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14 5 5 5M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z"/></svg>,
  delete: <svg className={iconClassName} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3"/></svg>,
  path: <svg className={iconClassName} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.1 0l2-2A5 5 0 0 0 12 3.9l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1"/></svg>,
  transfer: <svg className={iconClassName} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 7h13m0 0-4-4m4 4-4 4M17 17H4m0 0 4 4m-4-4 4-4"/></svg>,
};

export interface FileContextMenuProps {
  x: number;
  y: number;
  actions: FileContextMenuAction[];
  onClose: () => void;
}

export function FileContextMenu({
  x,
  y,
  actions,
  onClose
}: FileContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y, ready: false });

  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) {
      return;
    }

    const margin = 8;
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = x;
    let top = y;

    if (left + rect.width + margin > viewportWidth) {
      left = Math.max(margin, viewportWidth - rect.width - margin);
    }
    if (left < margin) {
      left = margin;
    }

    if (top + rect.height + margin > viewportHeight) {
      const aboveTop = y - rect.height;
      top = aboveTop >= margin ? aboveTop : Math.max(margin, viewportHeight - rect.height - margin);
    }
    if (top < margin) {
      top = margin;
    }

    setPosition({ left, top, ready: true });
  }, [actions, x, y]);

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  if (actions.length === 0) {
    return null;
  }

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="fixed z-[9999] min-w-60 overflow-hidden rounded-md border border-border bg-base-800/95 py-1 shadow-xl shadow-black/30 backdrop-blur"
      style={{
        left: position.left,
        top: position.top,
        visibility: position.ready ? "visible" : "hidden"
      }}
    >
      {actions.map((item, index) =>
        item.separator ? (
          <div key={`separator-${index}`} className="my-1 border-t border-border/70" />
        ) : (
          <button
            key={`${item.label}-${index}`}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) {
                return;
              }

              item.action();
              onClose();
            }}
            className="flex w-full min-h-8 items-center gap-2 px-2.5 py-1.5 text-left text-xs text-text-primary transition-colors hover:bg-base-700/80 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center text-text-secondary">{item.icon}</span>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.shortcut && <kbd className="ml-auto min-w-16 shrink-0 text-right font-mono text-[10px] text-text-muted">{item.shortcut.toUpperCase()}</kbd>}
          </button>
        )
      )}
    </div>,
    document.body
  );
}
