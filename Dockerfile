# --- build the React client ---
FROM node:20-slim AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
COPY shared/ /app/shared/
RUN npm run build

# --- runtime: Express serves the API and the built client; SQLite lives in /data ---
FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tzdata \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ ./
RUN npx prisma generate
COPY shared/ /app/shared/
COPY --from=client /app/client/dist /app/client/dist

ENV NODE_ENV=production \
    PORT=5000 \
    DATABASE_URL=file:/data/health.db
VOLUME /data
EXPOSE 5000
CMD ["sh", "-c", "npx prisma db push --skip-generate && node server.js"]
