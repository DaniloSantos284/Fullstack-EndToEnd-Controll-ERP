FROM node:22-slim AS build

WORKDIR /usr/src/app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build

FROM node:22-slim AS runtime

WORKDIR /usr/src/app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /usr/src/app/dist ./dist

RUN mkdir -p /usr/src/app/uploads && chown node:node /usr/src/app/uploads

USER node

EXPOSE 4000

CMD ["node", "dist/server.js"]
