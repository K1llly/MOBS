import { InstitutionType } from '@prisma/client';
import { z } from 'zod';

const isoDate = z.coerce.date();

export const bootstrapAdminSchema = z.object({
  username: z
    .string()
    .min(3, 'Kullanıcı adı en az 3 karakter olmalıdır')
    .max(32)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Kullanıcı adı yalnızca harf, rakam, nokta, tire ve alt çizgi içerebilir'),
  password: z.string().min(8, 'Şifre en az 8 karakter olmalıdır').max(72),
  fullName: z.string().min(3).max(120),
});

export const initializeSchema = z
  .object({
    institutionType: z.nativeEnum(InstitutionType),
    institutionName: z.string().min(2, 'Kurum adı zorunludur').max(160),
    dailyPeriodCount: z.coerce.number().int().min(4).max(12).default(8),
    academicYear: z.object({
      name: z.string().min(4, 'Eğitim yılı adı zorunludur (ör. 2026-2027)'),
      startDate: isoDate,
      endDate: isoDate,
    }),
    admin: bootstrapAdminSchema,
    /// Kuruma özgü esnek parametreler (ör. dershane baraj puanı)
    config: z.record(z.unknown()).optional(),
    overrides: z
      .object({
        numericGrading: z.boolean().optional(),
        letterGradeSystem: z.boolean().optional(),
      })
      .optional(),
  })
  .refine((data) => data.academicYear.endDate > data.academicYear.startDate, {
    message: 'Eğitim yılı bitiş tarihi başlangıçtan sonra olmalıdır',
    path: ['academicYear', 'endDate'],
  });

export type InitializeInput = z.infer<typeof initializeSchema>;
