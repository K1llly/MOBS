import { AvailabilityStatus } from '@prisma/client';

export interface SchedulerBlock {
  id: string;
  label?: string;
  classId: string;
  teacherId?: string | null;
  roomId?: string | null;
  /** Blok uzunluğu (saat). Aynı gün içinde kesintisiz yerleştirilir. */
  hours: number;
  /**
   * Aynı gruptaki bloklar (ör. 3 + 3) farklı günlere dağıtılır.
   * FR-SCH-05.4
   */
  groupKey?: string;
  preferredDays?: number[];
}

export interface PlacedSlot {
  blockId: string;
  classId: string;
  teacherId?: string | null;
  roomId?: string | null;
  day: number;
  period: number;
}

export type UnplacedReason =
  | 'INSUFFICIENT_TEACHER_AVAILABILITY'
  | 'NO_CONTIGUOUS_FREE_SLOT'
  | 'INVALID_BLOCK';

export interface UnplacedBlock {
  blockId: string;
  label: string;
  reason: UnplacedReason;
}

export interface SchedulerRequest {
  dailyPeriodCount: number;
  /** 1 = Pazartesi ... 5 = Cuma (varsayılan) */
  days?: number[];
  blocks: SchedulerBlock[];
  /** `${teacherId}:${day}:${period}` -> durum */
  availability?: Record<string, AvailabilityStatus>;
  /** Manuel yerleştirilmiş / kilitli slotlar (hard lock). */
  pinned?: PlacedSlot[];
  /** DFS düğüm bütçesi (kötü senaryolarda sonsuz aramayı engeller). */
  maxSearchNodes?: number;
}

export interface SchedulerResult {
  placed: PlacedSlot[];
  unplaced: UnplacedBlock[];
}

interface SlotState {
  placed: PlacedSlot[];
  classKeys: Set<string>;
  teacherKeys: Set<string>;
  roomKeys: Set<string>;
  groupDayKeys: Set<string>;
}

const slotKey = (a: string, b: number, c: number) => `${a}:${b}:${c}`;

export function teacherSlotKey(teacherId: string, day: number, period: number): string {
  return `${teacherId}:${day}:${period}`;
}

/**
 * US-05 / FR-SCH-04 — Hibrit otomatik ders programı.
 * Kilitli slotlara dokunmadan, kalan blokları kısıt sağlama (DFS + geri izleme)
 * ile yerleştirir. Çözümsüz kalan bloklar nedeniyle birlikte raporlanır
 * (FR-SCH-06), sistem hata fırlatmaz.
 */
export function autoSchedule(request: SchedulerRequest): SchedulerResult {
  const days = request.days ?? [1, 2, 3, 4, 5];
  const availability = request.availability ?? {};
  const maxNodes = request.maxSearchNodes ?? 50_000;

  const state = emptyState();

  for (const pinned of request.pinned ?? []) {
    occupy(state, pinned);
  }

  const blocks = [...request.blocks].sort(
    (a, b) =>
      b.hours - a.hours ||
      Number(Boolean(b.teacherId)) - Number(Boolean(a.teacherId)) ||
      a.id.localeCompare(b.id),
  );

  const pinnedSlots = request.pinned ?? [];
  let nodes = 0;

  /**
   * Faz 1 — Tam yerleşim için geri izlemeli arama (place-first).
   * Her blok için en uygun adaydan başlanır; çıkmazda geri dönülür.
   */
  const tryPlace = (index: number): boolean => {
    if (nodes++ > maxNodes) return false;
    if (index === blocks.length) return true;

    const block = blocks[index]!;
    for (const candidate of candidatesFor(
      block,
      state,
      days,
      availability,
      request.dailyPeriodCount,
    )) {
      const slots = materialize(block, candidate.day, candidate.start);
      slots.forEach((slot) => occupy(state, slot, block.groupKey));
      if (tryPlace(index + 1)) return true;
      slots.forEach((slot) => release(state, slot, block.groupKey));
    }
    return false;
  };

  if (tryPlace(0)) {
    return { placed: state.placed.slice(pinnedSlots.length), unplaced: [] };
  }

  /**
   * Faz 2 — Zaman/çözüm sınırı aşılırsa en iyi çaba (greedy).
   * Kalan bloklar çakışmasız en uygun slota yerleştirilir; sığmayanlar raporlanır.
   */
  for (const pinned of pinnedSlots) {
    state.placed = state.placed.filter((slot) => slot !== pinned);
  }
  for (const pinned of pinnedSlots) {
    state.placed = state.placed.filter((slot) => slot !== pinned);
  }
  resetState(state, pinnedSlots);

  const placed: PlacedSlot[] = [];
  const unplaced: UnplacedBlock[] = [];

  for (const block of blocks) {
    const [candidate] = candidatesFor(block, state, days, availability, request.dailyPeriodCount);
    if (!candidate) {
      unplaced.push({
        blockId: block.id,
        label: block.label ?? block.id,
        reason: diagnose(block, state, days, availability, request.dailyPeriodCount),
      });
      continue;
    }

    const slots = materialize(block, candidate.day, candidate.start);
    slots.forEach((slot) => occupy(state, slot, block.groupKey));
    placed.push(...slots);
  }

  return { placed, unplaced };
}

