import { describe, expect, it } from 'vitest';
import { AvailabilityStatus } from '@prisma/client';
import { autoSchedule, splitHours, teacherSlotKey, validatePlacement, type PlacedSlot } from './scheduler';

const block = (overrides: Partial<Parameters<typeof autoSchedule>[0]['blocks'][number]> = {}) => ({
  id: 'b1',
  classId: '10-A',
  teacherId: 't1',
  roomId: 'r1',
  hours: 2,
  ...overrides,
});

describe('Hibrit otomatik ders programı', () => {
  it('blokları çakışmasız yerleştirir', () => {
    const result = autoSchedule({
      dailyPeriodCount: 6,
      blocks: [
        block({ id: 'mat', classId: '10-A', teacherId: 't1', roomId: 'r1' }),
        block({ id: 'fiz', classId: '10-A', teacherId: 't2', roomId: 'r1', hours: 1 }),
        block({ id: 'kim', classId: '10-B', teacherId: 't1', roomId: 'r2', hours: 1 }),
      ],
    });

    expect(result.unplaced).toHaveLength(0);
    expect(result.placed).toHaveLength(4);
    expect(new Set(result.placed.map((slot) => `${slot.classId}:${slot.day}:${slot.period}`)).size).toBe(4);
  });

  it('aynı öğretmeni aynı saatte iki sınıfa atamaz', () => {
    const result = autoSchedule({
      dailyPeriodCount: 1,
      days: [1],
      blocks: [
        block({ id: 'a', classId: '10-A', teacherId: 't1', roomId: null, hours: 1 }),
        block({ id: 'b', classId: '10-B', teacherId: 't1', roomId: null, hours: 1 }),
      ],
    });

    expect(result.placed).toHaveLength(1);
    expect(result.unplaced).toHaveLength(1);
    expect(result.unplaced[0]!.reason).toBe('NO_CONTIGUOUS_FREE_SLOT');
  });

  it('UNAVAILABLE saatlere ders koymaz', () => {
    const availability = {
      [teacherSlotKey('t1', 1, 1)]: AvailabilityStatus.UNAVAILABLE,
      [teacherSlotKey('t1', 1, 2)]: AvailabilityStatus.UNAVAILABLE,
    };

    const result = autoSchedule({
      dailyPeriodCount: 2,
      days: [1],
      availability,
      blocks: [block({ classId: '10-A', teacherId: 't1', roomId: null, hours: 1 })],
    });

    expect(result.unplaced).toHaveLength(1);
    expect(result.unplaced[0]!.reason).toBe('INSUFFICIENT_TEACHER_AVAILABILITY');
  });

  it('kilitli (pinned) slotlara dokunmaz', () => {
    const pinned: PlacedSlot[] = [
      { blockId: 'pinned', classId: '10-A', teacherId: 't1', roomId: 'r1', day: 1, period: 1 },
    ];

    const result = autoSchedule({
      dailyPeriodCount: 2,
      days: [1],
      pinned,
      blocks: [block({ id: 'new', classId: '10-A', teacherId: 't2', roomId: 'r2', hours: 1 })],
    });

    expect(result.placed).toEqual([
      expect.objectContaining({ blockId: 'new', day: 1, period: 2 }),
    ]);
  });

  it('3+3 bloklarını aynı güne koymaz (FR-SCH-05.4)', () => {
    const result = autoSchedule({
      dailyPeriodCount: 7,
      days: [1, 2],
      blocks: [
        block({ id: 'b1', groupKey: 'mat-10a', hours: 3, roomId: null }),
        block({ id: 'b2', groupKey: 'mat-10a', hours: 3, roomId: null }),
      ],
    });

    expect(result.unplaced).toHaveLength(0);
    const days = new Set(result.placed.map((slot) => slot.day));
    expect(days.size).toBe(2);
  });

  it('sığmayan bloğu sebebiyle raporlar, hata fırlatmaz (FR-SCH-06)', () => {
    const result = autoSchedule({
      dailyPeriodCount: 4,
      days: [1],
      blocks: [block({ hours: 8 })],
    });

    expect(result.placed).toHaveLength(0);
    expect(result.unplaced[0]!.reason).toBe('INVALID_BLOCK');
  });

  it('manuel yerleştirme çakışmalarını tespit eder', () => {
    const existing: PlacedSlot[] = [
      { blockId: 'x', classId: '10-A', teacherId: 't1', roomId: 'r1', day: 1, period: 1 },
    ];

    expect(
      validatePlacement(
        { blockId: 'y', classId: '10-A', teacherId: 't2', roomId: 'r2', day: 1, period: 1 },
        existing,
      ),
    ).toContain('CLASS_CONFLICT');

    expect(
      validatePlacement(
        { blockId: 'y', classId: '10-B', teacherId: 't1', roomId: 'r2', day: 1, period: 1 },
        existing,
      ),
    ).toContain('TEACHER_CONFLICT');

    expect(
      validatePlacement(
        { blockId: 'y', classId: '10-B', teacherId: 't3', roomId: 'r1', day: 1, period: 1 },
        existing,
      ),
    ).toContain('ROOM_CONFLICT');

    expect(
      validatePlacement(
        { blockId: 'y', classId: '10-B', teacherId: 't1', roomId: 'r2', day: 1, period: 3 },
        existing,
        { availability: { [teacherSlotKey('t1', 1, 3)]: AvailabilityStatus.UNAVAILABLE } },
      ),
    ).toContain('TEACHER_UNAVAILABLE');
  });
});

describe('Haftalık saatlerin bloklara bölünmesi', () => {
  it('6 saati 3+3, 5 saati 3+2, 3 saati tek blok olarak böler', () => {
    expect(splitHours(6)).toEqual([3, 3]);
    expect(splitHours(5)).toEqual([3, 2]);
    expect(splitHours(4)).toEqual([2, 2]);
    expect(splitHours(3)).toEqual([3]);
    expect(splitHours(1)).toEqual([1]);
    expect(splitHours(0)).toEqual([]);
  });

  it('her durumda toplam saat korunur', () => {
    for (let hours = 1; hours <= 20; hours++) {
      expect(splitHours(hours).reduce((total, value) => total + value, 0)).toBe(hours);
    }
  });
});
