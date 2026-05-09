#!/usr/bin/env bash
# Bootstrap soos-lights inside a fresh Debian 13 LXC.
# Run as root: bash setup.sh
set -euo pipefail

REPO="${REPO:-https://github.com/OJC-Knor/dmx-relay.git}"
TARGET="${TARGET:-/opt/soos-lights}"
SVC_USER="${SVC_USER:-soos}"
NODE_VERSION="${NODE_VERSION:-22}"

log() { printf "\n\033[1;36m==>\033[0m %s\n" "$*"; }

require_root() {
  [ "$(id -u)" -eq 0 ] || { echo "run as root" >&2; exit 1; }
}

apt_install() {
  log "installing system packages"
  apt-get update -q
  apt-get install -y --no-install-recommends \
    ca-certificates curl git jq \
    build-essential pkg-config \
    libffi-dev libssl-dev
}

install_node() {
  if command -v node >/dev/null 2>&1 \
     && [ "$(node -v | cut -d. -f1 | tr -d v)" -ge 18 ]; then
    log "node $(node -v) already present"
    return
  fi
  log "installing nodejs ${NODE_VERSION}.x via nodesource"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
  apt-get install -y nodejs
}

create_user() {
  if id -u "$SVC_USER" >/dev/null 2>&1; then
    log "user '$SVC_USER' already exists"
  else
    log "creating user '$SVC_USER' with home=$TARGET"
    useradd --system --create-home --home-dir "$TARGET" --shell /bin/bash "$SVC_USER"
  fi
  # /dev/ttyUSB* is owned by group dialout — service user needs membership
  usermod -aG dialout "$SVC_USER"
}

clone_repo() {
  if [ -d "$TARGET/.git" ]; then
    log "repo already at $TARGET — pulling"
    sudo -u "$SVC_USER" -H git -C "$TARGET" pull --ff-only
  else
    log "cloning $REPO -> $TARGET"
    sudo -u "$SVC_USER" -H git clone "$REPO" "$TARGET"
  fi
}

install_uv() {
  if sudo -u "$SVC_USER" -H bash -lc 'command -v uv' >/dev/null 2>&1; then
    log "uv already installed for $SVC_USER"
    return
  fi
  log "installing uv for $SVC_USER"
  sudo -u "$SVC_USER" -H bash -lc '
    curl -LsSf https://astral.sh/uv/install.sh | sh
  '
}

install_python_deps() {
  log "installing python deps (uv sync)"
  sudo -u "$SVC_USER" -H bash -lc "
    cd $TARGET
    \$HOME/.local/bin/uv sync
  "
}

build_web() {
  log "building the web UI"
  sudo -u "$SVC_USER" -H bash -lc "
    cd $TARGET/web
    npm install --no-audit --no-fund
    npm run build
  "
}

install_service() {
  log "installing systemd unit"
  install -m 644 "$TARGET/deploy/soos-lights.service" /etc/systemd/system/soos-lights.service
  systemctl daemon-reload
  systemctl enable soos-lights
  systemctl restart soos-lights
  sleep 1
  systemctl status soos-lights --no-pager || true
}

main() {
  require_root
  apt_install
  install_node
  create_user
  clone_repo
  install_uv
  install_python_deps
  build_web
  install_service
  log "done. listening on :8000 — open http://<lxc-ip>:8000/"
}

main "$@"
