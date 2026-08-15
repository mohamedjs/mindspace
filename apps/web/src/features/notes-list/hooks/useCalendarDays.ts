'use client';
import { useCallback, useMemo, useState } from 'react';
import type { Note as StickyNoteData } from '../../../core/domain';
import { DAY_MS, noteDay, startOfDay, weekOf } from '../services/day';

/**
 * All the date state and bucketing the calendar tab needs, kept out of the
 * component so the rendering stays declarative and the maths stays testable
 * (see day.test.ts for the primitives underneath).
 */
export function useCalendarDays(notes: StickyNoteData[] | undefined) {
  const today = startOfDay(new Date());
  const [selectedDay, setSelectedDay] = useState(today);
  const [weekAnchor, setWeekAnchor] = useState(today);

  const week = useMemo(() => weekOf(weekAnchor), [weekAnchor]);

  const byDay = useMemo(() => {
    const map = new Map<number, StickyNoteData[]>();
    notes?.forEach((note) => {
      const day = noteDay(note);
      if (day === null) return;
      map.set(day, [...(map.get(day) ?? []), note]);
    });
    return map;
  }, [notes]);

  /**
   * The selected day's notes, top-level first. A sub-note whose parent is on
   * the same day is dropped here because the parent's row already renders it
   * nested — otherwise it would appear twice.
   */
  const dayNotes = useMemo(() => {
    const all = byDay.get(selectedDay) ?? [];
    const ids = new Set(all.map((n) => n.id));
    return all
      .filter((n) => !n.parentId || !ids.has(n.parentId))
      .sort((a, b) => ((a.dueAt ?? a.createdAt ?? '') < (b.dueAt ?? b.createdAt ?? '') ? -1 : 1));
  }, [byDay, selectedDay]);

  const shiftWeek = useCallback(
    (direction: -1 | 1) => {
      // Half-day offset so a DST boundary can't land the anchor a day out.
      const next = startOfDay(new Date(weekAnchor + direction * 7 * DAY_MS + DAY_MS / 2));
      setWeekAnchor(next);
      setSelectedDay(next);
    },
    [weekAnchor]
  );

  const jumpToToday = useCallback(() => {
    setSelectedDay(today);
    setWeekAnchor(today);
  }, [today]);

  const countFor = useCallback((day: number) => byDay.get(day)?.length ?? 0, [byDay]);

  return { today, selectedDay, setSelectedDay, week, dayNotes, countFor, shiftWeek, jumpToToday };
}
