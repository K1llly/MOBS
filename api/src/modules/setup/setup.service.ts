import { Role, TermType, type Prisma, type PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { env } from '../../config/env';
import { ApiError } from '../../lib/errors';
import {
  getPreset,
  validateRuleCompatibility,
  type FeatureFlagKey,
  type InstitutionPreset,
} from './presets';
import type { InitializeInput } from './setup.schema';

export interface SetupStatus {
  isInitialized: boolean;
  institution?: {
    id: string;
    name: string;
    type: string;
    gradingStrategy: string;
    dailyPeriodCount: number;
  };
  featureFlags?: Record<string, boolean>;
}

export class SetupService {
  constructor(private readonly db: PrismaClient) {}

  async isInitialized(): Promise<boolean> {
    const config = await this.db.institutionConfig.findFirst({
      where: { isInitialized: true },
      select: { id: true },
    });
    return config !== null;
  }

  async getStatus(): Promise<SetupStatus> {
    const config = await this.db.institutionConfig.findFirst({
      include: { featureFlags: true },
    });

    if (!config || !config.isInitialized) {
      return { isInitialized: false };
    }

    return {
      isInitialized: true,
      institution: {
        id: config.id,
        name: config.name,
        type: config.type,
        gradingStrategy: config.gradingStrategy,
        dailyPeriodCount: config.dailyPeriodCount,
      },
      featureFlags: Object.fromEntries(config.featureFlags.map((flag) => [flag.key, flag.enabled])),
    };
  }

  /**
   * FR-SETUP-02 & FR-SETUP-04
   * Seçilen kurum tipinin preset'ini, aktif modülleri, kural setini, akademik
   * takvimi ve ilk MANAGER hesabını TEK bir transaction içinde üretir.
   */
  async initialize(input: InitializeInput) {
    if (await this.isInitialized()) {
      throw ApiError.forbidden(
        'SYSTEM_ALREADY_INITIALIZED',
        'Sistem zaten kurulmuş; kurulum sihirbazı kalıcı olarak kilitlidir',
      );
    }

    const preset = getPreset(input.institutionType);

    try {
      validateRuleCompatibility(input.institutionType, input.overrides ?? {});
    } catch (error) {
      throw ApiError.badRequest(
        'INCOMPATIBLE_RULE_SET',
        error instanceof Error ? error.message : 'Kural seti kurum tipiyle uyumsuz',
      );
    }

    const passwordHash = await bcrypt.hash(input.admin.password, env.BCRYPT_ROUNDS);
    const terms = buildTerms(input.academicYear.startDate, input.academicYear.endDate);

    const result = await this.db.$transaction(async (tx) => {
      // Yarış koşuluna karşı transaction içinde tekrar kontrol (reset not: tek kurum)
      const existing = await tx.institutionConfig.findFirst({ where: { isInitialized: true } });
      if (existing) {
        throw ApiError.forbidden('SYSTEM_ALREADY_INITIALIZED', 'Sistem zaten kurulmuş');
      }

      const institution = await tx.institutionConfig.create({
        data: {
          name: input.institutionName,
          type: input.institutionType,
          gradingStrategy: preset.gradingStrategy,
          isInitialized: true,
          dailyPeriodCount: input.dailyPeriodCount,
          config: {
            ...(input.config ?? {}),
            mockExamPolicy: preset.mockExamPolicy,
            roles: preset.roles,
          } as Prisma.InputJsonValue,
        },
      });

      await tx.featureFlag.createMany({
        data: presetFlags(preset).map(([key, enabled]) => ({
          institutionId: institution.id,
          key,
          enabled,
        })),
      });

      await tx.ruleSetItem.createMany({
        data: Object.entries(preset.rules).map(([key, value]) => ({
          institutionId: institution.id,
          key,
          value: value as Prisma.InputJsonValue,
        })),
      });

      if (preset.gradeLevels.length > 0) {
        await tx.gradeLevel.createMany({
          data: preset.gradeLevels.map((level) => ({
            institutionId: institution.id,
            level: level.level,
            name: level.name,
          })),
        });
      }

      if (preset.gradePolicies.length > 0) {
        await tx.gradeWeightPolicy.createMany({
          data: preset.gradePolicies.map((policy) => ({
            institutionId: institution.id,
            gradeType: policy.gradeType,
            weight: policy.weight,
          })),
        });
      }

      await tx.academicYear.create({
        data: {
          institutionId: institution.id,
          name: input.academicYear.name,
          startDate: input.academicYear.startDate,
          endDate: input.academicYear.endDate,
          isActive: true,
          terms: {
            create: terms.map((term) => ({
              name: term.name,
              type: term.type,
              startDate: term.startDate,
              endDate: term.endDate,
              isActive: term.type === TermType.FIRST,
            })),
          },
        },
      });

      const admin = await tx.user.create({
        data: {
          institutionId: institution.id,
          username: input.admin.username,
          passwordHash,
          fullName: input.admin.fullName,
          role: Role.MANAGER,
        },
      });

      await tx.auditLog.create({
        data: {
          institutionId: institution.id,
          actorId: admin.id,
          action: 'SYSTEM_INITIALIZED',
          entity: 'InstitutionConfig',
          entityId: institution.id,
          payload: { institutionType: input.institutionType } as Prisma.InputJsonValue,
        },
      });

      return { institution, admin };
    });

    return {
      institutionId: result.institution.id,
      institutionName: result.institution.name,
      gradingStrategy: result.institution.gradingStrategy,
      adminUsername: result.admin.username,
      featureFlags: Object.fromEntries(presetFlags(preset)),
    };
  }

  /** Setup sihirbazının 1. adımında gösterilecek özet preset listesi. */
  getPresetSummaries() {
    return Object.values(getPresetList()).map((preset) => ({
      type: preset.type,
      gradingStrategy: preset.gradingStrategy,
      gradeLevels: preset.gradeLevels.map((level) => level.name),
      roles: preset.roles,
      mockExamPolicy: preset.mockExamPolicy,
      enabledModules: presetFlags(preset)
        .filter(([, enabled]) => enabled)
        .map(([key]) => key),
    }));
  }
}

function getPresetList(): InstitutionPreset[] {
  const types = ['COURSE', 'PRIMARY', 'MIDDLE', 'HIGH', 'UNIVERSITY'] as const;
  return types.map((type) => getPreset(type));
}

function presetFlags(preset: InstitutionPreset): Array<[FeatureFlagKey, boolean]> {
  return (Object.entries(preset.featureFlags) as Array<[FeatureFlagKey, boolean]>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
}

function buildTerms(startDate: Date, endDate: Date) {
  const totalMs = endDate.getTime() - startDate.getTime();
  const midMs = startDate.getTime() + totalMs / 2;

  return [
    {
      name: '1. Dönem',
      type: TermType.FIRST,
      startDate,
      endDate: new Date(midMs),
    },
    {
      name: '2. Dönem',
      type: TermType.SECOND,
      startDate: new Date(midMs),
      endDate,
    },
  ];
}
