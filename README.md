# Bit Planes

Browser prototype for a Bit Planes-inspired game with a large scrolling map, playable plane physics, fuel, bullets, rockets, music controls, dark mode, and animated farm background.

## Run Locally

From the current local project folder:

```bash
cd /Users/shashankpabitwar/Documents/Codex/2026-07-10/ok/work/bitplanes-live-background
npm install
npm run dev
```

Then open the local URL Vite prints in the terminal. It is usually:

```text
http://127.0.0.1:5173/
```

If that port is already busy, Vite will choose another port and print the correct URL.

To clone the GitHub repo fresh:

```bash
git clone https://github.com/Shashankpabitwar123/bit-planes.git
cd bit-planes
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Multiplayer Backend

The repo now includes a Node WebSocket server in `server/index.js`.

Run it locally:

```bash
npm run server:start
```

Useful local endpoints:

```text
GET  http://127.0.0.1:4000/health
GET  http://127.0.0.1:4000/voice/ice-servers
WS   ws://127.0.0.1:4000/rooms
```

Frontend multiplayer env vars:

```bash
VITE_WS_URL=wss://pixelplanes-realtime-eu.onrender.com/rooms
VITE_API_URL=https://pixelplanes-realtime-eu.onrender.com
VITE_RTC_ICE_SERVERS='[{"urls":["stun:stun.l.google.com:19302","stun:stun1.l.google.com:19302"]}]'
```

Backend env vars:

```bash
CLIENT_ORIGIN=https://pixelplanes.app
DATABASE_URL=your_neon_postgres_url
STUN_URLS=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302
TURN_URLS=turn:your-turn-host:3478,turns:your-turn-host:5349
TURN_USERNAME=your_static_turn_username
TURN_CREDENTIAL=your_static_turn_password
TURN_SHARED_SECRET=optional_turn_rest_shared_secret
TURN_TTL_SECONDS=86400
```

Rooms, gameplay sync, and voice signaling run through the Render WebSocket server.
Production uses the Frankfurt Render service (`pixelplanes-realtime-eu`) to
balance latency between US and India players.
Voice audio uses direct browser WebRTC. The frontend fetches ICE servers from
`/voice/ice-servers`, so TURN credentials stay on the backend. Use either
`TURN_USERNAME` + `TURN_CREDENTIAL` for static TURN credentials or
`TURN_SHARED_SECRET` for temporary coturn-style REST credentials. Do not put
secret TURN credentials in `VITE_RTC_ICE_SERVERS`; that value is only a local
fallback.

### Room simulation contract

Room matches are server-authoritative. Browsers send only sequenced control
input (`power`, `down`, `left`, `right`, `fire`, `light`, and a rocket press).
The Node service runs the shared flight, fuel, ammo, reload, rocket, collision,
damage, kill, and respawn rules at 60 Hz and sends 20 Hz snapshots. A browser
keeps local prediction for responsive controls, then smoothly corrects to the
server state when necessary.

The standard room rules are deliberately fixed: 30-second fuel, seven bullets,
60 ms burst cadence, seven-second reload, two rockets, two seconds of homing,
and a five-second rocket lifetime. Solo and training sliders never alter a room
match.

Each room session uses an opaque reconnect token stored in browser session
storage. A dropped connection can resume the same pilot for 30 seconds. The
server also rejects client-owned position, projectile, hit, and score messages,
checks WebSocket origins in production, caps messages at 16 KB, and rate-limits
inbound messages.

### Local multiplayer verification

```bash
npm run test:room
npm run test:server
npm run build
```

`test:room` verifies sequencing, fuel, weapons, collisions, and respawns.
`test:server` starts a temporary WebSocket service and verifies input handling,
rejection of a forged player-state message, and reconnect recovery.

### Production gaps to provision before a global launch

The committed source improves match authority and recovery, but it does not by
itself create multi-region capacity or an SFU voice service. The currently
configured Render service is a single Frankfurt free-tier instance, and voice
remains direct WebRTC mesh for rooms of up to six pilots.

For a true global production launch, provision and configure all of the
following outside this repository:

- A non-sleeping, horizontally scalable WebSocket runtime in more than one
  region, with sticky/session-aware routing.
- Redis (or an equivalent shared real-time state layer) so rooms survive an
  individual server restart and can span multiple instances.
- A managed WebRTC SFU such as LiveKit or Daily for reliable group voice rather
  than browser-to-browser mesh, plus TURN capacity in the regions you serve.
- Monitoring, rate-limit alerts, structured logs, and load testing before
  raising the room or region limits.
