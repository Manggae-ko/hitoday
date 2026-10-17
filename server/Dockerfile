# Relay server only (the desktop app is not part of this image).
# Build from the repo root: docker build -f server/Dockerfile .
FROM node:22-alpine
WORKDIR /app
RUN npm install --omit=dev --no-audit --no-fund ws@8
COPY shared ./shared
COPY server/relay.js ./server/relay.js
ENV PORT=8787
EXPOSE 8787
USER node
CMD ["node", "server/relay.js"]
