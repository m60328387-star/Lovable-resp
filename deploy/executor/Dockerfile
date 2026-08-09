FROM node:22-alpine

RUN apk add --no-cache git openssh-client

WORKDIR /executor

COPY runner.mjs ./

ENV EXECUTOR_WORKDIR=/opt/weaver/work
ENV EXECUTOR_POLL_INTERVAL_MS=4000

VOLUME ["/opt/weaver/work"]

CMD ["node", "runner.mjs"]
