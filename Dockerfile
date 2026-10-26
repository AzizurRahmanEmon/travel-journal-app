FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# The lockfile is written by npm 11. Alpine's npm 10 treats other platforms' optional esbuild packages as install failures.
RUN npm install -g npm@11.19.1 && npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# The env module reads DATABASE_URL on import. The real URL is supplied at runtime.
ENV DATABASE_URL=postgres://localhost:5432/travel_journal
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
