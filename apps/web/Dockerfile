# ---------- deps ----------
FROM node:22-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
RUN npm ci --workspace=@mindspace/web --include-workspace-root

# ---------- dev ----------
FROM node:22-alpine AS dev
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/web/node_modules ./apps/web/node_modules
COPY . .
WORKDIR /repo/apps/web
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ---------- build ----------
FROM deps AS build
COPY . .
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build --workspace=@mindspace/web

# ---------- runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /repo/apps/web
ENV NODE_ENV=production
COPY --from=build /repo/apps/web/.next ./.next
COPY --from=build /repo/apps/web/public ./public
COPY --from=build /repo/apps/web/package.json ./
COPY --from=build /repo/node_modules /repo/node_modules
EXPOSE 3000
CMD ["npm", "run", "start"]
