import { AttendanceStatus, type PrismaClient } from '@prisma/client';
import { loadRules, resolveTerm, ruleNumber } from '../../lib/rules';
import { evaluateAbsence } from '../grading/grading.strategies';

export interface AttendanceOverviewRow {
  studentId: string;
  fullName: string;
  studentNumber: string;
  classId: string | null;
  className: string | null;
  unexcused: number;
  excused: number;
  total: number;
  status: 'OK' | 'WARNING' | 'FAILED';
  reason?: string;
}

export class AttendanceOverviewService {
  constructor(private readonly db: PrismaClient) {}

  /** Yönetici için tüm öğrencilerin devamsızlık risk tablosu. */
  async overview(institutionId: string, classId?: string) {
    const term = await resolveTerm(this.db, institutionId);
    const rules = await loadRules(this.db, institutionId);
    const unexcusedLimit = ruleNumber(rules, 'unexcusedAbsenceLimit', 10);
    const totalLimit = ruleNumber(rules, 'totalAbsenceLimit', 30);

    const students = await this.db.studentProfile.findMany({
      where: {
        user: { institutionId },
        ...(classId ? { schoolClassId: classId } : {}),
      },
      include: { user: true, schoolClass: true },
      orderBy: { studentNumber: 'asc' },
    });

    const grouped = await this.db.attendanceRecord.groupBy({
      by: ['studentId', 'status'],
      where: {
        date: { gte: term.startDate, lte: term.endDate },
        student: { user: { institutionId } },
      },
      _count: { _all: true },
    });

    const counts = new Map<string, { unexcused: number; excused: number }>();
    for (const row of grouped) {
      const current = counts.get(row.studentId) ?? { unexcused: 0, excused: 0 };
      if (row.status === AttendanceStatus.ABSENT) current.unexcused += row._count._all;
      if (row.status === AttendanceStatus.EXCUSED) current.excused += row._count._all;
      counts.set(row.studentId, current);
    }

    const rows: AttendanceOverviewRow[] = students.map((student) => {
      const count = counts.get(student.id) ?? { unexcused: 0, excused: 0 };
      const result = evaluateAbsence(count, { unexcusedLimit, totalLimit });
      return {
        studentId: student.id,
        fullName: student.user.fullName,
        studentNumber: student.studentNumber,
        classId: student.schoolClassId,
        className: student.schoolClass?.name ?? null,
        unexcused: count.unexcused,
        excused: count.excused,
        total: result.total,
        status: result.status,
        reason: result.reason,
      };
    });

    rows.sort((a, b) => b.unexcused - a.unexcused || b.total - a.total);

    return {
      term: { id: term.id, name: term.name },
      limits: { unexcusedLimit, totalLimit },
      rows,
      summary: {
        total: rows.length,
        failed: rows.filter((row) => row.status === 'FAILED').length,
        warning: rows.filter((row) => row.status === 'WARNING').length,
      },
    };
  }
}
