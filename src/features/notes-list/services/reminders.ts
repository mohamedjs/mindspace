import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { StickyNoteData } from '../../sticky-notes/components/StickyNoteItem';

/**
 * Local reminders for notes the AI heard a time on.
 *
 * Local, not push: the schedule is already known the moment the note is
 * written, so there is nothing for a server to decide later — and it keeps
 * working with no network and no device-token plumbing.
 */

let configured = false;

function configure() {
  if (configured) return;
  configured = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function ensureRemindersAllowed(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  configure();

  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  // Don't re-prompt someone who already said no — iOS ignores it anyway.
  if (!current.canAskAgain) return false;

  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/** Stable per note, so re-syncing replaces a reminder instead of stacking one. */
const identifierFor = (noteId: string) => `note-due-${noteId}`;

/**
 * Brings scheduled reminders in line with the notes as they are now.
 *
 * Called on every notes refetch, so it must be idempotent: everything is
 * cancelled by its note-derived identifier before being rescheduled, and past
 * dates are skipped rather than firing immediately.
 */
export async function syncNoteReminders(notes: StickyNoteData[]): Promise<void> {
  if (Platform.OS === 'web') return;
  if (!(await ensureRemindersAllowed())) return;

  const now = Date.now();
  const due = notes.filter((n) => n.dueAt && new Date(n.dueAt).getTime() > now);

  // Drop reminders for notes that were deleted, rescheduled into the past, or
  // had their date cleared — anything ours that isn't in `due` any more.
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const keep = new Set(due.map((n) => identifierFor(n.id)));
  await Promise.all(
    scheduled
      .filter((s) => s.identifier.startsWith('note-due-') && !keep.has(s.identifier))
      .map((s) => Notifications.cancelScheduledNotificationAsync(s.identifier))
  );

  await Promise.all(
    due.map(async (note) => {
      const identifier = identifierFor(note.id);
      // Cancel-then-schedule: the time may have moved since last sync, and
      // scheduling over a live identifier is not defined to replace it.
      await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});
      await Notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title: note.title?.trim() || 'MindSpace',
          body: note.content.slice(0, 140),
          data: { noteId: note.id, spaceId: note.spaceId },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(note.dueAt!),
        },
      });
    })
  );
}
