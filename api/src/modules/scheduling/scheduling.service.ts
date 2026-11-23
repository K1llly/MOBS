import { AvailabilityStatus, ScheduleStatus, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { ApiError } from '../../lib/errors';
import type { AuthPayload } from '../../lib/jwt';
import { getInstitution, resolveTerm } from '../../lib/rules';
import { autoSchedule, splitHours, type PlacedSlot, type SchedulerBlock } from './scheduler';

export const availabilitySlotSchema = z.object({
  dayOfWeek: z.coerce.number().int().min(1).max(7),
  period: z.coerce.number().int().min(1).max(12),
  status: z.nativeEnum(AvailabilityStatus),
});

export const setAvailabilitySchema = z.object({
  slots: z.array(availabilitySlotSchema).max(84),
});

export const autoFillSchema = z.object({
  termId: z.string().optional(),
  planName: z.string().min(1).max(80).default('Ana Program'),
});

const PLAN_NAME = 'Ana Program';

export class SchedulingService {
  constructor(private readonly db: PrismaClient) {}

  async getTeacherProfile(institutionId: string, userId: string) {
    const teacher = await this.db.teacherProfile.findFirst({
      where: { userId, user: { institutionId } },
      include: { user: true },
    });
    if (!teacher) throw ApiError.notFound('TEACHER_NOT_FOUND', 'Öğretmen profili bulunamadı');
    return teacher;
  }

  async getAvailability(institutionId: string, teacherId: string) {
    const teacher = await this.db.teacherProfile.findFirst({
      where: { id: teacherId, user: { institutionId } },
      include: { user: true },
    });
    if (!teacher) throw ApiError.notFound('TEACHER_NOT_FOUND', 'Öğretmen bulunamadı');

    const slots = await this.db.teacherAvailability.findMany({
      where: { teacherId },
      orderBy: [{ dayOfWeek: 'asc' }, { period: 'asc' }],
    });

    return { teacherId, fullName: teacher.user.fullName, slots };
  }

  async setAvailability(
    institutionId: string,
    teacherId: string,
    slots: Array<z.infer<typeof availabilitySlotSchema>>,
  ) {
    const teacher = await this.db.teacherProfile.findFirst({
      where: { id: teacherId, user: { institutionId } },
    });
    if (!teacher) throw ApiError.notFound('TEACHER_NOT_FOUND', 'Öğretmen bulunamadı');

    const seen = new Set<string>();
    for (const slot of slots) {
      const key = `${slot.dayOfWeek}:${slot.period}`;
      if (seen.has(key)) {
        throw ApiError.badRequest('DUPLICATE_SLOT', 'Aynı gün/saat için birden fazla kayıt gönderilemez');
      }
      seen.add(key);
    }

    await this.db.$transaction(async (tx) => {
      await tx.teacherAvailability.deleteMany({ where: { teacherId } });
      if (slots.length > 0) {
        await tx.teacherAvailability.createMany({
          data: slots.map((slot) => ({
            teacherId,
            dayOfWeek: slot.dayOfWeek,
            period: slot.period,
            status: slot.status,
          })),
        });
      }
    });

    return this.getAvailability(institutionId, teacherId);
  }

  async getSchedule(institutionId: string, actor: AuthPayload, termId?: string) {
    const term = await resolveTerm(this.db, institutionId, termId);
    const plan = await this.db.schedulePlan.findFirst({
      where: { termId: term.id, name: PLAN_NAME, institutionId },
      include: {
        slots: {
          include: {
            classCourse: { include: { course: true, schoolClass: true } },
            teacher: { include: { user: true } },
            room: true,
          },
          orderBy: [{ dayOfWeek: 'asc' }, { period: 'asc' }],
        },
      },
    });

    const teacherProfile =
      actor.role === 'TEACHER'
        ? await this.db.teacherProfile.findUnique({ where: { userId: actor.sub } })
        : null;

    const slots = (plan?.slots ?? [])
      .filter((slot) =>
        actor.role === 'TEACHER' ? slot.teacherId === teacherProfile?.id : true,
      )
      .map((slot) => ({
        id: slot.id,
        dayOfWeek: slot.dayOfWeek,
        period: slot.period,
        isPinned: slot.isPinned,
        classId: slot.classCourse.schoolClassId,
        className: slot.classCourse.schoolClass.name,
        courseId: slot.classCourse.courseId,
        courseName: slot.classCourse.course.name,
        teacherId: slot.teacherId,
        teacherName: slot.teacher?.user.fullName ?? null,
        roomName: slot.room?.name ?? null,
      }));

    return {
      term: { id: term.id, name: term.name },
      plan: plan ? { id: plan.id, name: plan.name, status: plan.status } : null,
      slots,
    };
  }

  /** US-05 / FR-SCH-04 — Hibrit otomatik doldurma. */
  async autoFill(institutionId: string, input: z.infer<typeof autoFillSchema>) {
    const institution = await getInstitution(this.db, institutionId);
    const term = await resolveTerm(this.db, institutionId, input.termId);
    const planName = input.planName || PLAN_NAME;

    const plan = await this.db.schedulePlan.upsert({
      where: { termId_name: { termId: term.id, name: planName } },
      create: { institutionId, termId: term.id, name: planName, status: ScheduleStatus.DRAFT },
      update: {},
    });

    const [classCourses, availabilityRows, pinnedRows] = await Promise.all([
      this.db.classCourse.findMany({
        where: { schoolClass: { institutionId } },
        include: {
          course: true,
          schoolClass: { include: { homeRoom: true } },
        },
      }),
      this.db.teacherAvailability.findMany({
        where: { teacher: { user: { institutionId } } },
      }),
      this.db.scheduleSlot.findMany({
        where: { planId: plan.id, isPinned: true },
        include: { classCourse: { select: { schoolClassId: true } } },
      }),
    ]);

    const availability: Record<string, AvailabilityStatus> = {};
    for (const row of availabilityRows) {
      availability[`${row.teacherId}:${row.dayOfWeek}:${row.period}`] = row.status;
    }

    const blocks: SchedulerBlock[] = [];
    for (const classCourse of classCourses) {
      const pattern =
        classCourse.blockPattern.length > 0
          ? classCourse.blockPattern
          : splitHours(classCourse.weeklyHours);

      if (pattern.reduce((total, hours) => total + hours, 0) !== classCourse.weeklyHours) {
        // Blok deseni toplam saatle uyuşmuyorsa güvenli bölünmeye düş.
        pattern.splice(0, pattern.length, ...splitHours(classCourse.weeklyHours));
      }

      pattern.forEach((hours, index) => {
        blocks.push({
          id: `${classCourse.id}#${index}`,
          label: `${classCourse.schoolClass.name} · ${classCourse.course.name}`,
          classId: classCourse.schoolClassId,
          teacherId: classCourse.teacherId,
          roomId: classCourse.schoolClass.homeRoomId,
          hours,
          groupKey: classCourse.id,
        });
      });
    }

    const pinned: PlacedSlot[] = pinnedRows.map((row) => ({
      blockId: `pinned:${row.id}`,
      classId: row.classCourse.schoolClassId,
      teacherId: row.teacherId,
      roomId: row.roomId,
      day: row.dayOfWeek,
      period: row.period,
    }));

    const result = autoSchedule({
      dailyPeriodCount: institution.dailyPeriodCount,
      days: [1, 2, 3, 4, 5],
      blocks,
      availability,
      pinned,
    });

    await this.db.$transaction(async (tx) => {
      await tx.scheduleSlot.deleteMany({ where: { planId: plan.id, isPinned: false } });

      if (result.placed.length > 0) {
        await tx.scheduleSlot.createMany({
          data: result.placed.map((slot) => ({
            planId: plan.id,
            classCourseId: slot.blockId.split('#')[0]!,
            teacherId: slot.teacherId,
            roomId: slot.roomId,
            dayOfWeek: slot.day,
            period: slot.period,
            isPinned: false,
          })),
        });
      }

      await tx.schedulePlan.update({ where: { id: plan.id }, data: { status: ScheduleStatus.DRAFT } });
    });

    return {
      planId: plan.id,
      planName: plan.name,
      placedCount: result.placed.length,
      placed: result.placed.map((slot) => ({
        ...slot,
        classCourseId: slot.blockId.split('#')[0]!,
      })),
      unplaced: result.unplaced.map((item) => ({
        ...item,
        classCourseId: item.blockId.split('#')[0]!,
      })),
    };
  }

  async publish(institutionId: string, planId: string) {
    const plan = await this.db.schedulePlan.findFirst({
      where: { id: planId, institutionId },
      include: { _count: { select: { slots: true } } },
    });
    if (!plan) throw ApiError.notFound('PLAN_NOT_FOUND', 'Ders programı bulunamadı');
    if (plan._count.slots === 0) {
      throw ApiError.badRequest('EMPTY_SCHEDULE', 'Boş bir ders programı yayınlanamaz');
    }

    await this.db.schedulePlan.update({
      where: { id: planId },
      data: { status: ScheduleStatus.PUBLISHED },
    });

    return { planId, status: ScheduleStatus.PUBLISHED, slotCount: plan._count.slots };
  }

  async pinSlot(institutionId: string, slotId: string, isPinned: boolean) {
    const slot = await this.db.scheduleSlot.findFirst({
      where: { id: slotId, plan: { institutionId } },
    });
    if (!slot) throw ApiError.notFound('SLOT_NOT_FOUND', 'Ders saati bulunamadı');

    await this.db.scheduleSlot.update({ where: { id: slotId }, data: { isPinned } });
    return { id: slotId, isPinned };
  }
}