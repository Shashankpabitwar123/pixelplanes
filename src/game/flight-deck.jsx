import { WEATHER_LABELS } from './weather.js';
import React, { useEffect, useRef } from 'react';
import { BOT_SKILL_LABELS } from './bot-ai.js';
import { MAX_SOLO_BOTS } from './config.js';

function Slider({ label, value, min = 0, max = 100, suffix = '%', onChange, disabled = false }) {
  return <label className="deck-slider"><span>{label}<output>{value}{suffix}</output></span>
    <input type="range" aria-label={label} min={min} max={max} value={value} disabled={disabled} onChange={onChange} />
  </label>;
}
export function FlightDeck({ rules, onRule, definitions, musicVolume, onMusic, effectsVolume, onEffects,
  muted, onMute, warningEnabled, onWarning, levels, onLevel, light, onLight, theme, onTheme, onReset, onClose }) {
  const panel = useRef(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    panel.current.querySelector('button').focus();
    const onKey = event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab') return;
      const nodes = [...panel.current.querySelectorAll('button, input, select, summary')].filter(n => !n.disabled && n.getClientRects().length);
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    panel.current.addEventListener('keydown', onKey);
    const node = panel.current;
    return () => { node.removeEventListener('keydown', onKey); previous?.focus(); };
  }, []);
  const choose = (key, value) => onRule(key, { target: { value } });
  return <section className="start-utility-overlay deck-overlay" aria-label="Flight deck settings">
    <div className="deck-panel" ref={panel} role="dialog" aria-modal="true" aria-labelledby="deck-title">
      <header className="deck-header"><div><span className="deck-eyebrow">PREFLIGHT SETUP</span><h2 id="deck-title">FLIGHT DECK</h2></div>
        <button className="deck-close" aria-label="Close settings" onClick={onClose}>×</button></header>
      <div className="deck-body">
        <div className="deck-main">
          <section className="deck-section"><h3>Your flight</h3>

            <div className="deck-bots"><div><strong>Enemy bots</strong><small>Choose your company in the sky</small></div>
              <div className="deck-stepper"><button aria-label="Fewer enemy bots" disabled={rules.botCount <= 1} onClick={() => choose('botCount', rules.botCount - 1)}>−</button><output aria-live="polite">{rules.botCount}</output><button aria-label="More enemy bots" disabled={rules.botCount >= MAX_SOLO_BOTS} onClick={() => choose('botCount', rules.botCount + 1)}>+</button></div>
            </div>
            <fieldset className="deck-choices deck-theme"><legend>World theme</legend><div>
              <button type="button" aria-pressed={theme === 'light'} onClick={() => onTheme('light')}>☀ Light</button>
              <button type="button" aria-pressed={theme === 'dark'} onClick={() => onTheme('dark')}>☾ Dark</button>
            </div></fieldset>
            <fieldset className="deck-choices"><legend>Difficulty</legend><div>{BOT_SKILL_LABELS.map((name, i) => <button key={name} aria-pressed={rules.botDifficulty === i + 1} onClick={() => choose('botDifficulty', i + 1)}>{name}</button>)}</div></fieldset>
            <fieldset className="deck-choices"><legend>Weather</legend><div>{WEATHER_LABELS.map((name, i) => <button key={name} aria-pressed={rules.weatherMode === i} onClick={() => choose('weatherMode', i)}>{name}</button>)}</div></fieldset>
            <p className="deck-note">Bots are for solo play. Training may override weather for a lesson.</p>
          </section>
          <section className="deck-section"><h3>Your sound</h3>
            <Slider label="Music" value={Math.round(musicVolume * 100)} onChange={onMusic} />
            <Slider label="Sound effects" value={Math.round(effectsVolume * 100)} onChange={onEffects} disabled={muted} />
            <div className="deck-toggle"><span>Mute all audio</span><button role="switch" aria-label="Mute all audio" aria-checked={muted} onClick={onMute}>{muted ? 'Muted' : 'Off'}</button></div>
            <div className="deck-toggle"><div><span>Pull-up audio</span><small>The red visual alert stays on</small></div><button role="switch" aria-label="Pull-up warning audio" aria-checked={warningEnabled} onClick={onWarning}>{warningEnabled ? 'On' : 'Off'}</button></div>
            <p className="deck-note">Music softens automatically during audible warnings.</p>
          </section>
        </div>
        <details className="deck-details"><summary>Advanced gameplay <span>Handling &amp; fuel</span></summary><div className="deck-advanced">
          {definitions.filter(c => ['flightPace', 'turnPace', 'fuelSeconds'].includes(c.key)).map(c => <Slider key={c.key} label={c.label} min={c.min} max={c.max} value={rules[c.key]} suffix={c.key === 'bulletCooldownMs' ? ' ms' : ['fuelSeconds','bulletReloadSeconds'].includes(c.key) ? ' s' : '%'} onChange={e => onRule(c.key,e)} />)}
          <p className="deck-note">70% is the default flight feel. Increase speed or turning to boost your plane; bots keep their normal handling. Solo and training only.</p>
        </div></details>
        <details className="deck-details"><summary>Sound mix &amp; appearance <span>Individual sounds &amp; lights</span></summary><div className="deck-advanced">
          {[['engine','Propeller'],['combat','Combat sounds'],['rain','Rain']].map(([key,label]) => <Slider key={key} label={`${label} volume`} value={Math.round((key === 'combat' ? levels.ammo : levels[key])*100)} onChange={e => onLevel(key,e)} />)}
          <Slider label="Plane light brightness" value={Math.round(light*100)} onChange={onLight} />
          <p className="deck-note">Individual sound levels are scaled by the overall effects volume.</p>
        </div></details>
      </div>
      <footer className="deck-footer"><button className="deck-reset" onClick={onReset}>Restore all defaults</button><button className="deck-done" onClick={onClose}>Ready to fly</button></footer>
    </div>
  </section>;
}
