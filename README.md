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
WS   ws://127.0.0.1:4000/rooms
POST http://127.0.0.1:4000/voice/token
```

Frontend multiplayer env vars:

```bash
VITE_WS_URL=wss://your-render-service.onrender.com/rooms
VITE_API_URL=https://your-render-service.onrender.com
```

Backend env vars:

```bash
CLIENT_ORIGIN=https://pixelplanes.app
DATABASE_URL=your_neon_postgres_url
LIVEKIT_URL=your_livekit_cloud_ws_url
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret
```

Rooms work without LiveKit. Voice tokens require the three LiveKit values.
