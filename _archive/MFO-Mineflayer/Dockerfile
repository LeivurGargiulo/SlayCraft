# syntax=docker/dockerfile:1

FROM node:22-bookworm AS builder
WORKDIR /app

# canvas (screenshot pipeline) needs Cairo/Pango/JPEG/GIF/RSVG headers and a compiler when no
# prebuilt binary matches this platform; better-sqlite3/bcrypt ship prebuilds for common
# platforms but fall back to compiling the same way.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential python3 pkg-config \
    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY src/dashboard/package.json src/dashboard/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build
RUN pnpm --dir src/dashboard build

FROM node:22-bookworm AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Runtime shared libs: canvas's compiled addon (Cairo/Pango/JPEG/GIF/RSVG) plus everything
# Puppeteer's bundled Chromium needs to actually launch headless in a container.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libjpeg62-turbo libgif7 librsvg2-2 \
    ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 libcups2 \
    libdbus-1-3 libdrm2 libgbm1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libx11-6 libx11-xcb1 \
    libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2 \
    libxss1 libxtst6 wget xdg-utils \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/dashboard/dist ./src/dashboard/dist
COPY --from=builder /app/package.json ./package.json
COPY config ./config

# REST API + WebSocket + dashboard, and the Prismarine live viewer (config/manager.yml -> screenshots.port).
EXPOSE 3000 3001

CMD ["node", "dist/app/bootstrap.js"]
