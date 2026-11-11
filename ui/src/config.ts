// This PIN only gates clearing the emergency-stop lock on the client - anyone opening
// devtools on the kiosk can read it out of the bundle. It's a deterrent
// against casual taps on a touchscreen, not real access control. Set
// VITE_ADMIN_PIN at build time (see .env.example) instead of hardcoding a
// value here, so a public repo doesn't ship the real PIN.
export const ADMIN_PIN = import.meta.env.VITE_ADMIN_PIN || '0000';

// Kiosk timings (used to be admin-editable settings).
export const DONE_SECONDS = 15; // auto-return from the Done screen

// The touchscreen is a landscape panel mounted on its side. While the
// viewport is wider than tall the whole UI is turned this many degrees
// clockwise (90 or 270 - flip it if the picture comes out upside down).
export const PORTRAIT_ROTATION: 90 | 270 = 90;
