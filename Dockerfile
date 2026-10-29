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
# The server reuses the phone's offline estimator as its AI fallback (package.json marks it as ES module)
COPY --from=client /app/client/package.json /app/client/package.json
COPY --from=client /app/client/src/local/offlineEstimate.js /app/client/src/local/offlineEstimate.js

ENV NODE_ENV=production \
    PORT=5000 \
    DATABASE_URL=file:/data/health.db
# Run as the unprivileged "node" user; it needs to write the SQLite volume and the Prisma files
RUN mkdir -p /data && chown -R node:node /data /app/server
USER node
VOLUME /data
EXPOSE 5000
CMD ["sh", "-c", "npx prisma db push --skip-generate && node server.js"]
