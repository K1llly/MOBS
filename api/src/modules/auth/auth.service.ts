import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { ApiError } from '../../lib/errors';
import { signToken } from '../../lib/jwt';
import type { LoginInput } from './auth.schema';

export class AuthService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * US-01 — Yerel kullanıcı adı/şifre doğrulaması ve rol bazlı JWT üretimi.
   * Harici SSO yoktur (kapsam kilidi).
   */
  async login(input: LoginInput) {
    const institution = await this.db.institutionConfig.findFirst({
      where: { isInitialized: true },
      select: { id: true },
    });

    if (!institution) {
      throw ApiError.forbidden(
        'SYSTEM_NOT_INITIALIZED',
        'Sistem henüz kurulmamış; önce /setup kurulum sihirbazını tamamlayın',
      );
    }

    const user = await this.db.user.findUnique({ where: { username: input.username } });

    // Kullanıcı yoksa da hash karşılaştırma maliyeti kadar zaman harcayarak
    // kullanıcı adı numaralandırmasını zorlaştır.
    const valid = user
      ? await bcrypt.compare(input.password, user.passwordHash)
      : await bcrypt.compare(input.password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin');

    if (!user || !valid) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Kullanıcı adı veya şifre hatalı');
    }

    if (!user.isActive) {
      throw ApiError.forbidden('USER_DISABLED', 'Kullanıcı hesabı devre dışı bırakılmış');
    }

    const token = signToken({
      sub: user.id,
      role: user.role,
      institutionId: user.institutionId,
      username: user.username,
    });

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        institutionId: user.institutionId,
      },
    };
  }

  async me(userId: string) {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, fullName: true, role: true, isActive: true },
    });
    if (!user) {
      throw ApiError.unauthorized('Kullanıcı bulunamadı');
    }
    return user;
  }
}
