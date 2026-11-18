import { Suspense, useId, useState, useEffect } from "react";
import { useStore } from "zustand";
import {
  MAX_CREDENTIAL_CACHE_TTL_MINUTES,
  MAX_TERMINAL_LETTER_SPACING,
  MAX_TERMINAL_LINE_HEIGHT,
  MIN_CREDENTIAL_CACHE_TTL_MINUTES,
  MIN_TERMINAL_LETTER_SPACING,
  MIN_TERMINAL_LINE_HEIGHT,
  TERMINAL_FONT_SIZE_OPTIONS,
  settingsStore
} from "./settingsStore";
import { APP_THEMES } from "./appThemes";
import { terminalThemes } from "../../editor-area/terminal/terminalTheme";
import { ThemeEditor } from "./ThemeEditor";
import { BackupRestorePanel } from "./BackupRestorePanel";
import { useUpdateStore } from "../updates/updateStore";
import { Button } from "../../shared/ui/Button";
import { Input } from "../../shared/ui/Input";
import { Select } from "../../shared/ui/Select";
import { SectionLabel } from "../../shared/ui/SectionLabel";
import { useI18n } from "../../shared/i18n";
import { getInternalPluginSettingsPages } from "../../plugin-runtime/internalPluginRegistry";
import type { PluginUiHostServices } from "@hypershell/plugin-api";
import { getShell } from "../../shared/shell";
import { PluginIcon } from "../../plugin-runtime/PluginIcon";

const FONT_OPTIONS: { label: string; value: string }[] = [
  {
    label: "Cascadia Mono",
    value: '"Cascadia Mono", "Cascadia Code", Consolas, "IBM Plex Mono", monospace'
  },
  { label: "IBM Plex Mono", value: '"IBM Plex Mono", Consolas, monospace' },
  { label: "JetBrains Mono", value: '"JetBrains Mono", monospace' },
  { label: "Fira Code", value: '"Fira Code", monospace' },
  { label: "Cascadia Code", value: '"Cascadia Code", Consolas, monospace' },
  { label: "Source Code Pro", value: '"Source Code Pro", monospace' },
  { label: "Consolas", value: "Consolas, monospace" },
  { label: "Courier New", value: '"Courier New", monospace' },
];

const SCROLLBACK_OPTIONS = [1000, 2000, 5000, 10000, 25000, 50000];

