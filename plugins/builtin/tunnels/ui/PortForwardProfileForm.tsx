import { useId, useState } from "react";

export type PortForwardProtocol = "local" | "remote" | "dynamic";

export type PortForwardProfileValue = {
  name: string;
  hostname: string;
  username: string;
  sshPort: number;
  protocol: PortForwardProtocol;
  localAddress: string;
  localPort: number;
  remoteHost: string;
  remotePort: number;
  description: string;
};

export interface PortForwardProfileFormProps {
  initialValue?: Partial<PortForwardProfileValue>;
  onSubmit: (value: PortForwardProfileValue) => void;
  t: (key: string) => string;
}

const defaultValue: PortForwardProfileValue = {
  name: "",
  hostname: "",
  username: "",
  sshPort: 22,
  protocol: "local",
  localAddress: "127.0.0.1",
  localPort: 8080,
  remoteHost: "",
  remotePort: 80,
  description: ""
};

export function PortForwardProfileForm({
  initialValue,
  onSubmit,
  t
}: PortForwardProfileFormProps) {
  const formId = useId();
  const [value, setValue] = useState<PortForwardProfileValue>({
    ...defaultValue,
    ...initialValue
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(value);
      }}
      className="grid gap-3 rounded-md border border-border bg-base-800 p-4 text-text-primary"
    >
      <h2 style={{ margin: 0, fontSize: 14 }}>{t("Port forwarding profile")}</h2>

      <label htmlFor={`${formId}-name`} className="grid gap-1.5 text-text-secondary">
        <div className="text-[13px] text-text-secondary">{t("Name")}</div>
        <input
          id={`${formId}-name`}
          value={value.name}
          onChange={(event) => setValue({ ...value, name: event.target.value })}
          className="w-full rounded-[10px] border border-border bg-base-900 text-text-primary px-3 py-2.5"
          required
        />
      </label>

      <label htmlFor={`${formId}-protocol`} className="grid gap-1.5 text-text-secondary">
        <div className="text-[13px] text-text-secondary">{t("Protocol")}</div>
        <select
          id={`${formId}-protocol`}
          value={value.protocol}
          onChange={(event) =>
            setValue({ ...value, protocol: event.target.value as PortForwardProtocol })
          }
          className="w-full rounded-[10px] border border-border bg-base-900 text-text-primary px-3 py-2.5"
        >
          <option value="local">Local</option>
          <option value="remote">Remote</option>
          <option value="dynamic">Dynamic (SOCKS)</option>
        </select>
      </label>

      <label htmlFor={`${formId}-hostname`} className="grid gap-1.5 text-text-secondary">
        <div className="text-[13px] text-text-secondary">{t("SSH host")}</div>
        <input
          id={`${formId}-hostname`}
          value={value.hostname}
          onChange={(event) => setValue({ ...value, hostname: event.target.value })}
          className="w-full rounded-[10px] border border-border bg-base-900 text-text-primary px-3 py-2.5"
          required
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label htmlFor={`${formId}-username`} className="grid gap-1.5 text-text-secondary">
          <div className="text-[13px] text-text-secondary">{t("Username")}</div>
          <input
            id={`${formId}-username`}
            value={value.username}
            onChange={(event) => setValue({ ...value, username: event.target.value })}
            className="w-full rounded-[10px] border border-border bg-base-900 text-text-primary px-3 py-2.5"
          />
        </label>
        <label htmlFor={`${formId}-sshPort`} className="grid gap-1.5 text-text-secondary">
          <div className="text-[13px] text-text-secondary">{t("SSH port")}</div>
          <input
            id={`${formId}-sshPort`}
            type="number"
            min={1}
            max={65535}
            value={value.sshPort}
            onChange={(event) => setValue({ ...value, sshPort: Number(event.target.value) || 0 })}
            className="w-full rounded-[10px] border border-border bg-base-900 text-text-primary px-3 py-2.5"
            required
          />
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label htmlFor={`${formId}-localAddress`} className="grid gap-1.5 text-text-secondary">
          <div className="text-[13px] text-text-secondary">{t("Local address")}</div>
          <input
            id={`${formId}-localAddress`}
            value={value.localAddress}
            onChange={(event) =>
              setValue({ ...value, localAddress: event.target.value })
            }
            className="w-full rounded-[10px] border border-border bg-base-900 text-text-primary px-3 py-2.5"
          />
        </label>

        <label htmlFor={`${formId}-localPort`} className="grid gap-1.5 text-text-secondary">
          <div className="text-[13px] text-text-secondary">{t("Local port")}</div>
          <input
            id={`${formId}-localPort`}
            type="number"
            value={value.localPort}
            onChange={(event) =>
              setValue({ ...value, localPort: Number(event.target.value) || 0 })
            }
            className="w-full rounded-[10px] border border-border bg-base-900 text-text-primary px-3 py-2.5"
            min={1}
            max={65535}
            required
          />
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label htmlFor={`${formId}-remoteHost`} className="grid gap-1.5 text-text-secondary">
          <div className="text-[13px] text-text-secondary">{t("Remote host")}</div>
          <input
            id={`${formId}-remoteHost`}
            value={value.remoteHost}
            onChange={(event) =>
              setValue({ ...value, remoteHost: event.target.value })
            }
            className="w-full rounded-[10px] border border-border bg-base-900 text-text-primary px-3 py-2.5"
          />
        </label>

        <label htmlFor={`${formId}-remotePort`} className="grid gap-1.5 text-text-secondary">
          <div className="text-[13px] text-text-secondary">{t("Remote port")}</div>
          <input
            id={`${formId}-remotePort`}
            type="number"
            value={value.remotePort}
            onChange={(event) =>
              setValue({ ...value, remotePort: Number(event.target.value) || 0 })
            }
            className="w-full rounded-[10px] border border-border bg-base-900 text-text-primary px-3 py-2.5"
            min={0}
            max={65535}
          />
        </label>
      </div>

      <label htmlFor={`${formId}-description`} className="grid gap-1.5 text-text-secondary">
        <div className="text-[13px] text-text-secondary">{t("Description")}</div>
        <textarea
          id={`${formId}-description`}
          value={value.description}
          onChange={(event) => setValue({ ...value, description: event.target.value })}
          rows={3}
          style={{ resize: "vertical" }}
          className="w-full rounded-[10px] border border-border bg-base-900 text-text-primary px-3 py-2.5"
        />
      </label>

      <button type="submit" className="rounded-[10px] border border-accent-dim bg-accent/15 text-accent px-3.5 py-2.5 cursor-pointer justify-self-start">
        {t("Save profile")}
      </button>
    </form>
  );
}
