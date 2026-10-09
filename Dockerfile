# Foundation Task 2 image skeleton (STACK-ADR-001 4.12): one OCI image from a Node.js base image pinned by digest, non-root.
# It exists to prove "image build + image scan" in CI. There is no application code yet, so the three start commands of
# 4.12 (api, worker, scheduler) and the fourth (migration) are NOT defined here: they are delivered with the code they
# start. Nothing is published (STACK-ADR-002 E7). No secret is passed as a build argument or stored in a layer.
FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20

ENV NODE_ENV=production \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0

WORKDIR /app

# The build context is an allowlist (.dockerignore): only the manifest, the lockfile and the version file.
COPY package.json pnpm-lock.yaml .node-version ./

# Production dependencies only, from the frozen lockfile, without running any dependency install script.
RUN corepack pnpm install --prod --frozen-lockfile --ignore-scripts --ignore-pnpmfile

USER node

CMD ["node", "--version"]