function formatThemeName(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

type SettingsCategory = "general" | "security" | "terminal" | "appearance" | "backup" | "updates" | `plugin:${string}:${string}`;

const CATEGORIES: { id: SettingsCategory; label: string; icon: React.ReactNode }[] = [
  {
    id: "general",
    label: "General",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 1.5a1.5 1.5 0 0 1 1.5 1.5v.34a5.5 5.5 0 0 1 1.3.75l.29-.17a1.5 1.5 0 0 1 2.05.55l.01.01a1.5 1.5 0 0 1-.55 2.05l-.3.17a5.5 5.5 0 0 1 0 1.5l.3.17a1.5 1.5 0 0 1 .54 2.06 1.5 1.5 0 0 1-2.05.55l-.3-.17a5.5 5.5 0 0 1-1.29.75V12a1.5 1.5 0 0 1-3 0v-.34a5.5 5.5 0 0 1-1.3-.75l-.29.17a1.5 1.5 0 0 1-2.05-.55l-.01-.01a1.5 1.5 0 0 1 .55-2.05l.3-.17a5.5 5.5 0 0 1 0-1.5l-.3-.17a1.5 1.5 0 0 1-.54-2.06 1.5 1.5 0 0 1 2.05-.55l.3.17a5.5 5.5 0 0 1 1.29-.75V3A1.5 1.5 0 0 1 8 1.5Z" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    ),
  },
  {
    id: "security",
    label: "Security",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M8 1.5 13 3.5v3.6c0 3.2-2.2 5.9-5 7.4-2.8-1.5-5-4.2-5-7.4V3.5l5-2Z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M8 6.4v2.9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="8" cy="11.2" r="0.7" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: "terminal",
    label: "Terminal",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M4 6l2 2-2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 10h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "appearance",
    label: "Appearance",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="8" cy="8" r="2.5" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: "backup",
    label: "Backup",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M4 13V3a1 1 0 011-1h6a1 1 0 011 1v10l-4-2.5L4 13Z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    id: "updates",
    label: "Updates",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M8 3v5l3 2M8 1a7 7 0 1 0 7 7"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },

];


/**
 * `label` is required: a bare role="switch" with no accessible name is
 * announced as an unnamed control. Pass the same text as the visible row title
 * so the accessible name matches what is on screen.
 */
function ToggleSwitch({
  checked,
  onChange,
  label
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={[
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent/40 focus:ring-offset-2 focus:ring-offset-base-900",
        checked ? "bg-accent" : "bg-base-600",
      ].join(" ")}
    >
      <span
        className={[
          "pointer-events-none inline-block h-4 w-4 translate-y-0.5 rounded-full bg-white shadow transition-transform duration-200 ease-in-out",
          checked ? "translate-x-4" : "translate-x-0.5",
        ].join(" ")}
      />
    </button>
  );
}

/**
 * The one setting-row anatomy: title (plus optional one-line description) on
 * the left, control right-aligned. Pass `controlId` when the control is a real
 * form field so the title becomes its `<label>`; toggles carry their own
 * aria-label instead.
 */
function SettingRow({
  label,
  description,
  controlId,
  children
}: {
  label: string;
  description?: React.ReactNode;
  controlId?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        {controlId ? (
          <label htmlFor={controlId} className="block text-sm text-text-primary">
            {label}
          </label>
        ) : (
          <div className="text-sm text-text-primary">{label}</div>
        )}
        {description ? <div className="text-xs text-text-muted">{description}</div> : null}
      </div>
      {children}
    </div>
  );
}

/** Keeps right-aligned fields off the full-width default the field recipe uses. */
function ControlSlot({ children }: { children: React.ReactNode }) {
  return <div className="w-40 shrink-0">{children}</div>;
}

function GeneralSection() {
  const { t } = useI18n();
  const settings = useStore(settingsStore, (s) => s.settings);
  const updateGeneral = useStore(settingsStore, (s) => s.updateGeneral);
  const updateLocale = useStore(settingsStore, (s) => s.updateLocale);
  const {
    showRestoreBanner,
    showSessionRecoveryPrompt,
    confirmOnClose,
    enableTelnet,
    showActiveProcess
  } = settings.general;

  return (
    <div>
      <SettingRow label={t("Language")} description={t("Choose the language used across HyperShell")}>
        <Select
          aria-label={t("Language")}
          value={settings.locale}
          className="!w-32"
          onChange={(event) => void updateLocale(event.target.value === "zh-CN" ? "zh-CN" : "en")}
        >
          <option value="en">English</option>
          <option value="zh-CN">{t("Simplified Chinese")}</option>
        </Select>
      </SettingRow>

      <SectionLabel className="pt-4 pb-1">{t("Session")}</SectionLabel>

      <SettingRow
        label={t("Session Restore Prompt")}
        description={t('Show "Restore sessions from last session" on startup')}
      >
        <ToggleSwitch
          label={t("Session Restore Prompt")}
          checked={showRestoreBanner}
          onChange={() => void updateGeneral({ showRestoreBanner: !showRestoreBanner })}
        />
      </SettingRow>

      <SettingRow
        label={t("Session Recovery Prompt")}
        description={t("Offer to reopen sessions left behind by an ungraceful shutdown")}
      >
        <ToggleSwitch
          label={t("Session Recovery Prompt")}
          checked={showSessionRecoveryPrompt}
          onChange={() =>
            void updateGeneral({ showSessionRecoveryPrompt: !showSessionRecoveryPrompt })
          }
        />
      </SettingRow>

      <SettingRow
        label={t("Show Running Program in Tab Titles")}
        description={t("Show the foreground program's name in tab titles, tooltips, and the status bar")}
      >
        <ToggleSwitch
          label={t("Show Running Program in Tab Titles")}
          checked={showActiveProcess}
          onChange={() => void updateGeneral({ showActiveProcess: !showActiveProcess })}
        />
      </SettingRow>

      <SettingRow
        label={t("Confirm on Close")}
        description={t("Ask for confirmation before closing with active sessions")}
      >
        <ToggleSwitch
          label={t("Confirm on Close")}
          checked={confirmOnClose}
          onChange={() => void updateGeneral({ confirmOnClose: !confirmOnClose })}
        />
      </SettingRow>

      <SectionLabel className="pt-4 pb-1">{t("Protocols")}</SectionLabel>

      <SettingRow
        label={t("Enable Telnet / Raw TCP")}
        description={t("Show Telnet quick-connect option for network gear and raw TCP services")}
      >
        <ToggleSwitch
          label={t("Enable Telnet / Raw TCP")}
          checked={enableTelnet}
          onChange={() => void updateGeneral({ enableTelnet: !enableTelnet })}
        />
      </SettingRow>
    </div>
  );
}

function UpdatesSection() {
  const { t } = useI18n();
  const update = useUpdateStore((s) => s.update);
  const check = useUpdateStore((s) => s.check);
  const refresh = useUpdateStore((s) => s.refresh);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const currentVersion = update?.currentVersion ?? "—";
  const checking = update?.status === "checking";

  function statusLine(): string {
    if (!update) {
      return "";
    }
    switch (update.status) {
      case "checking":
        return t("Checking for updates…");
      case "available":
      case "manual-available":
        return t("Update available: v{version}").replace("{version}", update.availableVersion ?? "");
      case "downloading":
        return t("Downloading: {percent}%").replace("{percent}", String(update.progressPercent ?? 0));
      case "downloaded":
        return t("Update v{version} ready to install").replace("{version}", update.availableVersion ?? "");
      case "up-to-date":
        return t("You're on the latest version.");
      case "error":
        return t("Couldn't check — {error}").replace("{error}", update.error ?? t("try again"));
      default:
        return "";
    }
  }

  const status = statusLine();

  return (
    <div>
      <SectionLabel className="pt-4 pb-1">{t("Application Updates")}</SectionLabel>

      <SettingRow
        label={t("Current version")}
        description={update ? `v${currentVersion}` : currentVersion}
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => void check()}
          disabled={checking}
          className="shrink-0"
        >
          {checking ? t("Checking…") : t("Check for updates")}
        </Button>
      </SettingRow>

      {status ? <div className="text-xs text-text-muted">{status}</div> : null}
      {update?.lastCheckedAt ? (
        <div className="text-xs text-text-muted">
          {t("Last checked")}: {new Date(update.lastCheckedAt).toLocaleString()}
        </div>
      ) : null}
    </div>
  );
}

function SecuritySection() {
  const { t } = useI18n();
  const fieldId = useId();
  const settings = useStore(settingsStore, (s) => s.settings);
  const updateSecurity = useStore(settingsStore, (s) => s.updateSecurity);
  const { credentialCacheEnabled, credentialCacheTtlMinutes } = settings.security;

  return (
    <div>
      <SectionLabel className="pt-4 pb-1">{t("Authentication")}</SectionLabel>

      <SettingRow
        label={t("Credential Cache")}
        description={t("Cache SSH passwords in main-process memory for reconnects (never written to disk)")}
      >
        <ToggleSwitch
          label={t("Credential Cache")}
          checked={credentialCacheEnabled}
          onChange={() =>
            void updateSecurity({ credentialCacheEnabled: !credentialCacheEnabled })
          }
        />
      </SettingRow>

      <SettingRow
        label={t("Cache Timeout (minutes)")}
        description={t("Cached credentials expire after this inactivity window")}
        controlId={`${fieldId}-cacheTtl`}
      >
        <ControlSlot>
          <Input
            id={`${fieldId}-cacheTtl`}
            type="number"
            min={MIN_CREDENTIAL_CACHE_TTL_MINUTES}
            max={MAX_CREDENTIAL_CACHE_TTL_MINUTES}
            step={1}
            disabled={!credentialCacheEnabled}
            value={credentialCacheTtlMinutes}
            onChange={(e) => {
              const parsed = Number.parseInt(e.target.value, 10);
              if (!Number.isFinite(parsed)) {
                return;
              }
              void updateSecurity({ credentialCacheTtlMinutes: parsed });
            }}
          />
        </ControlSlot>
      </SettingRow>
    </div>
  );
}

function TerminalSection() {
  const { t } = useI18n();
  const fieldId = useId();
  const settings = useStore(settingsStore, (s) => s.settings);
  const updateTerminal = useStore(settingsStore, (s) => s.updateTerminal);
  const updateDebug = useStore(settingsStore, (s) => s.updateDebug);
  const { fontFamily, fontSize, lineHeight, letterSpacing, cursorBlink, scrollback, autoRecordSessions, idleDisconnectMinutes, textLogDirectory, recordingDirectory } =
    settings.terminal;
  const authTracing = settings.debug.authTracing;

  const activeFontValue =
    FONT_OPTIONS.find((f) => fontFamily.includes(f.label))?.value ?? FONT_OPTIONS[0].value;

  return (
    <div>
      <SectionLabel className="pt-4 pb-1">{t("Session capture")}</SectionLabel>
      <SettingRow label={t("Automatically record sessions")} description={t("Start a replayable recording whenever a terminal connects")}>
        <ToggleSwitch label={t("Automatically record sessions")} checked={autoRecordSessions} onChange={() => void updateTerminal({ autoRecordSessions: !autoRecordSessions })} />
      </SettingRow>
      <SettingRow label={t("Disconnect idle sessions after")} description={t("Disconnect local and remote sessions after no terminal input or output")}>
        <ControlSlot>
          <Select
            aria-label={t("Disconnect idle sessions after")}
            value={String(idleDisconnectMinutes)}
            onChange={(event) => void updateTerminal({ idleDisconnectMinutes: Number(event.target.value) })}
          >
            <option value="15">{t("15 minutes")}</option>
            <option value="30">{t("30 minutes")}</option>
            <option value="60">{t("1 hour")}</option>
            <option value="120">{t("2 hours")}</option>
            <option value="0">{t("No limit")}</option>
          </Select>
        </ControlSlot>
      </SettingRow>
      <SettingRow label={t("Text log folder")} description={textLogDirectory || t("Default: application data/logs")}>
        <Button variant="outline" size="sm" onClick={() => {
          void (async () => {
            const selected = await getShell().fsShowOpenDialog({ title: t("Choose text log folder"), directory: true });
            if (selected) void updateTerminal({ textLogDirectory: selected });
          })();
        }}>{t("Choose folder")}</Button>
      </SettingRow>
      <SettingRow label={t("Recording folder")} description={recordingDirectory || t("Default: application data/recordings")}>
        <Button variant="outline" size="sm" onClick={() => {
          void (async () => {
            const selected = await getShell().fsShowOpenDialog({ title: t("Choose recording folder"), directory: true });
            if (selected) void updateTerminal({ recordingDirectory: selected });
          })();
        }}>{t("Choose folder")}</Button>
      </SettingRow>
      <SectionLabel className="pt-4 pb-1">{t("Font")}</SectionLabel>

      <SettingRow label={t("Family")} controlId={`${fieldId}-fontFamily`}>
        <ControlSlot>
          <Select
            id={`${fieldId}-fontFamily`}
            value={activeFontValue}
            onChange={(e) => void updateTerminal({ fontFamily: e.target.value })}
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f.label} value={f.value}>{f.label}</option>
            ))}
          </Select>
        </ControlSlot>
      </SettingRow>

      <SettingRow label={t("Size")} controlId={`${fieldId}-fontSize`}>
        <ControlSlot>
          <Select
            id={`${fieldId}-fontSize`}
            value={fontSize}
            onChange={(e) => void updateTerminal({ fontSize: Number(e.target.value) })}
          >
            {TERMINAL_FONT_SIZE_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}px</option>
            ))}
          </Select>
        </ControlSlot>
      </SettingRow>

      <SettingRow label={t("Line Height")} controlId={`${fieldId}-lineHeight`}>
        <ControlSlot>
          <Input
            id={`${fieldId}-lineHeight`}
            type="number"
            min={MIN_TERMINAL_LINE_HEIGHT}
            max={MAX_TERMINAL_LINE_HEIGHT}
            step={0.05}
            value={lineHeight}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (
                !isNaN(val) &&
                val >= MIN_TERMINAL_LINE_HEIGHT &&
                val <= MAX_TERMINAL_LINE_HEIGHT
              ) {
                void updateTerminal({ lineHeight: val });
              }
            }}
          />
        </ControlSlot>
      </SettingRow>

      <SettingRow label={t("Character Spacing")} controlId={`${fieldId}-letterSpacing`}>
        <ControlSlot>
          <Input
            id={`${fieldId}-letterSpacing`}
            type="number"
            min={MIN_TERMINAL_LETTER_SPACING}
            max={MAX_TERMINAL_LETTER_SPACING}
            step={1}
            value={letterSpacing}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (
                !Number.isNaN(val) &&
                val >= MIN_TERMINAL_LETTER_SPACING &&
                val <= MAX_TERMINAL_LETTER_SPACING
              ) {
                void updateTerminal({ letterSpacing: val });
              }
            }}
          />
        </ControlSlot>
      </SettingRow>

      <SectionLabel className="pt-4 pb-1">{t("Behavior")}</SectionLabel>

      <SettingRow label={t("Cursor Blink")} description={t("Animate the cursor in the terminal")}>
        <ToggleSwitch
          label={t("Cursor Blink")}
          checked={cursorBlink}
          onChange={() => void updateTerminal({ cursorBlink: !cursorBlink })}
        />
      </SettingRow>

      <SettingRow
        label={t("Scrollback Lines")}
        description={t("Number of lines to keep in terminal history")}
        controlId={`${fieldId}-scrollback`}
      >
        <ControlSlot>
          <Select
            id={`${fieldId}-scrollback`}
            value={scrollback}
            onChange={(e) => void updateTerminal({ scrollback: Number(e.target.value) })}
          >
            {SCROLLBACK_OPTIONS.map((n) => (
              <option key={n} value={n}>{n.toLocaleString()}</option>
            ))}
          </Select>
        </ControlSlot>
      </SettingRow>

      <SettingRow
        label={t("Auth Trace Logging")}
        description={t("Log whether saved credentials were resolved and used (never logs secrets)")}
      >
        <ToggleSwitch
          label={t("Auth Trace Logging")}
          checked={authTracing}
          onChange={() => void updateDebug({ authTracing: !authTracing })}
        />
      </SettingRow>
    </div>
  );
}

