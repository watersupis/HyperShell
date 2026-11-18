import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { resolveTabTitle, type LayoutTab } from "./layoutStore";
import { TabIcon } from "./TabIcon";
import { sessionStateStore } from "./sessionStateStore";
import { settingsStore } from "../shell/settings/settingsStore";
import {
  TAB_TITLE_COLOR_OPTIONS,
  getTabTitleColorCssValue,
  resolveTabTitleColor,
  type TabTitleColorId,
} from "../shell/settings/tabTitleColors";
import { ContextMenu, type ContextMenuAction } from "../shared/ContextMenu";
import { IconButton } from "../shared/ui/IconButton";
import { useI18n } from "../shared/i18n";
import { getInternalPluginTabPresentation, isPluginWorkspaceTab } from "../plugin-runtime/internalPluginRegistry";

const tabStateColors: Record<string, string> = {
  connected: "bg-success",
  connecting: "bg-warning",
  reconnecting: "bg-warning",
  waiting_for_network: "bg-warning",
  disconnected: "bg-text-muted/50",
  failed: "bg-danger",
};

const stateTextColors: Record<string, string> = {
  connected: "text-success",
  connecting: "text-warning",
  reconnecting: "text-warning",
  waiting_for_network: "text-warning",
  disconnected: "text-text-muted",
  failed: "text-danger",
};

export interface TabBarProps {
  tabs: LayoutTab[];
  activeSessionId: string | null;
  onActivate: (sessionId: string) => void;
  onClose: (sessionId: string) => void;
  onCloseOthers: (sessionId: string) => void;
  onCloseToRight: (sessionId: string) => void;
  onSplit: (sessionId: string, direction: "horizontal" | "vertical") => void;
  currentPaneId: string;
  panes: Array<{ paneId: string; sessionId: string | null; tabSessionIds?: string[] }>;
  onMoveToPane: (sessionId: string, paneId: string) => void;
  launcherContent?: ReactNode;
  rightContent?: ReactNode;
}

function TabTooltip({
  tab,
  sessionState,
  showActiveProcess,
}: {
  tab: LayoutTab;
  sessionState: string | undefined;
  showActiveProcess: boolean;
}) {
  const transport = isPluginWorkspaceTab(tab)
    ? getInternalPluginTabPresentation(tab)?.label ?? "Plugin"
    : tab.transport === "serial" ? "Serial" : tab.transport === "telnet" ? "Telnet" : "SSH";
  const state = sessionState ?? "disconnected";
  const label = resolveTabTitle(showActiveProcess ? tab : { ...tab, processTitle: undefined });

  return (
    <div className="absolute top-full left-0 mt-1 z-50 min-w-[180px] max-w-[320px] py-2 px-3 rounded-lg bg-base-700 border border-border shadow-raised animate-menu-in text-xs pointer-events-none">
      <div className="font-medium text-text-primary text-[13px] mb-1 break-words">{label}</div>
      <div className="flex items-center gap-1.5 text-text-muted">
        <span className="text-text-secondary">{transport}</span>
        {tab.dynamicTitle && tab.dynamicTitle !== tab.title && (
          <>
            <span className="text-text-muted/50">&middot;</span>
            <span>{tab.title}</span>
          </>
        )}
        {tab.profileId && (
          <>
            <span className="text-text-muted/50">&middot;</span>
            <span>{tab.profileId}</span>
          </>
        )}
      </div>
      {tab.processTitle && showActiveProcess && (
        <div className="mt-1 flex items-center gap-1.5 text-text-muted">
          <span>running</span>
          <span className="text-text-secondary">{tab.processTitle}</span>
        </div>
      )}
      {tab.dynamicTitle && tab.dynamicTitle !== tab.title && (
        <div className="mt-1 flex items-center gap-1.5 text-text-muted">
          <span>shell</span>
          <span className="text-text-secondary">{tab.dynamicTitle}</span>
        </div>
      )}
      <div className={`mt-1.5 flex items-center gap-1.5 uppercase tracking-wider text-[10px] font-medium ${stateTextColors[state] ?? "text-text-muted"}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${tabStateColors[state] ?? "bg-text-muted/50"}`} />
        {state}
      </div>
    </div>
  );
}

