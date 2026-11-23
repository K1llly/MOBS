/**
 * API genelinde kullanılan, HTTP durum kodu taşıyan hata tipi.
 * Hata gövdesi her zaman `{ error: { code, message, details? } }` şeklindedir.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(code: string, message: string, details?: unknown) {
    return new ApiError(400, code, message, details);
  }

  static unauthorized(message = 'Kimlik doğrulaması gerekli') {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(code = 'FORBIDDEN', message = 'Bu işlem için yetkiniz yok') {
    return new ApiError(403, code, message);
  }

  static notFound(code = 'NOT_FOUND', message = 'Kayıt bulunamadı') {
    return new ApiError(404, code, message);
  }

  static conflict(code: string, message: string, details?: unknown) {
    return new ApiError(409, code, message, details);
  }
}
