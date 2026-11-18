import { localTerminalUiContribution } from "./local-terminal/ui";
import { recordingUiContribution } from "./session-recording/ui";
import { sftpUiContribution } from "./sftp/ui";
import { serialUiContribution } from "./serial/ui";
import { sshUiContribution } from "./ssh/ui";
import { tunnelsUiContribution } from "./tunnels/ui";
import { quickCommandCenterUiContribution } from "./quick-command-center/ui";

export const builtinUiContributions = [
  sftpUiContribution,
  localTerminalUiContribution,
  serialUiContribution,
  sshUiContribution,
  recordingUiContribution,
  tunnelsUiContribution,
  quickCommandCenterUiContribution,
] as const;
