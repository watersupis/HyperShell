export { builtinPluginCatalog as internalPluginCatalog } from "../../../../../plugins/builtin/catalog";

export interface InternalPluginDefinition {
  id: string;
  title: string;
  kind: "core" | "optional";
}
