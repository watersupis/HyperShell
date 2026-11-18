import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { TagRecord } from "@hypershell/shared";
import { ContextMenu } from "../shared/ContextMenu";
import type { ContextMenuAction } from "../shared/ContextMenu";
import { Button } from "../shared/ui/Button";
import { EmptyState } from "../shared/ui/EmptyState";
import { IconButton } from "../shared/ui/IconButton";
import type { HostUiRecord as HostRecord } from "@hypershell/shared";
import type { PluginHostAction, PluginHostContext } from "@hypershell/plugin-api";
import { loadCollapsedGroups, saveCollapsedGroups } from "./collapsedGroups";
import { getShell, hasShell } from "../shared/shell";
import { useI18n } from "../shared/i18n";

export interface SidebarHostListProps {
  hosts: HostRecord[];
  tags: TagRecord[];
  activeSessionHostIds: Set<string>;
  connectingHostIds: Set<string>;
  showFilter?: boolean;
  showAddress: boolean;
  onCloseFilter?: () => void;
  onConnect: (host: HostRecord) => void;
  builtinHostActions: PluginHostAction[];
  onEdit: (host: HostRecord) => void;
  onDuplicate: (host: HostRecord) => void;
  onDelete: (host: HostRecord) => void;
  onToggleFavorite: (host: HostRecord) => void;
  onCopyHostname: (host: HostRecord) => void;
  onCopyAddress: (host: HostRecord) => void;
  onSetColor: (host: HostRecord, color: string | null) => void;
  onReorder: (items: Array<{ id: string; sortOrder: number; group: string }>) => void;
  onNewHost: () => void;
  hostContextPlugins?: Array<{ id: string; name: string; placement: "workspace.tab" | "workspace.secondarySidebar" | "workspace.panel" }>;
  onOpenPlugin?: (pluginId: string, placement: "workspace.tab" | "workspace.secondarySidebar" | "workspace.panel", hostId: string, title: string) => void;
}

const HOST_COLORS = ["red", "orange", "yellow", "green", "blue", "cyan", "purple", "pink"] as const;
type HostReachability = "online" | "offline" | "unknown";

function StatusDot({ hostId, activeSessionHostIds, connectingHostIds, hostReachabilityById }: {
  hostId: string;
  activeSessionHostIds: Set<string>;
  connectingHostIds: Set<string>;
  hostReachabilityById: Record<string, HostReachability>;
}) {
  if (connectingHostIds.has(hostId)) {
    return <span className="host-status-connecting shrink-0" />;
  }
  if (activeSessionHostIds.has(hostId)) {
    return (
      <span className="relative flex shrink-0 items-center justify-center">
        <span className="h-2 w-2 rounded-full bg-success host-status-pulse" />
      </span>
    );
  }
  const reachability = hostReachabilityById[hostId] ?? "unknown";
  if (reachability === "online") {
    return (
      <span className="relative flex shrink-0 items-center justify-center">
        <span className="h-2 w-2 rounded-full bg-success" />
      </span>
    );
  }
  if (reachability === "offline") {
    return (
      <span className="relative flex shrink-0 items-center justify-center">
        <span className="h-2 w-2 rounded-full bg-danger" />
      </span>
    );
  }
  return (
    <span className="relative flex shrink-0 items-center justify-center">
      <span className="h-2 w-2 rounded-full bg-text-muted/40" />
    </span>
  );
}

