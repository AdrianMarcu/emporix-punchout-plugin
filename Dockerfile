FROM node:20-alpine AS builder
WORKDIR /app

# Copy and build server source first
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src

# Build admin UI after COPY src so its output is not overwritten
COPY admin-ui/package*.json ./admin-ui/
RUN cd admin-ui && npm ci
COPY admin-ui ./admin-ui
RUN cd admin-ui && npm run build

# Compile TypeScript server
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/admin-ui-dist ./src/admin-ui-dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
