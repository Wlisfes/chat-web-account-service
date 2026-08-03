# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS dependencies
WORKDIR /app

RUN corepack enable && corepack prepare yarn@1.22.22 --activate
COPY package.json yarn.lock ./
# yarn.lock was generated with a regional mirror; use the canonical registry in CI.
RUN sed -i 's#https://registry.npmmirror.com#https://registry.npmjs.org#g' yarn.lock
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
    yarn install --frozen-lockfile --non-interactive --ignore-scripts

FROM dependencies AS builder
COPY nest-cli.json tsconfig*.json ./
COPY src ./src
RUN yarn build

FROM node:22-alpine AS production-dependencies
WORKDIR /app

RUN corepack enable && corepack prepare yarn@1.22.22 --activate
COPY package.json yarn.lock ./
RUN sed -i 's#https://registry.npmmirror.com#https://registry.npmjs.org#g' yarn.lock
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
    yarn install --frozen-lockfile --production=true --non-interactive --ignore-scripts

FROM node:22-alpine AS production
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

USER node
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=4 \
    CMD node -e "require('http').get('http://127.0.0.1:3000/health', (response) => process.exit(response.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/main.js"]
