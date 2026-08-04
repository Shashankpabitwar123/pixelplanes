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
VITE_MULTIPLAYER_REGIONS='["wss://pixelplanes-realtime-us.onrender.com/rooms","wss://pixelplanes-realtime-eu.onrender.com/rooms","wss://pixelplanes-realtime-asia.onrender.com/rooms"]'
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
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret
REGIONAL_ROOMS_ENABLED=false
REGION_ID=eu
PUBLIC_WS_URL=wss://pixelplanes-realtime-eu.onrender.com/rooms
REDIS_URL=rediss://your_managed_redis_url
```

Rooms and gameplay sync run through the Render WebSocket server. Voice uses
[LiveKit Cloud](https://livekit.io/cloud) when all three `LIVEKIT_*` backend
variables are set. The Node service issues a one-hour token only after the
player has joined a PixelPlanes room; the browser receives that temporary token
and the Cloud URL, never the API key or secret. Tokens are restricted to one
`pixelplanes-ROOMCODE` voice room, one player identity, microphone publishing,
and audio subscription.

Do **not** add a `VITE_LIVEKIT_API_SECRET`, `VITE_LIVEKIT_API_KEY`, or any
other LiveKit secret to Vercel. Add the three `LIVEKIT_*` values only to the
Render realtime service. The older direct WebRTC path remains an automatic
local-development fallback only when LiveKit is not configured. It still gets
ICE/TURN details from `/voice/ice-servers`; keep `TURN_*` configured only if
that fallback is intentionally needed. Do not put secret TURN credentials in
`VITE_RTC_ICE_SERVERS`.

### LiveKit Cloud + always-on Render setup

1. Create a LiveKit Cloud project and copy its secure WebSocket project URL,
   API key, and API secret. Keep the secret private.
2. In the **Render dashboard** for `pixelplanes-realtime-eu`, add
   `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET`. Do not add them
   to Vercel. Deploy/restart the realtime service after saving them.
3. Change that realtime service to an always-on paid instance. The repository
   blueprint requests `starter` in `render.yaml`, but the active service's
   dashboard plan and billing must be confirmed by the project owner.
4. Deploy the frontend and test two different browsers in one room: allow each
   microphone, confirm the speaker indicators react, mute/unmute each player,
   then leave and rejoin.

LiveKit Cloud carries voice through its managed global media network. The
Frankfurt Render game service still remains the authority for all room physics,
so a player far from Frankfurt will still have network latency in plane input
and combat. LiveKit solves the group-voice/SFU side; a future multi-region game
state service with shared room state is the separate next scaling step.

### Regional room routing (prepared, off by default)

The repository now contains the first safe part of the regional game rollout.
It remains disabled until `REGIONAL_ROOMS_ENABLED=true` is set on **every**
regional game service and all services share one reachable Redis/Valkey
`REDIS_URL`. With the flag off, the current Frankfurt WebSocket room behavior
is unchanged.

When enabled, a room owner record is written with the room code, owning region,
and public `/rooms` WebSocket URL. A player who reaches a different regional
server for a join or reconnect receives a validated `room_redirect`; the
browser follows it automatically. Redis is used only for ownership, routing,
and lease refreshes. Each live match still has exactly one Node server running
its 60 Hz simulation; it is never replicated frame-by-frame through Redis.

Before enabling the flag, create these three always-on Render web services from
the same commit and give each the same `REDIS_URL`, `CLIENT_ORIGIN`,
`CLIENT_ORIGINS`, and `LIVEKIT_*` values:

- `pixelplanes-realtime-us` — Virginia, `REGION_ID=us-east`
- `pixelplanes-realtime-eu` — Frankfurt, `REGION_ID=eu`
- `pixelplanes-realtime-asia` — Singapore, `REGION_ID=asia`

Set each service's `PUBLIC_WS_URL` to its own public `wss://.../rooms` URL.
Only then enable `REGIONAL_ROOMS_ENABLED=true` in all three services. New-room
regional placement is enabled by adding the three non-secret URLs to Vercel as
the JSON `VITE_MULTIPLAYER_REGIONS` value, then redeploying the frontend. The
browser measures each service's public health endpoint when a host creates a
room and chooses the quickest available one. Existing rooms safely route joins
and reconnects to the server that owns them.

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
npm run test:directory
npm run test:voice
npm run build
```

`test:room` verifies sequencing, fuel, weapons, collisions, and respawns.
`test:server` starts a temporary WebSocket service and verifies input handling,
rejection of a forged player-state message, LiveKit being unavailable without
credentials, and reconnect recovery. `test:voice` validates that issued
LiveKit tokens are scoped to exactly one room and player. `test:directory`
validates that regional routing cannot activate with missing or unsafe settings.

### Production gaps to provision before a global launch

The committed source provides the LiveKit Cloud integration, always-on Render
configuration, and disabled regional room-directory code. It cannot create the
new paid regional services, activate Redis billing, or enter external secrets
for you. The active production game server remains a single Frankfurt service
until the regional services are provisioned and the feature flag is enabled.

For a true global production launch, provision and configure all of the
following outside this repository:

- Two additional non-sleeping WebSocket services: Virginia and Singapore.
- A managed Redis/Valkey directory that all three services can reach securely.
- Monitoring, rate-limit alerts, structured logs, and load testing before
  raising the room or region limits.
