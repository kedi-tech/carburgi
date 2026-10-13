# CARBUGUI back-office — Next.js standalone server.
# Secrets are never baked in: every variable is read at runtime from the
# container's environment (--env-file on the server).

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    STATION_VAULT_PATH=/app/.data/station-credentials.json

RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs \
 && mkdir -p /app/.data && chown nextjs:nodejs /app/.data

COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

USER nextjs
# The encrypted station-credential vault lives here: mount a volume on it.
VOLUME ["/app/.data"]
EXPOSE 3000
CMD ["node", "server.js"]
