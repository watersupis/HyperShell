import { useEffect, useMemo, useState } from "react";
import { useSftpI18n, useSftpUiHost } from "../hostServices";

export interface DriveSelectorProps {
  currentPath: string;
  onSelect: (drive: string) => void;
}

function getCurrentDrive(path: string): string {
  const match = path.match(/^([a-zA-Z]:\\)/);
  return match?.[1] ?? "/";
}

export function DriveSelector({ currentPath, onSelect }: DriveSelectorProps) {
  const { t } = useSftpI18n();
  const host = useSftpUiHost();
  const [drives, setDrives] = useState<string[]>([]);
  const currentDrive = useMemo(() => getCurrentDrive(currentPath), [currentPath]);

  useEffect(() => {
    let disposed = false;

    async function loadDrives() {
      try {
        const response = await host.files.getDrives();
        if (disposed) {
          return;
        }

        const nextDrives = response?.drives?.length ? response.drives : [currentDrive];
        setDrives(nextDrives);
      } catch {
        if (!disposed) {
          setDrives([currentDrive]);
        }
      }
    }

    void loadDrives();

    return () => {
      disposed = true;
    };
  }, [currentDrive, host]);

  const options = drives.length > 0 ? drives : [currentDrive];

  return (
    <select
      value={currentDrive}
      onChange={(event) => onSelect(event.target.value)}
      className="rounded border border-base-600 bg-base-800 px-1.5 py-0.5 text-xs text-text-primary"
      title={t("Local drive")}
    >
      {options.map((drive) => (
        <option key={drive} value={drive}>
          {drive}
        </option>
      ))}
    </select>
  );
}
