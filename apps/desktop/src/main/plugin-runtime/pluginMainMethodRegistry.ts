import type {
  PluginMainMethodHandler,
  PluginMainMethodRegistry,
} from "@hypershell/plugin-api";

export interface RuntimePluginMainMethodRegistry extends PluginMainMethodRegistry {
  invoke(pluginId: string, method: string, payload: unknown): Promise<unknown>;
}

export function createPluginMainMethodRegistry(): RuntimePluginMainMethodRegistry {
  const methods = new Map<string, PluginMainMethodHandler>();
  const keyOf = (pluginId: string, method: string) => `${pluginId}\0${method}`;

  return {
    register(pluginId, method, handler) {
      if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(pluginId) || !/^[a-z][a-zA-Z0-9.-]*$/.test(method)) {
        throw new Error("Invalid plugin main method registration");
      }
      const key = keyOf(pluginId, method);
      if (methods.has(key)) {
        throw new Error(`Plugin main method already registered: ${pluginId}.${method}`);
      }
      methods.set(key, handler);
      return () => {
        if (methods.get(key) === handler) methods.delete(key);
      };
    },
    async invoke(pluginId, method, payload) {
      const handler = methods.get(keyOf(pluginId, method));
      if (!handler) throw new Error(`Plugin main method is unavailable: ${pluginId}.${method}`);
      return await handler(payload);
    },
  };
}
