/**
 * The name a recovered session is listed under.
 *
 * The host can resolve globally shared host names. Transport-owned profile
 * labels are supplied separately through session recovery contributions.
 */
export function resolveSavedSessionTitle(input: {
  profileId: string;
  hostName?: string | null;
}): string {
  return input.hostName ?? input.profileId;
}
