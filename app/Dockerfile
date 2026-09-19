FROM node:22-bookworm-slim AS dependencies

WORKDIR /workspace

COPY package.json package-lock.json ./
COPY app/package.json app/package.json
COPY web/package.json web/package.json
COPY packages/contracts/package.json packages/contracts/package.json

RUN npm ci --omit=dev \
    --workspace @teamshelf/api \
    --workspace @teamshelf/contracts \
    --include-workspace-root=false

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /workspace

COPY --from=dependencies /workspace/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node app ./app
COPY --chown=node:node packages/contracts ./packages/contracts

RUN mkdir -p /workspace/storage && chown node:node /workspace/storage

USER node
EXPOSE 4000

CMD ["node", "app/src/api-server.js"]
