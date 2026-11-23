import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { loadOpenApiDocument } from './lib/openapi';
import { errorHandler, notFoundHandler } from './middlewares/error';
import { createAuthRouter } from './modules/auth/auth.routes';
import { AuthService } from './modules/auth/auth.service';
import { createSetupRouter } from './modules/setup/setup.routes';
import { SetupService } from './modules/setup/setup.service';
import { createClassroomRouter } from './modules/classroom/classroom.routes';
import { createUserRouter } from './modules/user/user.routes';
import { createGradingRouter } from './modules/grading/grading.routes';
import { createAttendanceRouter } from './modules/attendance/attendance.routes';
import { createMockExamRouter } from './modules/mock-exam/mock-exam.routes';
import { createSchedulingRouter } from './modules/scheduling/scheduling.routes';
import type { PrismaClient } from '@prisma/client';

export interface AppDependencies {
  prisma: PrismaClient;
}

export function createApp({ prisma }: AppDependencies): Express {
  const app = express();

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',').map((origin) => origin.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'mobs-api', timestamp: new Date().toISOString() });
  });

  const openapi = loadOpenApiDocument();
  if (openapi) {
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: 'MOBS API' }));
    app.get('/openapi.yaml', (_req, res) => {
      res.json(openapi);
    });
  }

  const setupService = new SetupService(prisma);
  const authService = new AuthService(prisma);

  app.use('/setup', createSetupRouter(setupService));
  app.use('/auth', createAuthRouter(authService));
  app.use('/', createClassroomRouter(prisma));
  app.use('/', createUserRouter(prisma));
  app.use('/', createGradingRouter(prisma));
  app.use('/', createAttendanceRouter(prisma));
  app.use('/', createMockExamRouter(prisma));
  app.use('/', createSchedulingRouter(prisma));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
