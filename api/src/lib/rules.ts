import type { PrismaClient } from '@prisma/client';
import { ApiError } from './errors';

export type Rules = Record<string, unknown>;

/** Kurumun kural setini anahtar-değer sözlüğü olarak yükler. */
export async function loadRules(db: PrismaClient, institutionId: string): Promise<Rules> {
  const items = await db.ruleSetItem.findMany({ where: { institutionId } });
  return Object.fromEntries(items.map((item) => [item.key, item.value as unknown]));
}

export async function loadFlags(
  db: PrismaClient,
  institutionId: string,
): Promise<Record<string, boolean>> {
  const flags = await db.featureFlag.findMany({ where: { institutionId } });
  return Object.fromEntries(flags.map((flag) => [flag.key, flag.enabled]));
}

export function ruleNumber(rules: Rules, key: string, fallback: number): number {
  const value = rules[key];
  return typeof value === 'number' ? value : fallback;
}

export function ruleBoolean(rules: Rules, key: string, fallback = false): boolean {
  const value = rules[key];
  return typeof value === 'boolean' ? value : fallback;
}

export async function getInstitution(db: PrismaClient, institutionId: string) {
  const config = await db.institutionConfig.findUnique({ where: { id: institutionId } });
  if (!config) {
    throw ApiError.notFound('INSTITUTION_NOT_FOUND', 'Kurum bulunamadı');
  }
  return config;
}

/** Aktif dönemi (yoksa ilk dönemi) döner. */
export async function resolveTerm(db: PrismaClient, institutionId: string, termId?: string | null) {
  if (termId) {
    const term = await db.term.findFirst({
      where: { id: termId, academicYear: { institutionId } },
      include: { academicYear: true },
    });
    if (!term) throw ApiError.notFound('TERM_NOT_FOUND', 'Dönem bulunamadı');
    return term;
  }

  const active = await db.term.findFirst({
    where: { isActive: true, academicYear: { institutionId } },
    include: { academicYear: true },
  });
  if (active) return active;

  const first = await db.term.findFirst({
    where: { academicYear: { institutionId } },
    include: { academicYear: true },
    orderBy: { startDate: 'asc' },
  });
  if (!first) throw ApiError.badRequest('NO_TERM', 'Tanımlı dönem yok');
  return first;
}
