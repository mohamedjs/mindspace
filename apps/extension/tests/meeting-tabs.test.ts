import { describe, it, expect } from 'vitest';
import { detectMeetingTitleFromTab, formatBadgeTime } from '../src/background.js';

describe('Meeting Tab Detection and Badge Timing', () => {
  describe('detectMeetingTitleFromTab', () => {
    it('detects Google Meet URLs and extracts meeting code without DOM scraping', () => {
      const title = detectMeetingTitleFromTab(
        'https://meet.google.com/abc-defg-hij',
        'Meet - abc-defg-hij'
      );
      expect(title).toBe('Google Meet (abc-defg-hij)');
    });

    it('detects Zoom web client URLs without DOM scraping', () => {
      const title1 = detectMeetingTitleFromTab(
        'https://app.zoom.us/wc/1234567890/join',
        'Zoom Meeting'
      );
      expect(title1).toBe('Zoom Meeting');

      const title2 = detectMeetingTitleFromTab(
        'https://pwa.zoom.us/wc/987654321/join',
        'Weekly Sync'
      );
      expect(title2).toBe('Zoom: Weekly Sync');
    });

    it('detects Microsoft Teams web URLs without DOM scraping', () => {
      const title1 = detectMeetingTitleFromTab(
        'https://teams.microsoft.com/v2/meet/1234',
        'Design Review | Microsoft Teams'
      );
      expect(title1).toBe('Design Review | Microsoft Teams');

      const title2 = detectMeetingTitleFromTab(
        'https://teams.live.com/meet/4567',
        'Sprint Retro'
      );
      expect(title2).toBe('Teams: Sprint Retro');
    });

    it('works in any generic tab with fallback to page title', () => {
      const title1 = detectMeetingTitleFromTab(
        'https://example.com/discussion',
        'Architecture Discussion'
      );
      expect(title1).toBe('Architecture Discussion');

      const title2 = detectMeetingTitleFromTab(undefined, undefined);
      expect(title2).toBe('Meeting');
    });
  });

  describe('formatBadgeTime', () => {
    it('formats seconds into m:ss for elapsed times under 10 minutes', () => {
      expect(formatBadgeTime(0)).toBe('0:00');
      expect(formatBadgeTime(5)).toBe('0:05');
      expect(formatBadgeTime(65)).toBe('1:05');
      expect(formatBadgeTime(599)).toBe('9:59');
    });

    it('formats into minutes format under 60 minutes', () => {
      expect(formatBadgeTime(600)).toBe('10m');
      expect(formatBadgeTime(1500)).toBe('25m');
      expect(formatBadgeTime(3599)).toBe('59m');
    });

    it('formats into hours format for 1 hour or more', () => {
      expect(formatBadgeTime(3600)).toBe('1h');
      expect(formatBadgeTime(7200)).toBe('2h');
    });

    it('ensures badge text never exceeds Chrome action badge 4-character limit', () => {
      const samples = [0, 5, 59, 60, 300, 599, 600, 3599, 3600, 7200, 36000];
      for (const s of samples) {
        expect(formatBadgeTime(s).length).toBeLessThanOrEqual(4);
      }
    });
  });
});
