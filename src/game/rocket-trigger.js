// A tap and a hold both launch once on release. Interruptions cancel the hold.
export function createRocketTrigger() {
  let held = false;
  return {
    get held() { return held; },
    press(allowed, repeat = false) { if (!repeat && allowed) held = true; },
    release(allowed) { const fire = held && allowed; held = false; return fire; },
    cancel() { held = false; },
  };
}
