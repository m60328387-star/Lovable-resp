FROM node:22-alpine

WORKDIR /worker
COPY worker.mjs ./

ENV WORKER_API_URL=http://app:3000
ENV WORKER_IDLE_INTERVAL_MS=5000

CMD ["node", "worker.mjs"]