function AppThemeOption({
  id,
  label,
  swatch,
  active,
  onSelect,
}: {
  id: string;
  label: string;
  swatch: string;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className={[
        "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors duration-(--motion-fast) ease-standard focus-ring",
        active
          ? "border-accent/60 bg-accent/10 text-text-primary"
          : "border-border bg-base-900 text-text-secondary hover:border-border-bright hover:text-text-primary",
      ].join(" ")}
    >
      <span
        className="h-4 w-4 shrink-0 rounded-full border border-border-bright"
        style={{ background: swatch }}
      />
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}

function AppearanceSection() {
  const { t } = useI18n();
  const appTheme = useStore(settingsStore, (s) => s.settings.appearance.appTheme);
  const updateAppearance = useStore(settingsStore, (s) => s.updateAppearance);

  const select = (id: string) => void updateAppearance({ appTheme: id });
  const followSystem = appTheme === "system";
  const darkThemes = APP_THEMES.filter((t) => t.variant === "dark");
  const lightThemes = APP_THEMES.filter((t) => t.variant === "light");

  return (
    <div className="grid gap-6">
      <div>
        <SectionLabel className="pt-4 pb-1">{t("App Theme")}</SectionLabel>

        <button
          type="button"
          onClick={() => select("system")}
          className={[
            "mt-1 mb-2 flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors duration-(--motion-fast) ease-standard focus-ring",
            followSystem
              ? "border-accent/60 bg-accent/10 text-text-primary"
              : "border-border bg-base-900 text-text-secondary hover:border-border-bright hover:text-text-primary",
          ].join(" ")}
        >
          <span
            className={[
              "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
              followSystem ? "border-accent bg-accent" : "border-border-bright",
            ].join(" ")}
          >
            {followSystem && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
          </span>
          <span className="text-xs font-medium">{t("Follow system (auto light/dark)")}</span>
        </button>

        <SectionLabel className="pt-4 pb-1">{t("Dark")}</SectionLabel>
        <div className="grid grid-cols-2 gap-2 pt-1">
          {darkThemes.map((t) => (
            <AppThemeOption
              key={t.id}
              id={t.id}
              label={t.label}
              swatch={t.swatch}
              active={!followSystem && appTheme === t.id}
              onSelect={select}
            />
          ))}
        </div>

        <SectionLabel className="pt-4 pb-1">{t("Light")}</SectionLabel>
        <div className="grid grid-cols-2 gap-2 pt-1">
          {lightThemes.map((t) => (
            <AppThemeOption
              key={t.id}
              id={t.id}
              label={t.label}
              swatch={t.swatch}
              active={!followSystem && appTheme === t.id}
              onSelect={select}
            />
          ))}
        </div>
      </div>

      <TerminalThemeSection />
    </div>
  );
}

function TerminalThemeSection() {
  const { t } = useI18n();
  const settings = useStore(settingsStore, (s) => s.settings);
  const updateTerminal = useStore(settingsStore, (s) => s.updateTerminal);
  const customThemes = useStore(settingsStore, (s) => s.settings.customThemes ?? {});
  const deleteCustomTheme = useStore(settingsStore, (s) => s.deleteCustomTheme);
  const [showEditor, setShowEditor] = useState(false);
  const { theme } = settings.terminal;

  const allThemes = [
    ...Object.entries(terminalThemes).map(([key, obj]) => ({ key, obj, isCustom: false })),
    ...Object.entries(customThemes).map(([key, obj]) => ({ key, obj, isCustom: true })),
  ];

  return (
    <div className="grid gap-6">
      {/* Theme picker */}
      <div>
        <SectionLabel className="pt-4 pb-1">{t("Theme")}</SectionLabel>
        <div className="grid grid-cols-2 gap-2 pt-1">
          {allThemes.map(({ key, obj: themeObj, isCustom }) => {
            const isActive = theme === key;
            return (
              <div key={key} className="relative group">
                <button
                  type="button"
                  onClick={() => void updateTerminal({ theme: key })}
                  className={[
                    "w-full rounded-lg border p-3 text-left transition-colors duration-(--motion-fast) ease-standard focus-ring",
                    isActive
                      ? "border-accent/40 bg-accent/10 ring-1 ring-accent/20"
                      : "border-border bg-surface/60 hover:border-border-bright hover:bg-surface/80",
                  ].join(" ")}
                >
                  {/* Color preview bar */}
                  <div className="flex gap-0.5 mb-2">
                    {[themeObj.red, themeObj.green, themeObj.blue, themeObj.yellow, themeObj.magenta, themeObj.cyan].map(
                      (color, i) => (
                        <div
                          key={i}
                          className="h-2 flex-1 rounded-sm first:rounded-l last:rounded-r"
                          style={{ backgroundColor: color }}
                        />
                      )
                    )}
                  </div>
                  {/* Mini terminal preview */}
                  <div
                    className="rounded px-2 py-1.5 font-mono text-[10px] leading-tight mb-2"
                    style={{ background: themeObj.background, color: themeObj.foreground }}
                  >
                    <span style={{ color: themeObj.green }}>$</span>{" "}
                    <span style={{ color: themeObj.cyan }}>ls</span>{" "}
                    <span style={{ color: themeObj.blue }}>src/</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-text-secondary">
                      {formatThemeName(key)}
                    </span>
                    {isCustom && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-accent/10 text-accent font-medium">
                        {t("Custom")}
                      </span>
                    )}
                  </div>
                </button>
                {isCustom && (
                  <button
                    type="button"
                    onClick={() => void deleteCustomTheme(key)}
                    className="absolute top-1.5 right-1.5 hidden group-hover:flex items-center justify-center w-5 h-5 rounded bg-base-900/80 text-text-muted hover:text-danger text-xs transition-colors duration-(--motion-fast) ease-standard focus-ring"
                    title={t("Delete theme")}
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Theme editor */}
      {showEditor ? (
        <ThemeEditor onClose={() => setShowEditor(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setShowEditor(true)}
          className="w-full rounded-lg border border-dashed border-border py-2.5 text-xs text-text-muted hover:text-text-secondary hover:border-border-bright transition-colors duration-(--motion-fast) ease-standard focus-ring"
        >
          + {t("Create Custom Theme")}
        </button>
      )}
    </div>
  );
}

export interface SettingsPanelProps {
  enabledPluginIds: ReadonlySet<string>;
  host: PluginUiHostServices;
}

export function SettingsPanel({ enabledPluginIds, host }: SettingsPanelProps) {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>("general");
  const { t } = useI18n();
  const pluginSettingsPages = getInternalPluginSettingsPages(enabledPluginIds);
  const categories = [
    ...CATEGORIES,
    ...pluginSettingsPages.map((page) => ({
      id: page.categoryId as SettingsCategory,
      label: page.title,
      icon: <PluginIcon pluginId={page.pluginId} />,
    })),
  ];
  const activePluginPage = pluginSettingsPages.find((page) => page.categoryId === activeCategory);
  const ActivePluginPage = activePluginPage?.component;

  return (
    <div className="flex h-[520px]">
      {/* Category sidebar */}
      <nav className="w-44 shrink-0 min-h-0 overflow-y-auto border-r border-border pr-2 mr-4 flex flex-col gap-0.5">
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setActiveCategory(cat.id)}
            className={[
              "flex items-center gap-2.5 rounded-lg border-l-2 px-3 py-2 text-left text-sm transition-colors duration-(--motion-fast) ease-standard focus-ring",
              activeCategory === cat.id
                ? "border-accent bg-accent/10 text-accent font-medium"
                : "border-transparent text-text-secondary hover:text-text-primary hover:bg-base-700/60",
            ].join(" ")}
          >
            <span className={activeCategory === cat.id ? "text-accent" : "text-text-muted"}>
              {cat.icon}
            </span>
            {t(cat.label)}
          </button>
        ))}
      </nav>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-1">
        {activeCategory === "general" && <GeneralSection />}
        {activeCategory === "security" && <SecuritySection />}
        {activeCategory === "terminal" && <TerminalSection />}
        {activeCategory === "appearance" && <AppearanceSection />}
        {activeCategory === "backup" && <BackupRestorePanel />}
        {activeCategory === "updates" && <UpdatesSection />}
        {ActivePluginPage && activePluginPage && (
          <Suspense fallback={<div className="py-4 text-xs text-text-muted">{t("Loading")}</div>}>
            <ActivePluginPage host={host} />
          </Suspense>
        )}
      </div>
    </div>
  );
}
