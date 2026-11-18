import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { LocalProfileRecord } from "@hypershell/shared";
import { LocalProfileIcon } from "./LocalProfileIcon";

interface NewTabMenuProps {
  profiles: LocalProfileRecord[];
  onSelect: (profile: LocalProfileRecord) => void;
  onClose: () => void;
  /** The button that opens this menu. Excluded from the outside-pointerdown
   * check, otherwise clicking the trigger again while the menu is open fires
   * pointerdown (closes it) followed by click (reopens it) — a broken toggle. */
  triggerRef: React.RefObject<HTMLElement | null>;
}

export function NewTabMenu({ profiles, onSelect, onClose, triggerRef }: NewTabMenuProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target) || triggerRef.current?.contains(target)) {
        return;
      }
      onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [onClose, triggerRef]);

  const triggerRect = triggerRef.current?.getBoundingClientRect();
  if (!triggerRect) return null;
  const placeAbove = triggerRect.bottom + 8 + profiles.length * 32 > window.innerHeight;

  return createPortal(
    <div
      ref={containerRef}
      role="menu"
      aria-label="New tab"
      className="fixed z-50 min-w-48 rounded-md border border-border/60 bg-base-800 py-1 shadow-lg"
      style={{
        right: window.innerWidth - triggerRect.right,
        ...(placeAbove
          ? { bottom: window.innerHeight - triggerRect.top + 4 }
          : { top: triggerRect.bottom + 4 }),
      }}
    >
      {profiles.map((profile) => (
        <button
          key={profile.id}
          role="menuitem"
          type="button"
          onClick={() => {
            onSelect(profile);
            onClose();
          }}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-base-700 hover:text-text-primary"
        >
          <LocalProfileIcon icon={profile.icon} className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{profile.name}</span>
        </button>
      ))}
    </div>,
    document.body
  );
}
