import 'dotenv/config';
import { AttendanceStatus, GradeType, PrismaClient, Role, TermType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { computeMockResult } from '../src/modules/mock-exam/mock-exam.calc';

const prisma = new PrismaClient();

const PASSWORD = 'demo-sifre-123';

async function main() {
  const institution = await prisma.institutionConfig.findFirst({ where: { isInitialized: true } });
  if (!institution) {
    throw new Error('Önce /setup ile kurulum yapılmalı (isInitialized: true).');
  }

  const existing = await prisma.course.count({ where: { institutionId: institution.id } });
  if (existing > 0) {
    console.log('[seed] Dersler zaten var, seed atlandı.');
    return;
  }

  console.log(`[seed] ${institution.name} (${institution.type}) için demo veri üretiliyor…`);

  const gradeLevels = await prisma.gradeLevel.findMany({ where: { institutionId: institution.id } });
  const level9 = gradeLevels.find((level) => level.level === 9) ?? gradeLevels[0];

  const roomA = await prisma.room.create({
    data: { institutionId: institution.id, name: '9-A Dersliği', capacity: 30 },
  });
  const roomB = await prisma.room.create({
    data: { institutionId: institution.id, name: '9-B Dersliği', capacity: 30 },
  });

  const classA = await prisma.schoolClass.create({
    data: {
      institutionId: institution.id,
      gradeLevelId: level9?.id,
      name: '9-A',
      capacity: 12,
      homeRoomId: roomA.id,
    },
  });
  const classB = await prisma.schoolClass.create({
    data: {
      institutionId: institution.id,
      gradeLevelId: level9?.id,
      name: '9-B',
      capacity: 12,
      homeRoomId: roomB.id,
    },
  });

  const courseSeed = [
    { code: 'TDE', name: 'Türk Dili ve Edebiyatı', weeklyHours: 5, isBarrier: true, blockPattern: [3, 2] },
    { code: 'MAT', name: 'Matematik', weeklyHours: 6, isBarrier: false, blockPattern: [3, 3] },
    { code: 'FIZ', name: 'Fizik', weeklyHours: 2, isBarrier: false, blockPattern: [2] },
    { code: 'KIM', name: 'Kimya', weeklyHours: 2, isBarrier: false, blockPattern: [2] },
    { code: 'BIO', name: 'Biyoloji', weeklyHours: 2, isBarrier: false, blockPattern: [2] },
    { code: 'TAR', name: 'Tarih', weeklyHours: 2, isBarrier: false, blockPattern: [2] },
    { code: 'ENG', name: 'İngilizce', weeklyHours: 4, isBarrier: false, blockPattern: [2, 2] },
  ];

  const courses = new Map<string, { id: string; weeklyHours: number; blockPattern: number[] }>();
  for (const item of courseSeed) {
    const course = await prisma.course.create({
      data: {
        institutionId: institution.id,
        code: item.code,
        name: item.name,
        weeklyHours: item.weeklyHours,
        isBarrier: item.isBarrier,
      },
    });
    courses.set(item.code, { id: course.id, weeklyHours: item.weeklyHours, blockPattern: item.blockPattern });
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const teacherSeed = [
    { username: 'ayse', fullName: 'Ayşe Yılmaz', branch: 'Türk Dili ve Edebiyatı', courses: ['TDE'] },
    { username: 'mehmet', fullName: 'Mehmet Demir', branch: 'Matematik', courses: ['MAT'] },
    { username: 'ali', fullName: 'Ali Çelik', branch: 'Matematik', courses: ['MAT'] },
    { username: 'zeynep', fullName: 'Zeynep Kaya', branch: 'Fen Bilimleri', courses: ['FIZ', 'KIM', 'BIO'] },
    { username: 'elif', fullName: 'Elif Şahin', branch: 'Tarih', courses: ['TAR'] },
    { username: 'burak', fullName: 'Burak Aydın', branch: 'İngilizce', courses: ['ENG'] },
  ];

  const teacherProfiles = new Map<string, string>();
  for (const item of teacherSeed) {
    const user = await prisma.user.upsert({
      where: { username: item.username },
      update: {},
      create: {
        institutionId: institution.id,
        username: item.username,
        passwordHash,
        fullName: item.fullName,
        role: Role.TEACHER,
        teacherProfile: { create: { branch: item.branch } },
      },
      include: { teacherProfile: true },
    });
    if (user.teacherProfile) teacherProfiles.set(item.username, user.teacherProfile.id);
  }

  // Ders kataloğu -> öğretmen havuzu (bir derse birden fazla öğretmen atanabilir)
  for (const item of teacherSeed) {
    for (const code of item.courses) {
      await prisma.courseTeacher.create({
        data: {
          courseId: courses.get(code)!.id,
          teacherId: teacherProfiles.get(item.username)!,
        },
      });
    }
  }

  // Şube -> ders -> öğretmen (havuzdan seçilir)
  const classCourseSeed = [
    { classId: classA.id, code: 'TDE', teacher: 'ayse' },
    { classId: classA.id, code: 'MAT', teacher: 'mehmet' },
    { classId: classA.id, code: 'FIZ', teacher: 'zeynep' },
    { classId: classA.id, code: 'KIM', teacher: 'zeynep' },
    { classId: classA.id, code: 'BIO', teacher: 'zeynep' },
    { classId: classA.id, code: 'TAR', teacher: 'elif' },
    { classId: classA.id, code: 'ENG', teacher: 'burak' },
    { classId: classB.id, code: 'TDE', teacher: 'ayse' },
    { classId: classB.id, code: 'MAT', teacher: 'ali' },
    { classId: classB.id, code: 'ENG', teacher: 'burak' },
  ];

  for (const item of classCourseSeed) {
    const course = courses.get(item.code)!;
    await prisma.classCourse.create({
      data: {
        schoolClassId: item.classId,
        courseId: course.id,
        teacherId: teacherProfiles.get(item.teacher),
        weeklyHours: course.weeklyHours,
        blockPattern: course.blockPattern,
      },
    });
  }

  // Öğretmen müsaitliği: Cuma son iki saat tenefits
  for (const teacherId of teacherProfiles.values()) {
    for (const period of [7, 8]) {
      await prisma.teacherAvailability.create({
        data: {
          teacherId,
          dayOfWeek: 5,
          period,
          status: 'UNAVAILABLE',
        },
      });
    }
  }

  const studentSeed = [
    { username: 'ogr1', fullName: 'Deniz Ak', number: '901', classId: classA.id },
    { username: 'ogr2', fullName: 'Ece Yıldız', number: '902', classId: classA.id },
    { username: 'ogr3', fullName: 'Kaan Öz', number: '903', classId: classA.id },
    { username: 'ogr4', fullName: 'Selin Arslan', number: '904', classId: classA.id },
    { username: 'ogr5', fullName: 'Mert Koç', number: '905', classId: classB.id },
    { username: 'ogr6', fullName: 'İrem Şen', number: '906', classId: classB.id },
  ];

  const students: Array<{ id: string; userId: string; username: string }> = [];
  for (const item of studentSeed) {
    const user = await prisma.user.upsert({
      where: { username: item.username },
      update: {},
      create: {
        institutionId: institution.id,
        username: item.username,
        passwordHash,
        fullName: item.fullName,
        role: Role.STUDENT,
        studentProfile: {
          create: { studentNumber: item.number, schoolClassId: item.classId },
        },
      },
      include: { studentProfile: true },
    });
    if (user.studentProfile) {
      students.push({ id: user.studentProfile.id, userId: user.id, username: item.username });
    }
  }

  const terms = await prisma.term.findMany({
    where: { academicYear: { institutionId: institution.id } },
    orderBy: { startDate: 'asc' },
  });
  const firstTerm = terms.find((term) => term.type === TermType.FIRST) ?? terms[0]!;
  const secondTerm = terms.find((term) => term.type === TermType.SECOND) ?? terms[1] ?? firstTerm;

  const subjects = ['TDE', 'MAT', 'FIZ', 'KIM'];
  const scores: Record<string, { first: number[]; second: number[] }> = {
    ogr1: { first: [78, 88, 92, 85], second: [82, 90, 95, 88] },
    ogr2: { first: [95, 100, 98, 96], second: [98, 100, 100, 97] },
    ogr3: { first: [45, 38, 55, 60], second: [48, 40, 58, 62] },
    ogr4: { first: [70, 65, 72, 68], second: [75, 70, 78, 72] },
    ogr5: { first: [88, 92, 85, 90], second: [90, 95, 88, 92] },
    ogr6: { first: [60, 55, 65, 58], second: [65, 60, 70, 62] },
  };

  for (const student of students) {
    const values = scores[student.username];
    if (!values) continue;

    for (let index = 0; index < subjects.length; index++) {
      const course = courses.get(subjects[index]!)!;
      await prisma.grade.create({
        data: {
          studentId: student.id,
          courseId: course.id,
          termId: firstTerm.id,
          type: GradeType.WRITTEN,
          score: values.first[index]!,
          enteredById: undefined,
        },
      });
      await prisma.grade.create({
        data: {
          studentId: student.id,
          courseId: course.id,
          termId: secondTerm.id,
          type: GradeType.WRITTEN,
          score: values.second[index]!,
        },
      });
    }
  }

  // Devamsızlık: ilk öğrenci 3 özürsüz, 1 özürlü
  const tdeClassCourse = await prisma.classCourse.findFirst({
    where: { schoolClassId: classA.id, courseId: courses.get('TDE')!.id },
  });

  if (tdeClassCourse) {
    const records = [
      { status: AttendanceStatus.ABSENT, day: 3, period: 1 },
      { status: AttendanceStatus.ABSENT, day: 4, period: 2 },
      { status: AttendanceStatus.ABSENT, day: 10, period: 3 },
      { status: AttendanceStatus.EXCUSED, day: 11, period: 1 },
    ];
    for (const record of records) {
      await prisma.attendanceRecord.create({
        data: {
          studentId: students[0]!.id,
          classCourseId: tdeClassCourse.id,
          date: new Date(Date.UTC(2026, 9, record.day)),
          period: record.period,
          status: record.status,
        },
      });
    }
  }

  // Deneme şablonu + oturum + sonuçlar
  const template = await prisma.mockExamTemplate.create({
    data: {
      institutionId: institution.id,
      name: '9. Sınıf 40 Soruluk Deneme',
      wrongPenaltyRatio: 4,
      sections: {
        create: [
          { name: 'Türkçe', courseId: courses.get('TDE')!.id, questionCount: 20 },
          { name: 'Matematik', courseId: courses.get('MAT')!.id, questionCount: 20 },
        ],
      },
    },
    include: { sections: true },
  });

  const session = await prisma.mockExamSession.create({
    data: {
      institutionId: institution.id,
      templateId: template.id,
      name: 'Kasım 1. Deneme',
      examDate: new Date(Date.UTC(2026, 10, 8)),
      schoolClassId: classA.id,
      affectsFinalGrade: false,
    },
  });

  const resultSeed: Record<string, Array<{ correct: number; wrong: number }>> = {
    ogr1: [
      { correct: 16, wrong: 3 },
      { correct: 14, wrong: 4 },
    ],
    ogr2: [
      { correct: 19, wrong: 1 },
      { correct: 18, wrong: 2 },
    ],
    ogr3: [
      { correct: 8, wrong: 9 },
      { correct: 6, wrong: 10 },
    ],
    ogr4: [
      { correct: 13, wrong: 5 },
      { correct: 12, wrong: 6 },
    ],
  };

  for (const student of students) {
    const values = resultSeed[student.username];
    if (!values) continue;
    for (let index = 0; index < template.sections.length; index++) {
      const section = template.sections[index]!;
      const entry = values[index]!;
      const computed = computeMockResult({
        correctCount: entry.correct,
        wrongCount: entry.wrong,
        totalQuestions: section.questionCount,
        wrongPenaltyRatio: template.wrongPenaltyRatio,
      });
      await prisma.mockExamResult.create({
        data: {
          sessionId: session.id,
          studentId: student.id,
          sectionId: section.id,
          ...computed,
        },
      });
    }
  }

  // Kullanıcıların şifresi demo-sifre-123
  console.log('[seed] Tamamlandı.');
  console.log('  Yönetici : demo / demo-sifre-123');
  console.log('  Öğretmen : ayse / demo-sifre-123  (matematik: mehmet veya ali)');
  console.log('  Öğrenci  : ogr1 / demo-sifre-123');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