/**
 * FR-SCH-05 — Manuel yerleştirme öncesi zorunlu çakışma kontrolleri.
 * Dönen liste boşsa yerleştirme güvenlidir.
 */
export function validatePlacement(
  candidate: PlacedSlot,
  existing: PlacedSlot[],
  options: { hours?: number; availability?: Record<string, AvailabilityStatus> } = {},
): string[] {
  const conflicts: string[] = [];
  const hours = options.hours ?? 1;

  for (let offset = 0; offset < hours; offset++) {
    const period = candidate.period + offset;

    if (candidate.teacherId) {
      const status = options.availability?.[teacherSlotKey(candidate.teacherId, candidate.day, period)];
      if (status === AvailabilityStatus.UNAVAILABLE) {
        conflicts.push('TEACHER_UNAVAILABLE');
      }
    }

    for (const slot of existing) {
      if (slot.day !== candidate.day) continue;
      if (slot.period !== period) continue;

      if (slot.classId === candidate.classId) conflicts.push('CLASS_CONFLICT');
      if (candidate.teacherId && slot.teacherId === candidate.teacherId) conflicts.push('TEACHER_CONFLICT');
      if (candidate.roomId && slot.roomId === candidate.roomId) conflicts.push('ROOM_CONFLICT');
    }
  }

  return [...new Set(conflicts)];
}

interface Candidate {
  day: number;
  start: number;
  score: number;
}

function candidatesFor(
  block: SchedulerBlock,
  state: SlotState,
  days: number[],
  availability: Record<string, AvailabilityStatus>,
  dailyPeriodCount: number,
): Candidate[] {
  const candidates: Candidate[] = [];
  const hours = Math.max(1, Math.trunc(block.hours));

  for (const day of days) {
    if (block.groupKey && state.groupDayKeys.has(`${block.groupKey}:${day}`)) continue;

    for (let start = 1; start + hours - 1 <= dailyPeriodCount; start++) {
      if (!rangeFree(block, day, start, hours, state, availability)) continue;
      candidates.push({ day, start, score: scoreCandidate(block, day, start, hours, availability) });
    }
  }

  return candidates.sort((a, b) => a.score - b.score || a.day - b.day || a.start - b.start);
}

function rangeFree(
  block: SchedulerBlock,
  day: number,
  start: number,
  hours: number,
  state: SlotState,
  availability: Record<string, AvailabilityStatus>,
): boolean {
  for (let offset = 0; offset < hours; offset++) {
    const period = start + offset;
    if (state.classKeys.has(slotKey(block.classId, day, period))) return false;
    if (block.teacherId) {
      if (state.teacherKeys.has(slotKey(block.teacherId, day, period))) return false;
      if (availability[teacherSlotKey(block.teacherId, day, period)] === AvailabilityStatus.UNAVAILABLE) {
        return false;
      }
    }
    if (block.roomId && state.roomKeys.has(slotKey(block.roomId, day, period))) return false;
  }
  return true;
}

function scoreCandidate(
  block: SchedulerBlock,
  day: number,
  start: number,
  hours: number,
  availability: Record<string, AvailabilityStatus>,
): number {
  let score = start; // erken saatler hafif tercih edilir

  if (block.preferredDays?.includes(day)) score -= 100;

  if (block.teacherId) {
    for (let offset = 0; offset < hours; offset++) {
      const status = availability[teacherSlotKey(block.teacherId, day, start + offset)];
      if (status === AvailabilityStatus.PREFER_NOT) score += 25;
    }
  }

  return score;
}

