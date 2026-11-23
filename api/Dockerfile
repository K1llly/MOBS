# --- build ---
FROM node:22-alpine AS build
WORKDIR /app

COPY api/package*.json ./
COPY api/prisma ./prisma
RUN npm ci --silent

COPY api/tsconfig.json ./
COPY api/src ./src
RUN npx prisma generate && npm run build

# Root docs (OpenAPI) Swagger UI için gerekli
COPY docs /app/docs

# --- runtime ---
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/docs ./docs
COPY api/package.json ./package.json

EXPOSE 3000

# docker compose up sonrası şema otomatik kurulur
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
