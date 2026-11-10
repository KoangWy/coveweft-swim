# syntax=docker/dockerfile:1

# Production image for the Next.js app (`output: "standalone"`). Build it with
# the browser-facing Supabase values as build arguments: Next.js inlines
# NEXT_PUBLIC_* variables into the client bundle at build time.
#
#   docker build \
#     --build-arg NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
#     --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key> \
#     -t coveweft-swim-app:local .
#
# Server-only values (SUPABASE_URL_INTERNAL, SUPABASE_SECRET_KEY, AI keys,
# MEDIA_*) are read at runtime, so pass them with `docker run --env-file`.

ARG NODE_VERSION=26
ARG PNPM_VERSION=12.6.0

FROM node:${NODE_VERSION}-slim AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1
RUN npm install --global --no-fund --no-audit "pnpm@${PNPM_VERSION}"
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store \
    && pnpm install --frozen-lockfile

# Production install with a flat layout, used only to give the provisioning
# script its Supabase client inside the runtime image.
FROM base AS provision-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store \
    && pnpm install --frozen-lockfile --prod --config.node-linker=hoisted

FROM base AS build
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
    NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL} \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:${NODE_VERSION}-slim AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
# The demo scripts run `node scripts/provision-demo.mjs` in this image, so the
# host does not need Node.js. The server bundle inlines the Supabase client,
# so the script gets its own copy of the package and its dependencies.
COPY --from=build --chown=node:node /app/scripts/provision-demo.mjs ./scripts/provision-demo.mjs
COPY --from=provision-deps --chown=node:node /app/node_modules/@supabase ./scripts/node_modules/@supabase
COPY --from=provision-deps --chown=node:node /app/node_modules/tslib ./scripts/node_modules/tslib
COPY --from=provision-deps --chown=node:node /app/node_modules/iceberg-js ./scripts/node_modules/iceberg-js
RUN cd scripts && node --input-type=module -e "await import('@supabase/supabase-js')"
# Static files (brand photography and icons). Extracted release media is
# mounted at public/media at runtime and served at /media.
COPY --from=build --chown=node:node /app/public ./public
RUN mkdir -p public/media && chown -R node:node public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
