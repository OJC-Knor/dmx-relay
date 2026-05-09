#!/usr/bin/env bash
# Pull latest, rebuild, restart. Run as root inside the LXC.
set -euo pipefail

TARGET="${TARGET:-/opt/soos-lights}"
SVC_USER="${SVC_USER:-soos}"

log() { printf "\n\033[1;36m==>\033[0m %s\n" "$*"; }

[ "$(id -u)" -eq 0 ] || { echo "run as root" >&2; exit 1; }

log "git pull"
sudo -u "$SVC_USER" -H git -C "$TARGET" pull --ff-only

log "uv sync"
sudo -u "$SVC_USER" -H bash -lc "cd $TARGET && \$HOME/.local/bin/uv sync"

log "rebuild web"
sudo -u "$SVC_USER" -H bash -lc "cd $TARGET/web && npm install --no-audit --no-fund && npm run build"

log "restart service"
systemctl restart soos-lights
sleep 1
systemctl status soos-lights --no-pager || true