function SortableTab({
  tab,
  paneId,
  isActive,
  sessionState,
  showActiveProcess,
  onActivate,
  onClose,
  titleColor,
  onOpenTabMenu,
  hoveredTab,
  onMouseEnter,
  onMouseLeave,
}: {
  tab: LayoutTab;
  paneId: string;
  isActive: boolean;
  sessionState: string | undefined;
  showActiveProcess: boolean;
  onActivate: () => void;
  onClose: () => void;
  titleColor: TabTitleColorId | null;
  onOpenTabMenu: (x: number, y: number) => void;
  hoveredTab: string | null;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `${paneId}:${tab.tabKey ?? tab.sessionId}`,
    data: { paneId, sessionId: tab.sessionId },
  });
  const nodeRef = useRef<HTMLDivElement | null>(null);

  // A tab that becomes active off-screen is unreachable: the strip's scrollbar
  // is hidden, so nothing tells the user it scrolled past. Opening a tab and
  // switching panes both land here. `nearest` is what keeps this from fighting
  // the user — an already-visible tab scrolls nothing.
  useLayoutEffect(() => {
    if (!isActive) return;
    nodeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [isActive]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition ?? "transform 180ms cubic-bezier(0.2, 0, 0, 1)",
    opacity: isDragging ? 0.5 : 1,
  };

  const label = resolveTabTitle(showActiveProcess ? tab : { ...tab, processTitle: undefined });
  const titleColorCss = titleColor ? getTabTitleColorCssValue(titleColor) : undefined;

  return (
    <div
      ref={(node) => {
        nodeRef.current = node;
        setNodeRef(node);
      }}
      style={style}
      className={`flex items-end ${isDragging ? "shadow-raised" : ""}`}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const bounds = nodeRef.current?.getBoundingClientRect();
        onOpenTabMenu(event.clientX || bounds?.left || 0, event.clientY || bounds?.bottom || 0);
      }}
    >
      <button
        {...attributes}
        {...listeners}
        data-tab-title-color={titleColor ?? "default"}
        onClick={onActivate}
        onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); onClose(); } }}
        onKeyDown={(event) => {
          if (event.shiftKey && event.key === "F10") {
            event.preventDefault();
            const bounds = event.currentTarget.getBoundingClientRect();
            onOpenTabMenu(bounds.left, bounds.bottom);
            return;
          }
          listeners?.onKeyDown?.(event);
        }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        className={`group relative flex items-center gap-1.5 px-3.5 py-2 text-[13px] rounded-t-lg transition-colors duration-(--motion-fast) ease-standard min-w-[110px] max-w-[220px] ${
          isActive
            ? "bg-base-900 text-text-primary"
            : "text-text-muted hover:text-text-primary hover:bg-base-700/40"
        }`}
      >
        <TabIcon
          tab={tab}
          sessionState={sessionState}
          isActive={isActive}
          color={titleColorCss}
        />
        <span
          className="min-w-0 flex-1 overflow-hidden whitespace-nowrap pr-3 [mask-image:linear-gradient(to_right,black_calc(100%-14px),transparent)]"
          style={titleColorCss ? { color: titleColorCss } : undefined}
        >
          {label}
        </span>
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- nested inside the tab <button>, so it cannot be a button; keyboard users close the tab with Ctrl+Shift+W */}
        <span
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="ml-1 p-0.5 rounded-sm opacity-0 group-hover:opacity-100 hover:bg-base-600/80 transition-all duration-100 text-text-muted hover:text-text-primary"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2.5 2.5L7.5 7.5M7.5 2.5L2.5 7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </span>
        {/* Active indicator — accent line at top */}
        {isActive && (
          <span
            data-testid="active-tab-indicator"
            className="absolute top-0 left-2 right-2 h-[2px] bg-accent rounded-b-full"
            style={titleColorCss ? { backgroundColor: titleColorCss } : undefined}
          />
        )}
        {/* Bottom edge blend for active tab */}
        {isActive && (
          <span className="absolute -bottom-px left-0 right-0 h-px bg-base-900" />
        )}
        {/* Hover tooltip */}
        {hoveredTab === tab.sessionId && (
          <TabTooltip tab={tab} sessionState={sessionState} showActiveProcess={showActiveProcess} />
        )}
      </button>
    </div>
  );
}

export function TabDragPreview({ tab }: { tab: LayoutTab }) {
  const sessionState = useStore(sessionStateStore, (state) => state.sessions[tab.sessionId]?.state);
  const showActiveProcess = useStore(settingsStore, (state) => state.settings.general.showActiveProcess);
  const tabTitleColors = useStore(settingsStore, (state) => state.settings.appearance.tabTitleColors);
  const label = resolveTabTitle(showActiveProcess ? tab : { ...tab, processTitle: undefined });
  const titleColor = resolveTabTitleColor(label, tabTitleColors);
  const titleColorCss = titleColor ? getTabTitleColorCssValue(titleColor) : undefined;

  return (
    <div className="flex h-9 min-w-[150px] max-w-[240px] items-center gap-2 rounded-t-lg border border-border-bright bg-base-800 px-3 text-[13px] text-text-primary shadow-raised">
      <TabIcon tab={tab} sessionState={sessionState} isActive color={titleColorCss} />
      <span className="min-w-0 flex-1 truncate" style={titleColorCss ? { color: titleColorCss } : undefined}>
        {label}
      </span>
    </div>
  );
}

