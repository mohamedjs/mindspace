/**
 * Would making `parentId` the parent of `noteId` create a cycle?
 *
 * True when they are the same note, or when the proposed parent is already
 * somewhere below the child — connecting those would make a ring that the
 * descendant walk in CanvasRoot cannot terminate on.
 */
export function wouldCycle(
  noteId: string,
  parentId: string,
  parentOf: Map<string, string | null>
): boolean {
  if (noteId === parentId) return true;

  let cursor: string | null | undefined = parentId;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === noteId) return true;
    if (seen.has(cursor)) return true; // pre-existing corruption; refuse anyway
    seen.add(cursor);
    cursor = parentOf.get(cursor) ?? null;
  }
  return false;
}
