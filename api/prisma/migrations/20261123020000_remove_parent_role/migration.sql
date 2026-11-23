-- PARENT (Veli) rolü kaldırıldı: veli hesapları, veli-öğrenci ilişkisi ve
-- PARENT_PORTAL feature flag'i temizlenir.

DELETE FROM "User" WHERE "role" = 'PARENT';

DROP TABLE IF EXISTS "ParentStudent";
DROP TABLE IF EXISTS "ParentProfile";

-- PostgreSQL enum'dan değer silinemez; tip yeniden oluşturulur.
ALTER TYPE "Role" RENAME TO "Role_old";
CREATE TYPE "Role" AS ENUM ('MANAGER', 'TEACHER', 'STUDENT');
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role" USING ("role"::text::"Role");
DROP TYPE "Role_old";

DELETE FROM "FeatureFlag" WHERE "key" = 'PARENT_PORTAL';
