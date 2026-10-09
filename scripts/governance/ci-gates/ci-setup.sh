#!/usr/bin/env bash
# CI toolchain bootstrap (Foundation Task 2; STACK-ADR-002 6.7). No third-party GitHub Action is used: Node.js is
# downloaded and verified against a pinned SHA-256, pnpm is provided by the Node.js bundled corepack and verified against
# the integrity hash in package.json "packageManager", and the frozen lockfile is installed without install scripts.
#
# Usage: bash scripts/governance/ci-gates/ci-setup.sh [--install] [--gitleaks]
# Required environment (set once at workflow level): NODE_VERSION, NODE_SHA256, RUNNER_TEMP, GITHUB_PATH.
# With --gitleaks also GITLEAKS_VERSION and GITLEAKS_SHA256; GITLEAKS_BIN is then exported through GITHUB_ENV.
set -euo pipefail

want_install=0
want_gitleaks=0
for arg in "$@"; do
  case "$arg" in
    --install) want_install=1 ;;
    --gitleaks) want_gitleaks=1 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

: "${NODE_VERSION:?}" "${NODE_SHA256:?}" "${RUNNER_TEMP:?}" "${GITHUB_PATH:?}"

node_dir="$RUNNER_TEMP/node-${NODE_VERSION}-linux-x64"
curl -fsSL --retry 3 -o "$RUNNER_TEMP/node.tar.gz" "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-x64.tar.gz"
echo "${NODE_SHA256}  $RUNNER_TEMP/node.tar.gz" | sha256sum -c -
tar -xzf "$RUNNER_TEMP/node.tar.gz" -C "$RUNNER_TEMP"
export PATH="$node_dir/bin:$PATH"
echo "$node_dir/bin" >> "$GITHUB_PATH"

# The exact Node.js version must be the one in .node-version (it is also checked by the gate catalogue).
test "$(node --version)" = "v$(tr -d '[:space:]' < .node-version)"

if [ "$want_install" = "1" ]; then
  # Frozen lockfile (fails if the lockfile would change), no dependency install scripts, and no .pnpmfile hook code.
  corepack pnpm install --frozen-lockfile --ignore-scripts --ignore-pnpmfile
  git diff --exit-code -- pnpm-lock.yaml package.json
fi

if [ "$want_gitleaks" = "1" ]; then
  : "${GITLEAKS_VERSION:?}" "${GITLEAKS_SHA256:?}" "${GITHUB_ENV:?}"
  mkdir -p "$RUNNER_TEMP/gitleaks"
  curl -fsSL --retry 3 -o "$RUNNER_TEMP/gitleaks.tar.gz" "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz"
  echo "${GITLEAKS_SHA256}  $RUNNER_TEMP/gitleaks.tar.gz" | sha256sum -c -
  tar -xzf "$RUNNER_TEMP/gitleaks.tar.gz" -C "$RUNNER_TEMP/gitleaks" gitleaks
  echo "GITLEAKS_BIN=$RUNNER_TEMP/gitleaks/gitleaks" >> "$GITHUB_ENV"
fi
