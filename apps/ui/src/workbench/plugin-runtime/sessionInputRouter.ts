import { createStore } from "zustand/vanilla";

export interface SessionInputRoute {
  enabled: boolean;
  targetSessionIds: string[];
}

export interface SessionInputRouterState {
  routes: Record<string, SessionInputRoute>;
  setRoute(ownerId: string, enabled: boolean, targetSessionIds: string[]): void;
  setRouteEnabled(ownerId: string, enabled: boolean): void;
  removeRoute(ownerId: string): void;
  cleanOwners(activeOwnerIds: string[]): void;
  cleanTargets(activeSessionIds: string[]): void;
}

export function createSessionInputRouterStore() {
  return createStore<SessionInputRouterState>()((set) => ({
    routes: {},
    setRoute: (ownerId, enabled, targetSessionIds) => set((state) => {
      const uniqueTargets = Array.from(new Set(targetSessionIds));
      const current = state.routes[ownerId];
      if (
        current?.enabled === enabled &&
        current.targetSessionIds.length === uniqueTargets.length &&
        current.targetSessionIds.every((id, index) => id === uniqueTargets[index])
      ) {
        return state;
      }
      return {
        routes: {
          ...state.routes,
          [ownerId]: { enabled, targetSessionIds: uniqueTargets },
        },
      };
    }),
    setRouteEnabled: (ownerId, enabled) => set((state) => {
      const current = state.routes[ownerId];
      if (current?.enabled === enabled) return state;
      return {
        routes: {
          ...state.routes,
          [ownerId]: { enabled, targetSessionIds: current?.targetSessionIds ?? [] },
        },
      };
    }),
    removeRoute: (ownerId) => set((state) => {
      if (!Object.hasOwn(state.routes, ownerId)) return state;
      const routes = { ...state.routes };
      delete routes[ownerId];
      return { routes };
    }),
    cleanOwners: (activeOwnerIds) => set((state) => {
      const activeIds = new Set(activeOwnerIds);
      let routes: Record<string, SessionInputRoute> | undefined;
      for (const ownerId of Object.keys(state.routes)) {
        if (activeIds.has(ownerId)) continue;
        routes ??= { ...state.routes };
        delete routes[ownerId];
      }
      return routes ? { routes } : state;
    }),
    cleanTargets: (activeSessionIds) => set((state) => {
      const activeIds = new Set(activeSessionIds);
      let routes: Record<string, SessionInputRoute> | undefined;
      for (const [ownerId, route] of Object.entries(state.routes)) {
        const targetSessionIds = route.targetSessionIds.filter((id) => activeIds.has(id));
        if (targetSessionIds.length === route.targetSessionIds.length) continue;
        routes ??= { ...state.routes };
        routes[ownerId] = { ...route, targetSessionIds };
      }
      return routes ? { routes } : state;
    }),
  }));
}

export function getActiveInputRelayTargets(
  routes: Readonly<Record<string, SessionInputRoute>>
): string[] {
  return Array.from(new Set(
    Object.values(routes)
      .filter((route) => route.enabled)
      .flatMap((route) => route.targetSessionIds)
  ));
}

export const sessionInputRouterStore = createSessionInputRouterStore();
