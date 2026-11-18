import { useState } from "react";
import type { PluginTerminalToolbarProps } from "@hypershell/plugin-api";

export function SerialTerminalToolbar({ session }: PluginTerminalToolbarProps) {
  const [dtr, setDtr] = useState(true);
  const [rts, setRts] = useState(true);

  if (session.transport !== "serial") return null;

  const controls = [
    ["DTR", dtr, setDtr, "dtr"],
    ["RTS", rts, setRts, "rts"],
  ] as const;

  return controls.map(([label, value, setValue, signal]) => (
    <button
      key={label}
      type="button"
      onClick={() => {
        const next = !value;
        setValue(next);
        void session.setSignals({ [signal]: next });
      }}
      className={`rounded border px-2 py-0.5 text-[10px] font-medium transition-all duration-150 ${
        value
          ? "border-success/30 bg-success/15 text-success"
          : "border-border/40 bg-base-700/60 text-text-muted"
      }`}
      aria-pressed={value}
    >
      {label}
    </button>
  ));
}
