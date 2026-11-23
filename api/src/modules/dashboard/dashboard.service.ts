import { CouncilCaseStatus, ScheduleStatus, type PrismaClient } from '@prisma/client';
import { AttendanceOverviewService } from '../attendance/attendance.overview';
import { resolveTerm } from '../../lib/rules';

export class DashboardService {
  constructor(private readonly db: PrismaClient) {}

  async summary(institutionId: string) {
    const term = await resolveTerm(this.db, institutionId);

    const [classes, students, teachers, courses, sessions, openCouncil, publishedPlan] =
      await Promise.all([
        this.db.schoolClass.count({ where: { institutionId } }),
        this.db.studentProfile.count({ where: { user: { institutionId } } }),
        this.db.teacherProfile.count({ where: { user: { institutionId } } }),
        this.db.course.count({ where: { institutionId } }),
        this.db.mockExamSession.count({ where: { institutionId } }),
        this.db.councilCase.count({
          where: { institutionId, status: CouncilCaseStatus.OPEN },
        }),
        this.db.schedulePlan.findFirst({
          where: { institutionId, termId: term.id, status: ScheduleStatus.PUBLISHED },
          select: { id: true, name: true },
        }),
      ]);

    const attendance = await new AttendanceOverviewService(this.db).overview(institutionId);
    const atRisk = attendance.rows.filter((row) => row.status !== 'OK').slice(0, 10);

    return {
      counts: { classes, students, teachers, courses, mockExamSessions: sessions },
      attendance: {
        limits: attendance.limits,
        failed: attendance.summary.failed,
        warning: attendance.summary.warning,
        atRisk,
      },
      council: { open: openCouncil },
      schedule: { published: Boolean(publishedPlan), planName: publishedPlan?.name ?? null },
      term: { id: term.id, name: term.name },
    };
  }
}
