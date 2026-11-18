import { useEffect, useState } from "react";
import type { PluginWorkspaceLauncherProps } from "@hypershell/plugin-api";

export function SerialLauncher({ surface, openTab, host }: PluginWorkspaceLauncherProps) {
  const [ports, setPorts] = useState<string[]>([]);
  const [port, setPort] = useState("");

  useEffect(() => {
    if (surface !== "welcome") return;
    void host.serialProfiles.listPorts().then((items) => {
      const available = items.map((item) => item.path);
      setPorts(available);
      setPort((current) => current || available[0] || "");
    }).catch(console.error);
  }, [host, surface]);

  if (surface !== "welcome") return null;

  return (
    <form className="flex flex-wrap items-center justify-center gap-2" onSubmit={(event) => {
      event.preventDefault();
      if (!port.trim()) return;
      const sessionId = `serial-adhoc-${crypto.randomUUID()}`;
      openTab({ sessionId, title: port.trim(), transport: "serial", profileId: port.trim() });
    }}>
      <span className="text-xs text-text-muted">Serial</span>
      <input aria-label="Serial port" list="serial-ports" value={port} onChange={(event) => setPort(event.target.value)} placeholder="COM3 or /dev/ttyUSB0" className="h-8 w-44 rounded border border-border bg-surface px-2 text-xs text-text-primary" />
      <datalist id="serial-ports">{ports.map((item) => <option key={item} value={item} />)}</datalist>
      <button type="submit" className="h-8 rounded border border-accent/40 bg-accent/10 px-3 text-xs text-accent hover:bg-accent/20">Connect</button>
    </form>
  );
}
