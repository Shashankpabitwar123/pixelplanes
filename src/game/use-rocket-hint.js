import {useCallback, useEffect, useRef, useState} from 'react';

export function useRocketHint(gameStarted, gameMode) {
  // Page-lifetime state: refreshing or reopening starts a fresh two-match allowance.
  const matches = useRef(0);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!gameStarted || gameMode === 'training' || matches.current >= 2) {
      setVisible(false); return;
    }
    matches.current++;
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 6000);
    const dismiss = event => {if (event.code === 'KeyR') setVisible(false);};
    window.addEventListener('keydown', dismiss);
    return () => {window.clearTimeout(timer);window.removeEventListener('keydown', dismiss);};
  }, [gameStarted, gameMode]);
  const learned = useCallback(() => setVisible(false), []);
  return {visible, learned};
}