function SortableHostItem({
  host,
  activeSessionHostIds,
  connectingHostIds,
  hostReachabilityById,
  onConnect,
  builtinHostActions,
  onContextMenu,
  onSelect,
  selected,
  showAddress,
}: {
  host: HostRecord;
  activeSessionHostIds: Set<string>;
  connectingHostIds: Set<string>;
  hostReachabilityById: Record<string, HostReachability>;
  onConnect: (host: HostRecord) => void;
  builtinHostActions: PluginHostAction[];
  onContextMenu: (e: React.MouseEvent, host: HostRecord) => void;
  onSelect: (host: HostRecord) => void;
  selected: boolean;
  showAddress: boolean;
}) {
  const { t } = useI18n();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: host.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const quickAction = builtinHostActions.find((action) => action.showAsHostQuickAction);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="group relative flex items-center gap-2 px-1 py-0.5"
    >
      <button
        type="button"
        onClick={() => onSelect(host)}
        onDoubleClick={() => onConnect(host)}
        onContextMenu={(e) => {
          e.preventDefault();
          onContextMenu(e, host);
        }}
        className={`${selected ? "bg-accent/10" : ""} relative flex min-w-0 flex-1 items-center gap-2.5 rounded-md border-l-2 ${
          host.color ? `host-color-${host.color}` : "border-transparent hover:border-accent/50"
        } px-2 py-1.5 pr-8 text-left text-sm transition-colors duration-(--motion-fast) ease-standard hover:bg-base-700/50`}
        title={showAddress
          ? `${t("Double-click to connect")} · ${host.hostname}:${host.port}`
          : t("Double-click to connect")}
      >
        <StatusDot
          hostId={host.id}
          activeSessionHostIds={activeSessionHostIds}
          connectingHostIds={connectingHostIds}
          hostReachabilityById={hostReachabilityById}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 truncate font-mono text-[12.5px] font-semibold leading-tight tracking-tight text-text-primary">
            {host.isFavorite && (
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="text-warning shrink-0">
                <path d="M8 1.5L9.8 5.7L14.4 6.2L11 9.3L11.9 14L8 11.6L4.1 14L5 9.3L1.6 6.2L6.2 5.7L8 1.5Z" />
              </svg>
            )}
            {host.name}
          </div>
          {showAddress && (
            <div className="mt-0.5 truncate text-[11px] leading-tight text-text-muted">
              {host.username ? `${host.username}@` : ""}{host.hostname}:{host.port}
            </div>
          )}
        </div>
      </button>
      {quickAction && <IconButton
        variant="ghost"
        title={t(quickAction.label)}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          void quickAction.execute(host);
        }}
        className="absolute right-2 top-1/2 z-10 -translate-y-1/2 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto transition-opacity duration-(--motion-fast) bg-base-800/80"
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path d="M2 4.5A1.5 1.5 0 013.5 3H6.5L8 5H12.5A1.5 1.5 0 0114 6.5V11.5A1.5 1.5 0 0112.5 13H3.5A1.5 1.5 0 012 11.5V4.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      </IconButton>}
    </div>
  );
}

