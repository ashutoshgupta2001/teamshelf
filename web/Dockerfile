FROM node:22-bookworm-slim AS build

WORKDIR /workspace

COPY package.json package-lock.json ./
COPY app/api/package.json app/api/package.json
COPY web/package.json web/package.json
COPY packages/contracts/package.json packages/contracts/package.json

RUN npm ci \
    --workspace @teamshelf/web \
    --workspace @teamshelf/contracts \
    --include-workspace-root=false

COPY web ./web
COPY packages/contracts ./packages/contracts

ARG VITE_GOOGLE_CLIENT_ID=""
ENV VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID}

RUN npm run build --workspace @teamshelf/web

FROM nginx:1.27-alpine AS runtime

COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/web/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1/ || exit 1
