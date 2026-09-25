import type { Claim } from '../shared/session.js';

// ponytail: in-memory claim table, lost on restart; persist if claims must survive
const claims = new Map<string, Claim>();

/** Returns the existing claim if someone else holds it, else records the claim and returns null. */
export function tryClaim(
  resourceId: string,
  participantId: string,
): Claim | null {
  const existing = claims.get(resourceId);
  if (existing && existing.claimedBy !== participantId) return existing;
  claims.set(resourceId, {
    resourceId,
    claimedBy: participantId,
    claimedAt: Date.now(),
  });
  return null;
}

export const listClaims = (): Claim[] => [...claims.values()];
