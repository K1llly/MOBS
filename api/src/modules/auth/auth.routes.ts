import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { asyncHandler, validate } from '../../middlewares/validate';
import { loginSchema } from './auth.schema';
import type { AuthService } from './auth.service';

export function createAuthRouter(service: AuthService): Router {
  const router = Router();

  router.post(
    '/login',
    validate(loginSchema),
    asyncHandler(async (req, res) => {
      res.json(await service.login(req.body));
    }),
  );

  router.get(
    '/me',
    authenticate,
    asyncHandler(async (req, res) => {
      res.json(await service.me(req.auth!.sub));
    }),
  );

  return router;
}