function materialize(block: SchedulerBlock, day: number, start: number): PlacedSlot[] {
  const hours = Math.max(1, Math.trunc(block.hours));
  return Array.from({ length: hours }, (_, offset) => ({
    blockId: block.id,
    classId: block.classId,
    teacherId: block.teacherId ?? null,
    roomId: block.roomId ?? null,
    day,
    period: start + offset,
  }));
}

function emptyState(): SlotState {
  return {
    placed: [],
    classKeys: new Set(),
    teacherKeys: new Set(),
    roomKeys: new Set(),
    groupDayKeys: new Set(),
  };
}

function resetState(state: SlotState, pinned: PlacedSlot[]): void {
  state.placed = [];
  state.classKeys.clear();
  state.teacherKeys.clear();
  state.roomKeys.clear();
  state.groupDayKeys.clear();
  for (const slot of pinned) {
    state.classKeys.add(slotKey(slot.classId, slot.day, slot.period));
    if (slot.teacherId) state.teacherKeys.add(slotKey(slot.teacherId, slot.day, slot.period));
    if (slot.roomId) state.roomKeys.add(slotKey(slot.roomId, slot.day, slot.period));
  }
}

function occupy(state: SlotState, slot: PlacedSlot, groupKey?: string): void {
  state.placed.push(slot);
  state.classKeys.add(slotKey(slot.classId, slot.day, slot.period));
  if (slot.teacherId) state.teacherKeys.add(slotKey(slot.teacherId, slot.day, slot.period));
  if (slot.roomId) state.roomKeys.add(slotKey(slot.roomId, slot.day, slot.period));
  if (groupKey) state.groupDayKeys.add(`${groupKey}:${slot.day}`);
}

function release(state: SlotState, slot: PlacedSlot, groupKey?: string): void {
  const index = state.placed.indexOf(slot);
  if (index >= 0) state.placed.splice(index, 1);
  state.classKeys.delete(slotKey(slot.classId, slot.day, slot.period));
  if (slot.teacherId) state.teacherKeys.delete(slotKey(slot.teacherId, slot.day, slot.period));
  if (slot.roomId) state.roomKeys.delete(slotKey(slot.roomId, slot.day, slot.period));
  if (groupKey) state.groupDayKeys.delete(`${groupKey}:${slot.day}`);
}

function diagnose(
  block: SchedulerBlock,
  state: SlotState,
  days: number[],
  availability: Record<string, AvailabilityStatus>,
  dailyPeriodCount: number,
): UnplacedReason {
  if (!Number.isFinite(block.hours) || block.hours < 1 || block.hours > dailyPeriodCount) {
    return 'INVALID_BLOCK';
  }

  if (block.teacherId) {
    const availableSlots = days.reduce((total, day) => {
      let count = 0;
      for (let period = 1; period <= dailyPeriodCount; period++) {
        if (availability[teacherSlotKey(block.teacherId!, day, period)] !== AvailabilityStatus.UNAVAILABLE) {
          count += 1;
        }
      }
      return total + count;
    }, 0);

    if (availableSlots === 0) return 'INSUFFICIENT_TEACHER_AVAILABILITY';
  }

  const hasAnyCandidate = candidatesFor(block, state, days, availability, dailyPeriodCount).length > 0;
  return hasAnyCandidate ? 'NO_CONTIGUOUS_FREE_SLOT' : 'NO_CONTIGUOUS_FREE_SLOT';
}

/**
 * Haftalık ders saatini bloklara böler. 6 saat -> [2,2,2], 5 -> [3,2],
 * 3 -> [3] (tek blok aynı gün içinde kesintisiz yerleşir).
 */
export function splitHours(hours: number): number[] {
  if (hours <= 0) return [];
  if (hours <= 3) return [hours];

  const blocks: number[] = [];
  let remaining = hours;
  while (remaining > 0) {
    if (remaining === 4) {
      blocks.push(2, 2);
      break;
    }
    const chunk = Math.min(3, remaining);
    blocks.push(chunk);
    remaining -= chunk;
  }
  return blocks;
}
