# --- build ---
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci --silent

COPY . .
# Aynı origin üzerinden Nginx ters vekilini kullan (CORS gerekmez)
ENV VITE_API_BASE_URL=""
RUN npm run build

# --- runtime ---
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
