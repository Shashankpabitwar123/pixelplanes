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
VITE_WS_URL=wss://your-render-service.onrender.com/rooms
VITE_API_URL=https://your-render-service.onrender.com
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
Voice audio uses direct browser WebRTC. The frontend fetches ICE servers from
`/voice/ice-servers`, so TURN credentials stay on the backend. Use either
`TURN_USERNAME` + `TURN_CREDENTIAL` for static TURN credentials or
`TURN_SHARED_SECRET` for temporary coturn-style REST credentials. Do not put
secret TURN credentials in `VITE_RTC_ICE_SERVERS`; that value is only a local
fallback.
