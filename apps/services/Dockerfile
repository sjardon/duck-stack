# Stage 1 — builder
FROM node:20-alpine AS builder

RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/services/package.json ./apps/services/package.json
COPY packages/tsconfig/package.json ./packages/tsconfig/package.json
COPY packages/types/package.json ./packages/types/package.json
COPY packages/eslint-config/package.json ./packages/eslint-config/package.json

RUN pnpm install --frozen-lockfile

COPY apps/services/src ./apps/services/src
COPY apps/services/tsconfig.json ./apps/services/tsconfig.json
COPY packages/tsconfig ./packages/tsconfig
COPY packages/types ./packages/types
COPY packages/eslint-config ./packages/eslint-config

RUN pnpm --filter services build

# Stage 2 — runner
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/services/node_modules ./apps/services/node_modules
COPY --from=builder /app/apps/services/dist ./dist

EXPOSE 3000

CMD ["node", "dist/server.js"]
