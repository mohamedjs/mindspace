import type { Note as StickyNoteData } from '../../../core/domain';

export const DAY_MS = 86_400_000;

/** Local midnight, so grouping matches the calendar the user reads, not UTC. */
export function startOfDay(d: Date | string | number): number {
  const date = new Date(d);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * The day a note belongs on.
 *
 * A note the speaker put a time on belongs on that day; everything else
 * belongs on the day they thought of it. Without the created_at fallback the
 * calendar would be empty for anyone who doesn't talk in deadlines.
 */
export function noteDay(note: StickyNoteData): number | null {
  const stamp = note.dueAt ?? note.createdAt;
  return stamp ? startOfDay(stamp) : null;
}

export function dayLabel(dayStart: number): string {
  const today = startOfDay(new Date());
  const diff = Math.round((dayStart - today) / DAY_MS);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';

  const date = new Date(dayStart);
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}),
  });
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** Sunday-first week containing `day`, matching the strip in the design. */
export function weekOf(day: number): number[] {
  const date = new Date(day);
  const sunday = startOfDay(new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay()));
  return Array.from({ length: 7 }, (_, i) => startOfDay(new Date(sunday + i * DAY_MS + DAY_MS / 2)));
}
