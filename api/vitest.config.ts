import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/modules/**/*.ts', 'src/lib/**/*.ts'],
      // Veritabanına bağlı servisler ve HTTP katmanı birim kapsamı dışında tutulur;
      // bunlar docker compose üzerinde uçtan uca (E2E) doğrulanır. Birim kapsamı
      // saf iş kurallarını (preset, strateji, hesaplama, algoritma) ölçer.
      exclude: [
        '**/*.test.ts',
        '**/*.routes.ts',
        '**/*.service.ts',
        '**/*.schema.ts',
        '**/index.ts',
      ],
      thresholds: {
        lines: 50,
        functions: 50,
        statements: 50,
        branches: 40,
      },
    },
  },
});
