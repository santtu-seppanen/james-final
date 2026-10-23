// This PIN only gates the admin screens on the client - anyone opening
// devtools on the kiosk can read it out of the bundle. It's a deterrent
// against casual taps on a touchscreen, not real access control. Set
// VITE_ADMIN_PIN at build time (see .env.example) instead of hardcoding a
// value here, so a public repo doesn't ship the real PIN.
export const ADMIN_PIN = import.meta.env.VITE_ADMIN_PIN || '0000';
