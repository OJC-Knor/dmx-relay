# Deploy as a Proxmox LXC

End-to-end recipe for running soos-lights as an unprivileged Debian 13
LXC container on Proxmox, with the USB-DMX cable passed through from
the Proxmox host.

## 1. Create the container (on the Proxmox host)

Web UI route — easiest:

1. **Create CT** → Debian 13 template, **unprivileged**.
2. CPU: 1–2 cores, RAM: 512 MiB, disk: 4 GiB.
3. Network: bridged DHCP (or a static IP if you prefer pinning it).
4. Start the container.

CLI route, if you'd rather:

```sh
# adjust IDs/IPs as needed
pct create 200 \
  /var/lib/vz/template/cache/debian-13-standard_*_amd64.tar.zst \
  --hostname soos-lights \
  --cores 2 --memory 512 --rootfs local-lvm:4 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --unprivileged 1 --features nesting=1
pct start 200
```

## 2. USB passthrough

On the Proxmox host, plug in the DSD Tech adapter. Confirm it's there:

```sh
ls -l /dev/serial/by-id/
# usb-FTDI_FT232R_USB_UART_BG03CYC2-if00-port0 -> ../../ttyUSB0
```

Edit `/etc/pve/lxc/<vmid>.conf` and append the lines from
[`proxmox-lxc.conf.example`](proxmox-lxc.conf.example). Quick paste:

```text
lxc.cgroup2.devices.allow: c 188:* rwm
lxc.mount.entry: /dev/ttyUSB0 dev/ttyUSB0 none bind,optional,create=file
```

If you have more than one USB-serial device on the host, prefer the
stable by-id path (comment in the example file).

Reboot the container so the bind takes effect:

```sh
pct reboot <vmid>
```

Inside the container:

```sh
ls -l /dev/ttyUSB0
# crw-rw---- 1 root dialout 188, 0 ... /dev/ttyUSB0
```

## 3. Bootstrap the app (inside the LXC)

Enter the container:

```sh
pct enter <vmid>
```

Run the setup script directly off GitHub:

```sh
apt-get update -q && apt-get install -y --no-install-recommends curl ca-certificates
curl -fsSL https://raw.githubusercontent.com/OJC-Knor/dmx-relay/main/deploy/setup.sh | bash
```

That script does, in order:

1. Installs system deps (curl, git, build tools, nodejs 22 from
   nodesource).
2. Creates an unprivileged service user `soos` with home `/opt/soos-lights`,
   adds it to the `dialout` group so it can read `/dev/ttyUSB0`.
3. Clones the repo into `/opt/soos-lights`.
4. Installs `uv` for the `soos` user, runs `uv sync` (which also fetches
   the right Python interpreter).
5. Runs `npm install && npm run build` under `/opt/soos-lights/web/`.
6. Installs and starts the systemd unit.

When it finishes you'll see a `systemctl status` output. The unit
listens on `0.0.0.0:8000`. Open `http://<lxc-ip>:8000/` from anywhere
on the LAN.

## 4. Updating

Inside the LXC, as root:

```sh
bash /opt/soos-lights/deploy/update.sh
```

That pulls the latest commit, re-syncs Python deps, rebuilds the
React bundle, and restarts the service.

## 5. Service management

```sh
systemctl status soos-lights
systemctl restart soos-lights
journalctl -u soos-lights -f       # tail logs

systemctl stop soos-lights         # blackout + free the serial port
systemctl disable soos-lights      # don't start at boot
```

## 6. Troubleshooting

**The app boots but the lights don't react.**
Confirm the service user can see the cable:

```sh
sudo -u soos -H ls -l /dev/ttyUSB0
sudo -u soos -H bash -lc 'cd /opt/soos-lights && uv run python -c "from rig import PORT; print(PORT)"'
```

If `PORT` resolves to a path the user can't read, fix the bind in
`<vmid>.conf` or set `Environment="DMX_PORT=/dev/serial/by-id/..."` in
the systemd unit and `systemctl daemon-reload && systemctl restart soos-lights`.

**`Operation not permitted` on `/dev/ttyUSB0`.**
The unprivileged LXC namespaces UIDs. The `dialout` group inside the
container has a different GID than on the host. Easiest fix: use the
`stable by-id` bind from the example config — the kernel applies the
host udev rules before the bind, so the device shows up with the
right host group, which Proxmox maps. Otherwise add the container's
mapped GID to the host's dialout group.

**Phone can't reach the LXC.**
Container needs its own LAN IP. `pct exec <vmid> ip addr show eth0`.
If you see only a 10.x.x.x or it's missing, check the bridge / DHCP.

**WebSocket connection failed in browser.**
That's the `uvicorn[standard]` problem we hit on dev. The deploy
already pins it via `pyproject.toml`, but if you ever installed without
extras, run `uv add 'uvicorn[standard]'` and restart the service.

## 7. What lives where

```
/opt/soos-lights/             repo + state
├── .venv/                    Python interpreter + deps (created by uv sync)
├── .local/bin/uv             uv binary
├── web/dist/                 built React bundle (created by npm run build)
├── state/                    layout.json + patterns.json (writable)
└── deploy/                   these scripts

/etc/systemd/system/soos-lights.service     -- copied from deploy/
/etc/pve/lxc/<vmid>.conf                    -- USB passthrough lines
```
