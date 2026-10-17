# Relay server only (the desktop app is not part of this image).
# Build from the repo root: docker build -f server/Dockerfile .
FROM node:22-alpine
WORKDIR /app
RUN npm install --omit=dev --no-audit --no-fund ws@8
COPY shared ./shared
COPY server/*.js ./server/
COPY web ./web
# Device-key hashes live here; mount a volume so they survive redeploys.
RUN mkdir -p /data && chown node:node /data
ENV PORT=8787 DATA_DIR=/data
EXPOSE 8787
USER node
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1:8787/health || exit 1
CMD ["node", "server/relay.js"]