function ScrollChevron({
  direction,
  onClick,
  label,
}: {
  direction: "left" | "right";
  onClick: () => void;
  label: string;
}) {
  return (
    <div className="flex h-full shrink-0 items-center pb-2">
      <IconButton
        variant="ghost"
        onClick={onClick}
        title={label}
        aria-label={label}
        className="h-6 w-5 animate-menu-in"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d={direction === "left" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
        </svg>
      </IconButton>
    </div>
  );
}

export function TabBar({
  tabs,
  activeSessionId,
  onActivate,
  onClose,
  onCloseOthers,
  onCloseToRight,
  onSplit,
  currentPaneId,
  panes,
  onMoveToPane,
  launcherContent,
  rightContent,
}: TabBarProps) {
  const { t } = useI18n();
  const sessionStates = useStore(sessionStateStore, (s) => s.sessions);
  const showActiveProcess = useStore(settingsStore, (s) => s.settings.general.showActiveProcess);
  const tabTitleColors = useStore(
    settingsStore,
    (state) => state.settings.appearance.tabTitleColors
  );
  const updateTabTitleColor = useStore(settingsStore, (state) => state.updateTabTitleColor);
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);
  const [colorMenu, setColorMenu] = useState<{
    x: number;
    y: number;
    title: string;
  } | null>(null);
  const [tabMenu, setTabMenu] = useState<{
    x: number;
    y: number;
    sessionId: string;
    title: string;
  } | null>(null);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [overflow, setOverflow] = useState({ left: false, right: false });

  // Sub-pixel widths make an exactly-scrolled-to-the-end strip report a
  // fractional gap, which would leave a chevron that scrolls nowhere.
  const syncOverflow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setOverflow((prev) => {
      const next = { left: el.scrollLeft > 1, right: el.scrollLeft < max - 1 };
      return prev.left === next.left && prev.right === next.right ? prev : next;
    });
  }, []);

  // Tab widths move on their own — titles change as the running program
  // changes — so the strip's own resize isn't enough; observe the tabs too.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    syncOverflow();
    const observer = new ResizeObserver(syncOverflow);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [syncOverflow, tabs.length]);

  const scrollByPage = (direction: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: "smooth" });
  };

  const tabIds = useMemo(
    () => tabs.map((tab) => `${currentPaneId}:${tab.tabKey ?? tab.sessionId}`),
    [currentPaneId, tabs]
  );
  const selectedColor = colorMenu
    ? resolveTabTitleColor(colorMenu.title, tabTitleColors)
    : null;
  const colorMenuActions = useMemo<ContextMenuAction[]>(
    () =>
      colorMenu
        ? [
            {
              label: t("Default"),
              action: () => {
                void updateTabTitleColor(colorMenu.title, null);
              },
              shortcut: selectedColor === null ? t("Current") : undefined,
            },
            { label: "palette-separator", action: () => {}, separator: true },
            ...TAB_TITLE_COLOR_OPTIONS.map((option) => ({
              label: t(option.label),
              action: () => {
                void updateTabTitleColor(colorMenu.title, option.id);
              },
              shortcut: selectedColor === option.id ? t("Current") : undefined,
              icon: (
                <span
                  aria-hidden="true"
                  className="h-3 w-3 rounded-full ring-1 ring-white/15"
                  style={{ backgroundColor: option.cssValue }}
                />
              ),
            })),
          ]
        : [],
    [colorMenu, selectedColor, t, updateTabTitleColor]
  );
  const tabMenuActions = useMemo<ContextMenuAction[]>(() => {
    if (!tabMenu) return [];
    const tabIndex = tabs.findIndex((tab) => tab.sessionId === tabMenu.sessionId);
    return [
      { label: t("Close Tab"), action: () => onClose(tabMenu.sessionId), shortcut: "Ctrl+W" },
      { label: t("Close Other Tabs"), action: () => onCloseOthers(tabMenu.sessionId) },
      {
        label: t("Close Tabs to the Right"),
        action: () => onCloseToRight(tabMenu.sessionId),
        disabled: tabIndex < 0 || tabIndex === tabs.length - 1,
      },
      { label: "split-separator", action: () => {}, separator: true },
      { label: t("Split Right"), action: () => onSplit(tabMenu.sessionId, "horizontal") },
      { label: t("Split Down"), action: () => onSplit(tabMenu.sessionId, "vertical") },
      ...panes.filter((pane) => pane.paneId !== currentPaneId).map((pane) => ({
        label: `${t("Move to Pane")} ${panes.indexOf(pane) + 1}`,
        action: () => onMoveToPane(tabMenu.sessionId, pane.paneId),
      })),
      { label: "color-separator", action: () => {}, separator: true },
      {
        label: t("Change Tab Color"),
        action: () => setColorMenu({ x: tabMenu.x, y: tabMenu.y, title: tabMenu.title }),
      },
    ];
  }, [currentPaneId, onClose, onCloseOthers, onCloseToRight, onMoveToPane, onSplit, panes, t, tabMenu, tabs]);

  // Zero tabs and no plugin launcher is exactly today's "nothing to show" case —
  // preserve it. Zero tabs with at least one launchable profile still needs the
  // "+" button rendered so a first tab can be opened from the tab bar too.
  if (tabs.length === 0 && !launcherContent && !rightContent) return null;

  const handleMouseEnter = (sessionId: string) => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    hoverTimeout.current = setTimeout(() => setHoveredTab(sessionId), 400);
  };

  const handleMouseLeave = () => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    hoverTimeout.current = null;
    setHoveredTab(null);
  };

  return (
    <>
      {/* The scrollable tab list and the "+" button/menu are siblings, not
          parent/child: a flex container with one non-`visible` overflow axis
          computes the other axis to `auto` too (CSS Overflow spec), so an
          `overflow-x-auto` div also clips vertically. Keeping the dropdown
          outside that container means it's never clipped, and the "+" stays
          reachable even when the tab list scrolls. */}
      <div className="flex h-full w-full items-end bg-base-800 px-1 pt-2">
        {overflow.left && (
          <ScrollChevron direction="left" label={t("Scroll tabs left")} onClick={() => scrollByPage(-1)} />
        )}
        <SortableContext items={tabIds} strategy={horizontalListSortingStrategy}>
          {/* The scrollbar is hidden, not styled: a native horizontal scrollbar
              consumes layout height here, squishing the tabs and detaching the
              active tab from the terminal below it. Vertical wheel delta maps
              to horizontal scroll so overflowed tabs stay reachable. */}
          <div
            ref={scrollRef}
            data-testid="tab-scroll-container"
            className="flex h-full min-w-0 flex-1 items-end overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            onScroll={syncOverflow}
            onWheel={(e) => {
              if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                e.currentTarget.scrollLeft += e.deltaY;
              }
            }}
          >
            {tabs.map((tab) => {
              const isActive = tab.sessionId === activeSessionId;
              const sessionState = sessionStates[tab.sessionId]?.state;
              const label = resolveTabTitle(
                showActiveProcess ? tab : { ...tab, processTitle: undefined }
              );
              const titleColor = resolveTabTitleColor(label, tabTitleColors);
              return (
                <SortableTab
                  key={tab.tabKey ?? tab.sessionId}
                  tab={tab}
                  paneId={currentPaneId}
                  isActive={isActive}
                  sessionState={sessionState}
                  showActiveProcess={showActiveProcess}
                  onActivate={() => onActivate(tab.sessionId)}
                  onClose={() => onClose(tab.sessionId)}
                  titleColor={titleColor}
                  onOpenTabMenu={(x, y) => {
                    onActivate(tab.sessionId);
                    setTabMenu({ x, y, sessionId: tab.sessionId, title: label });
                  }}
                  hoveredTab={hoveredTab}
                  onMouseEnter={() => handleMouseEnter(tab.sessionId)}
                  onMouseLeave={handleMouseLeave}
                />
              );
            })}
            {launcherContent}
          </div>
        </SortableContext>
        {overflow.right && (
          <ScrollChevron direction="right" label={t("Scroll tabs right")} onClick={() => scrollByPage(1)} />
        )}
        {rightContent}
      </div>
      {colorMenu && (
        <ContextMenu
          x={colorMenu.x}
          y={colorMenu.y}
          actions={colorMenuActions}
          onClose={() => setColorMenu(null)}
        />
      )}
      {tabMenu && (
        <ContextMenu
          x={tabMenu.x}
          y={tabMenu.y}
          actions={tabMenuActions}
          onClose={() => setTabMenu(null)}
        />
      )}
    </>
  );
}
