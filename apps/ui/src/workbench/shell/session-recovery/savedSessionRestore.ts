import type { SavedSessionRecord } from "@hypershell/shared";

import type { LayoutTab } from "../../editor-area/layoutStore";

/**
 * Maps a restorable session row into the generic terminal-tab shape. Restore
 * capability is resolved separately by the owning transport contribution.
 *
 * The transport has to survive the round trip: a saved row's `profileId` is
 * meaningful only to its own transport (a local profile UUID, a COM port, a
 * host id), and anything defaulted to SSH gets that string dialled as a
 * hostname.
 */
export function savedSessionToLayoutTab(
  session: SavedSessionRecord,
  sessionId: string
): LayoutTab {
  return {
    tabKey: sessionId,
    sessionId,
    title: session.title,
    transport: session.transport,
    profileId: session.profileId,
    hostId: session.hostId ?? undefined,
    pluginData: session.pluginData,
    preopened: false,
  };
}
