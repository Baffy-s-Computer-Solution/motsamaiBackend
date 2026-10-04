FROM node:22-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

FROM base AS deps
COPY package*.json ./
RUN npm ci --omit=dev

FROM base AS runtime
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN chown -R appuser:appgroup /app
USER appuser
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -qO- http://127.0.0.1:4000/health || exit 1

CMD ["node", "src/server.js"]