export function SidebarHostList({
  hosts,
  tags,
  activeSessionHostIds,
  connectingHostIds,
  onConnect,
  builtinHostActions,
  onEdit,
  onDuplicate,
  onDelete,
  onToggleFavorite,
  onCopyHostname,
  onCopyAddress,
  onSetColor,
  onReorder,
  onNewHost,
  hostContextPlugins = [],
  onOpenPlugin,
  showFilter = false,
  showAddress,
  onCloseFilter,
}: SidebarHostListProps) {
  const { t } = useI18n();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; host: HostRecord } | null>(null);
  const [resolvedHostActionLabels, setResolvedHostActionLabels] = useState<Record<string, string>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedHostId, setSelectedHostId] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [hostReachabilityById, setHostReachabilityById] = useState<
    Record<string, HostReachability>
  >({});
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() =>
    loadCollapsedGroups()
  );
  const filterInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    if (!contextMenu) {
      setResolvedHostActionLabels({});
      return;
    }

    const host = contextMenu.host as PluginHostContext;
    void Promise.all(builtinHostActions.map(async (item) => {
      if (!item.resolveLabel) return [item.id, item.label] as const;
      try {
        return [item.id, await item.resolveLabel(host)] as const;
      } catch {
        return [item.id, item.label] as const;
      }
    })).then((entries) => {
      if (!cancelled) setResolvedHostActionLabels(Object.fromEntries(entries));
    });

    return () => { cancelled = true; };
  }, [contextMenu, builtinHostActions]);

  const toggleGroup = useCallback((group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      saveCollapsedGroups(next);
      return next;
    });
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const filteredHosts = useMemo(() => {
    const query = filterQuery.trim().toLowerCase();
    const selectedIdSet = new Set(selectedTagIds);

    return hosts.filter((host) => {
      const matchesQuery =
        query.length === 0 ||
        host.name.toLowerCase().includes(query) ||
        host.hostname.toLowerCase().includes(query) ||
        (host.group && host.group.toLowerCase().includes(query)) ||
        (host.tags && host.tags.toLowerCase().includes(query)) ||
        host.username.toLowerCase().includes(query);

      if (!matchesQuery) {
        return false;
      }

      if (selectedIdSet.size === 0) {
        return true;
      }

      const hostTagIds = host.tagIds ?? [];
      return hostTagIds.some((tagId) => selectedIdSet.has(tagId));
    });
  }, [filterQuery, hosts, selectedTagIds]);

  const tagHostCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const host of hosts) {
      for (const tagId of host.tagIds ?? []) {
        counts.set(tagId, (counts.get(tagId) ?? 0) + 1);
      }
    }
    return counts;
  }, [hosts]);

  useEffect(() => {
    const knownIds = new Set(tags.map((tag) => tag.id));
    setSelectedTagIds((previous) =>
      previous.filter((tagId) => knownIds.has(tagId))
    );
  }, [tags]);

  useEffect(() => {
    if (showFilter) {
      filterInputRef.current?.focus();
    } else {
      setFilterQuery("");
      setSelectedTagIds([]);
    }
  }, [showFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, HostRecord[]>();
    for (const host of filteredHosts) {
      const group = host.group || "Ungrouped";
      const list = map.get(group) ?? [];
      list.push(host);
      map.set(group, list);
    }
    // Sort within groups: favorites first, then by sortOrder, then name
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.isFavorite !== b.isFavorite) return (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0);
        const aOrder = a.sortOrder ?? 999999;
        const bOrder = b.sortOrder ?? 999999;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.name.localeCompare(b.name);
      });
    }
    return map;
  }, [filteredHosts]);

  const allHostIds = useMemo(() => {
    const filterActive = filterQuery.trim() !== "" || selectedTagIds.length > 0;
    const ids: string[] = [];
    for (const [group, groupHosts] of grouped) {
      const isCollapsed = !filterActive && collapsedGroups.has(group);
      if (isCollapsed) continue;
      for (const host of groupHosts) ids.push(host.id);
    }
    return ids;
  }, [grouped, collapsedGroups, filterQuery, selectedTagIds]);
  const activeHost = activeId ? hosts.find((h) => h.id === activeId) : null;

  const setStatusTargets = useCallback((hostIds: string[]) => {
    if (!hasShell()) {
      return;
    }
    void getShell().setHostStatusTargets({ hostIds });
  }, []);

  useEffect(() => {
    if (!hasShell()) {
      return;
    }

    return getShell().onHostStatus((event) => {
      setHostReachabilityById((prev) => {
        const next = event.online ? "online" : "offline";
        if (prev[event.hostId] === next) {
          return prev;
        }
        return {
          ...prev,
          [event.hostId]: next,
        };
      });
    });
  }, []);

  useEffect(() => {
    setStatusTargets(filteredHosts.map((host) => host.id));
  }, [filteredHosts, setStatusTargets]);

  useEffect(() => {
    return () => {
      setStatusTargets([]);
    };
  }, [setStatusTargets]);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Find current flat order and compute new order
    const flatHosts: HostRecord[] = [];
    for (const [, groupHosts] of grouped) {
      flatHosts.push(...groupHosts);
    }

    const oldIndex = flatHosts.findIndex((h) => h.id === active.id);
    const newIndex = flatHosts.findIndex((h) => h.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    // Move host to new position
    const [moved] = flatHosts.splice(oldIndex, 1);
    flatHosts.splice(newIndex, 0, moved);

    // Update the moved host's group to match its new neighbor
    const overHost = hosts.find((h) => h.id === over.id);
    if (overHost && moved.group !== overHost.group) {
      moved.group = overHost.group;
    }

    // Emit new sort orders. Ungrouped hosts keep an empty group name — main
    // resolves "" to no group, so no literal "Ungrouped" row is ever created.
    const items = flatHosts.map((h, i) => ({
      id: h.id,
      sortOrder: i,
      group: h.group,
    }));
    onReorder(items);
  }

  const toggleTagFilter = useCallback((tagId: string) => {
    setSelectedTagIds((previous) => {
      if (previous.includes(tagId)) {
        return previous.filter((id) => id !== tagId);
      }
      return [...previous, tagId];
    });
  }, []);

  const buildContextMenuActions = (host: HostRecord): ContextMenuAction[] => [
    {
      label: t("Connect"),
      action: () => onConnect(host),
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M5 3L13 8L5 13V3Z" fill="currentColor" />
        </svg>
      ),
    },
    {
      label: host.isFavorite ? t("Remove from Favorites") : t("Add to Favorites"),
      action: () => onToggleFavorite(host),
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path
            d="M8 2L9.8 6H14L10.5 8.8L11.8 13L8 10.5L4.2 13L5.5 8.8L2 6H6.2L8 2Z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      ),
    },
    { label: "", action: () => {}, separator: true },
    {
      label: t("Edit Host"),
      action: () => onEdit(host),
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M11.5 2.5L13.5 4.5L5 13H3V11L11.5 2.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      label: t("Copy Hostname"),
      action: () => onCopyHostname(host),
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <rect x="5" y="5" width="8" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M3 11V3.5A1.5 1.5 0 014.5 2H11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      label: t("Copy Address"),
      action: () => onCopyAddress(host),
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <rect x="5" y="5" width="8" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M3 11V3.5A1.5 1.5 0 014.5 2H11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      label: t("Copy SSH Command"),
      action: () => {
        const parts = ["ssh"];
        if (host.port && host.port !== 22) parts.push(`-p ${host.port}`);
        if (host.identityFile) parts.push(`-i "${host.identityFile}"`);
        if (host.proxyJump) parts.push(`-J ${host.proxyJump}`);
        parts.push(host.username ? `${host.username}@${host.hostname}` : host.hostname);
        void navigator.clipboard.writeText(parts.join(" "));
      },
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M2 4L6 8L2 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M8 13H14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      label: t("Duplicate"),
      action: () => onDuplicate(host),
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="5" width="8" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M6 5V3.5A1.5 1.5 0 017.5 2H12.5A1.5 1.5 0 0114 3.5V9.5A1.5 1.5 0 0112.5 11H11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      ),
    },
    { label: "", action: () => {}, separator: true },
    {
      label: "color-picker",
      action: () => {},
      customContent: (
        <div className="flex items-center gap-1.5 px-3 py-1.5">
          {HOST_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => { onSetColor(host, color); setContextMenu(null); }}
              className={`color-swatch color-swatch-${color} h-4 w-4 rounded-full transition-transform hover:scale-125 ${host.color === color ? "ring-2 ring-white/70 ring-offset-1 ring-offset-base-800" : ""}`}
              title={color.charAt(0).toUpperCase() + color.slice(1)}
            />
          ))}
          <button
            type="button"
            onClick={() => { onSetColor(host, null); setContextMenu(null); }}
            className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-text-muted hover:text-text-primary transition-colors"
            title="Clear Color"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M5 5L11 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ),
    },
    { label: "", action: () => {}, separator: true },
    ...(builtinHostActions.length > 0 ? [
      { label: "", action: () => {}, separator: true } as ContextMenuAction,
      ...builtinHostActions.map((item): ContextMenuAction => ({
        label: resolvedHostActionLabels[item.id] ?? item.label,
        disabled: item.disabled,
        action: () => { void item.execute(host); },
      })),
    ] : []),
    { label: "", action: () => {}, separator: true },
    {
      label: "Delete",
      action: () => onDelete(host),
      danger: true,
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M3 5H13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M6 5V3H10V5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4.5 5L5 13H11L11.5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    ...(hostContextPlugins.length > 0 ? [
      { label: "", action: () => {}, separator: true } as ContextMenuAction,
      ...hostContextPlugins.map((plugin): ContextMenuAction => ({
        label: plugin.name,
        action: () => onOpenPlugin?.(plugin.id, plugin.placement, host.id, plugin.name),
        icon: (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M6 2v3H3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h3v3h4v-3h3a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-3V2H6Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          </svg>
        ),
      })),
    ] : []),
  ];

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col min-h-0 flex-1 px-1">
        {/* Filter (toggled from Quick Connect magnifier) */}
        {showFilter && (
          <div className="flex items-center gap-1 px-1 pb-1 shrink-0">
            <div className="relative min-w-0 flex-1">
              <svg
                width="13"
                height="13"
                viewBox="0 0 16 16"
                fill="none"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted/60"
              >
                <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                ref={filterInputRef}
                type="text"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setFilterQuery("");
                    onCloseFilter?.();
                  }
                }}
                placeholder={t("Filter hosts...")}
                className="w-full rounded-md border border-transparent bg-base-750/40 py-1 pl-7 pr-6 text-xs text-text-primary placeholder:text-text-muted/50 focus:border-accent/30 focus:bg-base-750/60 focus:outline-none transition-colors duration-150"
              />
              <button
                type="button"
                onClick={() => {
                  setFilterQuery("");
                  onCloseFilter?.();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 flex h-4 w-4 items-center justify-center rounded-sm text-text-muted/60 hover:text-text-primary focus-ring transition-colors duration-150"
                title={t("Close filter")}
              >
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                  <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {showFilter && tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 px-1 pb-1.5 shrink-0">
            {tags.map((tag) => {
              const selected = selectedTagIds.includes(tag.id);
              const hostCount = tagHostCounts.get(tag.id) ?? 0;
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTagFilter(tag.id)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                    selected
                      ? "border-accent/45 bg-accent/15 text-text-primary"
                      : "border-border bg-base-800/65 text-text-secondary hover:text-text-primary"
                  }`}
                  title={`${tag.name} (${hostCount})`}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: tag.color ?? "#64748b" }}
                  />
                  <span>{tag.name}</span>
                  <span className="text-[10px] text-text-muted/80">{hostCount}</span>
                </button>
              );
            })}
            {selectedTagIds.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedTagIds([])}
                className="ml-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-text-muted transition-colors hover:text-text-primary"
              >
                {t("Clear")}
              </button>
            )}
          </div>
        )}

        {/* Scrollable host cards */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-0.5">
          <SortableContext items={allHostIds} strategy={verticalListSortingStrategy}>
            {[...grouped.entries()].map(([group, groupHosts]) => {
              const isCollapsed =
                collapsedGroups.has(group) &&
                filterQuery.trim() === "" &&
                selectedTagIds.length === 0;
              return (
                <div key={group}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(group)}
                    aria-expanded={!isCollapsed}
                    className="flex w-full items-center gap-1 select-none px-2 py-1.5 text-[10px] font-medium uppercase tracking-widest text-text-muted/70 hover:text-text-secondary transition-colors duration-(--motion-fast) focus-ring rounded-sm"
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 12 12"
                      fill="none"
                      aria-hidden="true"
                      className={`transition-transform duration-(--motion-base) ease-standard ${isCollapsed ? "" : "rotate-90"}`}
                    >
                      <path d="M4 2L8 6L4 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>{group === "Hosts" || group === "Local" ? t(group) : group}</span>
                    <span className="text-text-muted/50">· {groupHosts.length}</span>
                  </button>

                  {!isCollapsed &&
                    groupHosts.map((host) => (
                      <SortableHostItem
                        key={host.id}
                        host={host}
                        selected={selectedHostId === host.id}
                        showAddress={showAddress}
                        activeSessionHostIds={activeSessionHostIds}
                        connectingHostIds={connectingHostIds}
                        hostReachabilityById={hostReachabilityById}
                        onConnect={onConnect}
                        onSelect={(selectedHost) => setSelectedHostId(selectedHost.id)}
                        builtinHostActions={builtinHostActions}
                        onContextMenu={(e, h) => setContextMenu({ x: e.clientX, y: e.clientY, host: h })}
                      />
                    ))}
                </div>
              );
            })}
          </SortableContext>

          {hosts.length === 0 && (
            <EmptyState
              message={t("No hosts yet")}
              icon={
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="4" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M8 20H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M12 16V20" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              }
            >
              <Button size="sm" onClick={onNewHost}>{t("Add host")}</Button>
            </EmptyState>
          )}

          {hosts.length > 0 && filteredHosts.length === 0 && (
            <EmptyState
              message={
                filterQuery.trim()
                  ? `No hosts match “${filterQuery.trim()}”`
                  : t("No hosts match the selected tags")
              }
            >
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setFilterQuery("");
                  setSelectedTagIds([]);
                }}
              >
                {t("Clear filter")}
              </Button>
            </EmptyState>
          )}
        </div>

        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            actions={buildContextMenuActions(contextMenu.host)}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>

      <DragOverlay>
        {activeHost ? (
          <div className="flex items-center gap-2.5 rounded-md border border-accent/30 bg-base-800/95 px-2 py-1.5 text-sm shadow-raised backdrop-blur">
            <StatusDot
              hostId={activeHost.id}
              activeSessionHostIds={activeSessionHostIds}
              connectingHostIds={connectingHostIds}
              hostReachabilityById={hostReachabilityById}
            />
            <span className="text-[13px] font-medium text-text-primary">{activeHost.name}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
