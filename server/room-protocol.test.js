import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import test from 'node:test';
import { WebSocket } from 'ws';

const TEST_PORT = 46117;

function waitForMessage(socket, predicate, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error('Timed out waiting for server message.'));
    }, timeoutMs);
    const onMessage = (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!predicate(message)) return;
      clearTimeout(timeout);
      socket.off('message', onMessage);
      resolve(message);
    };
    socket.on('message', onMessage);
  });
}

async function startTestServer() {
  const server = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      NODE_ENV: 'test',
      CLIENT_ORIGIN: 'http://127.0.0.1:5173',
      DATABASE_URL: '',
      LIVEKIT_URL: '',
      LIVEKIT_API_KEY: '',
      LIVEKIT_API_SECRET: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  server.stdout.on('data', (chunk) => { output += chunk.toString(); });
  server.stderr.on('data', (chunk) => { output += chunk.toString(); });
  const started = Date.now();
  while (!output.includes('realtime server listening')) {
    if (Date.now() - started > 3000) {
      server.kill('SIGTERM');
      throw new Error(`Realtime server did not start: ${output}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return server;
}

test('WebSocket room protocol accepts inputs and rejects client-owned state', async (t) => {
  const server = await startTestServer();
  let socket;
  t.after(async () => {
    if (socket) {
      socket.close();
      await once(socket, 'close').catch(() => {});
    }
    server.kill('SIGTERM');
    await once(server, 'exit').catch(() => {});
  });

  socket = new WebSocket(`ws://127.0.0.1:${TEST_PORT}/rooms`);
  await once(socket, 'open');
  socket.send(JSON.stringify({ type: 'create_room', name: 'Test Pilot', theme: 'dark' }));
  const session = await waitForMessage(socket, (message) => message.type === 'room_session');
  assert.ok(session.resumeToken);
  socket.send(JSON.stringify({ type: 'request_livekit_token' }));
  const voiceUnavailable = await waitForMessage(socket, (message) => message.type === 'voice_unavailable');
  assert.equal(voiceUnavailable.provider, 'livekit');
  socket.send(JSON.stringify({ type: 'start_room' }));
  await waitForMessage(socket, (message) => message.type === 'room_started');

  socket.send(JSON.stringify({
    type: 'room_input',
    seq: 1,
    input: { power: true, fire: true, rocketPress: 1 },
  }));
  const snapshot = await waitForMessage(socket, (message) => message.type === 'room_snapshot' && message.inputSeq === 1);
  assert.equal(snapshot.local.weapons.rockets, 1);
  assert.ok(snapshot.local.state.fuel < 30);

  socket.send(JSON.stringify({ type: 'player_state', state: { x: 1, y: 399 } }));
  const rejection = await waitForMessage(socket, (message) => message.type === 'room_error');
  assert.match(rejection.message, /Unknown message type/);

  socket.close();
  await once(socket, 'close');
  await new Promise((resolve) => setTimeout(resolve, 50));
  socket = new WebSocket(`ws://127.0.0.1:${TEST_PORT}/rooms`);
  await once(socket, 'open');
  socket.send(JSON.stringify({
    type: 'resume_room',
    code: session.roomCode,
    resumeToken: session.resumeToken,
  }));
  const resumed = await waitForMessage(socket, (message) => message.type === 'room_resumed');
  assert.equal(resumed.localPlayerId, session.playerId);
  assert.equal(resumed.room.started, true);
});

test('room lobby actions are throttled without disconnecting a player', async (t) => {
  const server = await startTestServer();
  const socket = new WebSocket(`ws://127.0.0.1:${TEST_PORT}/rooms`);
  t.after(async () => {
    socket.close();
    await once(socket, 'close').catch(() => {});
    server.kill('SIGTERM');
    await once(server, 'exit').catch(() => {});
  });

  await once(socket, 'open');
  const throttled = waitForMessage(socket, (message) =>
    message.type === 'room_error' && /Please wait a moment before creating or joining/i.test(message.message),
  );
  for (let attempt = 0; attempt < 9; attempt += 1) {
    socket.send(JSON.stringify({ type: 'join_room', code: 'NOTFOUND' }));
  }

  await throttled;
  assert.equal(socket.readyState, WebSocket.OPEN);
});
