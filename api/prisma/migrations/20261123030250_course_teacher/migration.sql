-- CreateTable
CREATE TABLE "CourseTeacher" (
    "courseId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseTeacher_pkey" PRIMARY KEY ("courseId","teacherId")
);

-- CreateIndex
CREATE INDEX "CourseTeacher_teacherId_idx" ON "CourseTeacher"("teacherId");

-- AddForeignKey
ALTER TABLE "CourseTeacher" ADD CONSTRAINT "CourseTeacher_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseTeacher" ADD CONSTRAINT "CourseTeacher_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "TeacherProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
