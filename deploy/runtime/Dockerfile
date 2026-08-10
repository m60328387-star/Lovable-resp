FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends git curl ca-certificates python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /runtime
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund \
  && npx playwright install --with-deps chromium \
  && rm -rf /root/.npm

COPY server.mjs browser.mjs agent-browser.mjs ./

ENV RUNTIME_ROOT=/workspaces
ENV RUNTIME_PORT=4100
ENV PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright
RUN mkdir -p /workspaces

EXPOSE 4100
HEALTHCHECK --interval=20s --timeout=5s --retries=5 --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:4100/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
