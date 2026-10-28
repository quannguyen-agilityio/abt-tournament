import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatDay, formatMoney, formatNumber, formatTime } from './format';

// Intl may emit U+00A0 / U+202F; compare with plain spaces.
const norm = (s: string) => s.replace(/[  ]/g, ' ');

// 2027-05-16 01:30 in Asia/Ho_Chi_Minh (UTC+7), still the 15th in UTC.
const instant = new Date('2027-05-15T18:30:00Z');

describe('formatNumber', () => {
  it('uses locale separators', () => {
    expect(norm(formatNumber(1234567.5, 'vi'))).toBe('1.234.567,5');
    expect(norm(formatNumber(1234567.5, 'en'))).toBe('1,234,567.5');
  });
});

describe('formatMoney', () => {
  it('formats whole VND', () => {
    expect(norm(formatMoney(300000, 'vi'))).toBe('300.000 ₫');
    expect(norm(formatMoney(300000, 'en'))).toBe('₫300,000');
  });
});

describe('date and time in the season timezone', () => {
  it('rolls the date over to the ICT calendar day', () => {
    expect(formatDate(instant, 'vi')).toBe('16/05/2027');
    expect(formatDate(instant, 'en')).toBe('16/05/2027');
  });

  it('formats 24h time with an ICT label', () => {
    expect(formatTime(instant, 'vi')).toBe('01:30 ICT');
    expect(formatTime(instant, 'en')).toBe('01:30 ICT');
  });

  it('combines date and time', () => {
    expect(norm(formatDateTime(instant, 'vi'))).toBe('16/05/2027 01:30 ICT');
  });

  it('honours an explicit timezone', () => {
    expect(formatDate(instant, 'en', 'UTC')).toBe('15/05/2027');
  });
});

describe('formatDay', () => {
  it('shows the weekday of a calendar day, whatever the timezone', () => {
    expect(formatDay('2027-01-09', 'en')).toBe('Saturday 09/01');
    expect(formatDay('2027-01-09', 'vi')).toBe('Thứ Bảy, 09/01');
  });
});
