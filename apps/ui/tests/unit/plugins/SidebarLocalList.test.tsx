import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LocalProfileRecord } from "@hypershell/shared";
import { SidebarLocalList } from "../../../../../plugins/builtin/local-terminal/ui/SidebarLocalList";

const profile: LocalProfileRecord = {
  id: "profile-1",
  name: "PowerShell",
  executable: "pwsh.exe",
  args: [],
  startingDirectory: null,
  icon: "powershell",
  color: null,
  elevated: false,
  source: "detected",
  detectKey: "pwsh7",
  isAvailable: true,
  isHidden: false,
  sortOrder: 0,
  claudeSession: false,
  claudeSessionMode: "continue",
};

function renderList(onConnect: (profile: LocalProfileRecord) => void) {
  return render(
    <SidebarLocalList
      profiles={[profile]}
      onConnect={onConnect}
      onReorder={vi.fn()}
      onRescan={vi.fn()}
      showHidden={false}
      onToggleShowHidden={vi.fn()}
      onToggleHidden={vi.fn()}
      onNew={vi.fn()}
      onEdit={vi.fn()}
    />
  );
}

describe("SidebarLocalList", () => {
  it("connects to an available profile only after a double click", () => {
    const onConnect = vi.fn();
    renderList(onConnect);
    const button = screen.getByRole("button", { name: /PowerShell/ });

    fireEvent.click(button);
    expect(onConnect).not.toHaveBeenCalled();

    fireEvent.doubleClick(button);
    expect(onConnect).toHaveBeenCalledExactlyOnceWith(profile);
  });
});
