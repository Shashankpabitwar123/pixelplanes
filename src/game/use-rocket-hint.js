import {useCallback, useEffect, useRef, useState} from 'react';
const KEY = 'pixelplanes-rocket-hint-v1';
export function useRocketHint(gameStarted, gameMode) {
  const saved = useRef(null);
  if (!saved.current) {
    try {
      const value = JSON.parse(localStorage.getItem(KEY));
      saved.current = {matches: Math.max(0, Number(value?.matches) || 0), learned: value?.learned === true};
    } catch { saved.current = {matches: 0, learned: false}; }
  }
  const [visible, setVisible] = useState(false);
  const persist = () => {try {localStorage.setItem(KEY, JSON.stringify(saved.current));} catch {}};
  useEffect(() => {
    if (!gameStarted || gameMode === 'training' || saved.current.learned || saved.current.matches >= 3) {
      setVisible(false); return;
    }
    saved.current.matches++;
    persist();
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 6000);
    const dismiss = event => {if (event.code === 'KeyR') setVisible(false);};
    window.addEventListener('keydown', dismiss);
    return () => {window.clearTimeout(timer);window.removeEventListener('keydown', dismiss);};
  }, [gameStarted, gameMode]);
  const learned = useCallback(() => {
    saved.current.learned = true;
    try {localStorage.setItem(KEY, JSON.stringify(saved.current));} catch {}
    setVisible(false);
  }, []);
  return {visible, learned};
}
