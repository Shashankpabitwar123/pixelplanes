import React from 'react';
import { ROOM_MAX_PLAYERS } from './config.js';

export const PLANE_COLOR_ASSETS = {
  blue: {
    label: 'Blue',
    staticSrc: '/assets/exact-plane.png',
    noPropSrc: '/assets/exact-plane-no-prop.png',
  },
  red: {
    label: 'Red',
    staticSrc: '/assets/exact-plane-red.png',
    noPropSrc: '/assets/exact-plane-no-prop-red.png',
  },
  yellow: {
    label: 'Yellow',
    staticSrc: '/assets/exact-plane-yellow.png',
    noPropSrc: '/assets/exact-plane-no-prop-yellow.png',
  },
  purple: {
    label: 'Purple',
    staticSrc: '/assets/exact-plane-purple.png',
    noPropSrc: '/assets/exact-plane-no-prop-purple.png',
  },
  green: {
    label: 'Green',
    staticSrc: '/assets/exact-plane-green.png',
    noPropSrc: '/assets/exact-plane-no-prop-green.png',
  },
  cyan: {
    label: 'Cyan',
    staticSrc: '/assets/exact-plane-cyan.png',
    noPropSrc: '/assets/exact-plane-no-prop-cyan.png',
  },
};

export const PLANE_COLOR_IDS = ['blue', 'red', 'yellow', 'purple', 'green', 'cyan'];

export const PLANE_COLOR_OPTIONS = PLANE_COLOR_IDS.map((id) => ({ id, ...PLANE_COLOR_ASSETS[id] }));

function generateRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

function pickRoomPlaneColor() {
  return PLANE_COLOR_IDS[Math.floor(Math.random() * PLANE_COLOR_IDS.length)];
}

export function createLocalRoomLobby(name, theme) {
  const hostColor = pickRoomPlaneColor();
  return {
    code: generateRoomCode(),
    theme,
    hostId: 'host',
    started: false,
    maxPlayers: ROOM_MAX_PLAYERS,
    players: [
      {
        id: 'host',
        name: name.trim() || 'Player 1',
        color: hostColor,
        role: 'Host',
        kills: 0,
        micEnabled: true,
        speakerEnabled: true,
      },
    ],
  };
}

export function RoomMicIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path className="room-audio-fill" d="M32 5c8.3 0 15 6.7 15 15v16c0 8.3-6.7 15-15 15s-15-6.7-15-15V20C17 11.7 23.7 5 32 5Z" />
      <path className="room-audio-stroke" d="M13 28v7c0 10.5 8.5 19 19 19s19-8.5 19-19v-7" strokeWidth="5" strokeLinecap="round" />
      <path className="room-audio-stroke" d="M32 54v7M22 61h20" strokeWidth="5" strokeLinecap="round" />
      <path className="room-audio-cut" d="M21 21h22M21 27h22M21 33h22" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function RoomSpeakerIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path className="room-audio-fill" d="M8 24h13L39 10v44L21 40H8V24Z" />
      <path className="room-audio-stroke" d="M46 23c3.1 2.1 5 5.4 5 9s-1.9 6.9-5 9M52 15c5.8 4.1 9 10.1 9 17s-3.2 12.9-9 17" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

export const PLANE_LIGHT_COMBOS = {
  classic: {
    label: 'Red and green',
    front: '#ff1f33',
    back: '#2cff65',
    frontGlow: 'rgba(255, 31, 51, 0.98)',
    frontGlowSoft: 'rgba(255, 31, 51, 0.72)',
    frontGlowWide: 'rgba(255, 31, 51, 0.44)',
    backGlow: 'rgba(44, 255, 101, 0.98)',
    backGlowSoft: 'rgba(44, 255, 101, 0.72)',
    backGlowWide: 'rgba(44, 255, 101, 0.44)',
  },
  amberCyan: {
    label: 'Amber and cyan',
    front: '#ffb21f',
    back: '#25e6ff',
    frontGlow: 'rgba(255, 178, 31, 0.98)',
    frontGlowSoft: 'rgba(255, 178, 31, 0.72)',
    frontGlowWide: 'rgba(255, 178, 31, 0.44)',
    backGlow: 'rgba(37, 230, 255, 0.98)',
    backGlowSoft: 'rgba(37, 230, 255, 0.72)',
    backGlowWide: 'rgba(37, 230, 255, 0.44)',
  },
  violetLime: {
    label: 'Violet and lime',
    front: '#b95cff',
    back: '#d7ff38',
    frontGlow: 'rgba(185, 92, 255, 0.98)',
    frontGlowSoft: 'rgba(185, 92, 255, 0.72)',
    frontGlowWide: 'rgba(185, 92, 255, 0.44)',
    backGlow: 'rgba(215, 255, 56, 0.98)',
    backGlowSoft: 'rgba(215, 255, 56, 0.72)',
    backGlowWide: 'rgba(215, 255, 56, 0.44)',
  },
  botYellow: {
    label: 'Yellow and yellow',
    front: '#ffe53a',
    back: '#ffe53a',
    frontGlow: 'rgba(255, 229, 58, 0.98)',
    frontGlowSoft: 'rgba(255, 229, 58, 0.72)',
    frontGlowWide: 'rgba(255, 201, 31, 0.48)',
    backGlow: 'rgba(255, 229, 58, 0.98)',
    backGlowSoft: 'rgba(255, 229, 58, 0.72)',
    backGlowWide: 'rgba(255, 201, 31, 0.48)',
  },
};

export const PLANE_LIGHT_OPTIONS = ['classic', 'amberCyan', 'violetLime'].map((id) => ({ id, ...PLANE_LIGHT_COMBOS[id] }));
