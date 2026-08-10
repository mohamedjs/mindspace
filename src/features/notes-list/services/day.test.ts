import { DAY_MS, dayLabel, noteDay, startOfDay, weekOf } from './day';
import type { StickyNoteData } from '../../sticky-notes/components/StickyNoteItem';

const note = (fields: Partial<StickyNoteData>): StickyNoteData => ({
  id: 'n',
  content: 'c',
  type: 'idea',
  x: 0,
  y: 0,
  ...fields,
});

describe('startOfDay', () => {
  it('collapses every instant in a local day onto the same key', () => {
    const morning = new Date(2026, 7, 10, 0, 1);
    const night = new Date(2026, 7, 10, 23, 59);
    expect(startOfDay(morning)).toBe(startOfDay(night));
  });

  it('separates adjacent days', () => {
    expect(startOfDay(new Date(2026, 7, 10))).not.toBe(startOfDay(new Date(2026, 7, 11)));
  });
});

describe('noteDay', () => {
  it('uses the spoken due date when there is one', () => {
    const due = new Date(2026, 7, 11, 15).toISOString();
    const created = new Date(2026, 7, 10, 9).toISOString();
    expect(noteDay(note({ dueAt: due, createdAt: created }))).toBe(startOfDay(due));
  });

  it('falls back to when it was written, so undated notes still land somewhere', () => {
    const created = new Date(2026, 7, 10, 9).toISOString();
    expect(noteDay(note({ createdAt: created }))).toBe(startOfDay(created));
  });

  it('returns null when the note has neither', () => {
    expect(noteDay(note({}))).toBeNull();
  });
});

describe('weekOf', () => {
  it('returns seven consecutive days starting on Sunday', () => {
    // 2026-08-12 is a Wednesday.
    const week = weekOf(startOfDay(new Date(2026, 7, 12)));
    expect(week).toHaveLength(7);
    expect(new Date(week[0]).getDay()).toBe(0);
    for (let i = 1; i < week.length; i++) {
      expect(new Date(week[i]).getDay()).toBe(i);
      // Day-boundary math must not drift or duplicate across a DST change.
      expect(week[i]).toBeGreaterThan(week[i - 1]);
      expect(week[i] - week[i - 1]).toBeLessThanOrEqual(DAY_MS + 3600_000);
    }
  });

  it('contains the day it was asked about', () => {
    const day = startOfDay(new Date(2026, 7, 12));
    expect(weekOf(day)).toContain(day);
  });

  it('gives the same week for any day within it', () => {
    const wed = weekOf(startOfDay(new Date(2026, 7, 12)));
    const sat = weekOf(startOfDay(new Date(2026, 7, 15)));
    expect(wed).toEqual(sat);
  });
});

describe('dayLabel', () => {
  it('names the days around today in words', () => {
    const today = startOfDay(new Date());
    expect(dayLabel(today)).toBe('Today');
    expect(dayLabel(startOfDay(new Date(today + DAY_MS + DAY_MS / 2)))).toBe('Tomorrow');
    expect(dayLabel(startOfDay(new Date(today - DAY_MS / 2)))).toBe('Yesterday');
  });

  it('falls back to a real date further out', () => {
    const far = startOfDay(new Date(Date.now() + 30 * DAY_MS));
    expect(dayLabel(far)).not.toMatch(/Today|Tomorrow|Yesterday/);
  });
});
