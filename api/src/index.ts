import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './lib/prisma';

async function main(): Promise<void> {
  const app = createApp({ prisma });

  const server = app.listen(env.PORT, () => {
    console.log(`[mobs-api] ${env.NODE_ENV} ortamında http://localhost:${env.PORT} adresinde çalışıyor`);
    console.log(`[mobs-api] Swagger UI: http://localhost:${env.PORT}/docs`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[mobs-api] ${signal} alındı, kapatılıyor...`);
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch(async (error) => {
  console.error('[mobs-api] başlatma hatası', error);
  await prisma.$disconnect();
  process.exit(1);
});
