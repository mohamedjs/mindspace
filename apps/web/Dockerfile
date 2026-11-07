FROM node:26-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/contracts/package.json ./packages/contracts/
COPY apps/web/package.json ./apps/web/

RUN npm install --workspace @mindspace/web --workspace @mindspace/contracts

COPY packages/contracts/ ./packages/contracts/
COPY apps/web/ ./apps/web/

RUN npm run build -w @mindspace/contracts
RUN npm run build -w @mindspace/web

FROM node:26-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package.json package-lock.json* ./
COPY packages/contracts/package.json ./packages/contracts/
COPY apps/web/package.json ./apps/web/

RUN npm install --omit=dev --workspace @mindspace/web --workspace @mindspace/contracts

COPY --from=builder /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public

WORKDIR /app/apps/web

EXPOSE 3000

USER node

CMD ["npm", "run", "start"]
