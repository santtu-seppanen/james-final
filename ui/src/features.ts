// Which parts of the UI have a working backend behind them. Everything
// the touchscreen design (issue #11) calls for is laid out in the
// components, but anything whose server side doesn't exist yet is either
// hidden or rendered disabled with a "not connected" note, so the kiosk
// never offers a button that silently does nothing.
//
// Flip a flag here once the matching backend lands. For design previews
// on a laptop you can also set VITE_FEATURES=show,estop,... at dev time.
const previewFlags = new Set(
  (import.meta.env.VITE_FEATURES || '')
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean),
);

function flag(name: string, implemented: boolean): boolean {
  return implemented || previewFlags.has(name);
}

export const features = {
  // Issue #4/#5: /drinkme {show: true}, music + beat map, Skip-show.
  show: flag('show', false),
  // Issue #19: strength factor applied server-side.
  strength: flag('strength', false),
  // Issue #9: POST /api/estop + servoState {estop}.
  estop: flag('estop', false),
  // Issue #9: glass detection sensor.
  glassSensor: flag('glassSensor', false),
  // Issue #18: order queue with names.
  queue: flag('queue', false),
  // Issue #1/#2: LED strip (brightness, idle scene, segment test).
  leds: flag('leds', false),
  // Issue #3: speaker (effects, volume, sound test).
  sound: flag('sound', false),
  // Issue #10: per-servo open/close, prime, flush, belt home endpoints.
  maintenance: flag('maintenance', false),
};
