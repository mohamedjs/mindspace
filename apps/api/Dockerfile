FROM node:26-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* ./
COPY packages/contracts/package.json ./packages/contracts/
COPY apps/api/package.json ./apps/api/

RUN npm install --workspace @mindspace/api --workspace @mindspace/contracts

COPY packages/contracts/ ./packages/contracts/
COPY apps/api/ ./apps/api/

RUN npm run build -w @mindspace/contracts
RUN npm run build -w @mindspace/api

FROM node:26-alpine AS runner

WORKDIR /app

RUN apk add --no-cache curl ffmpeg

COPY package.json package-lock.json* ./
COPY packages/contracts/package.json ./packages/contracts/
COPY apps/api/package.json ./apps/api/

RUN npm install --omit=dev --workspace @mindspace/api --workspace @mindspace/contracts

COPY --from=builder /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY apps/api/migrations ./apps/api/migrations
COPY apps/api/seed ./apps/api/seed

WORKDIR /app/apps/api

EXPOSE 8080

RUN mkdir -p /data/audio && chown -R node:node /data/audio
USER node

CMD ["node", "dist/main.http.js"]
