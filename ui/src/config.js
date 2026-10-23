// App-wide configuration sourced from environment variables.
//
// NOTE on ADMIN_PIN: this gates the admin screens on the client only. Since
// this is a React Native Web bundle, whatever value ends up here is visible
// to anyone who opens devtools on the built app - it is a UI deterrent, not
// real auth. Set REACT_APP_ADMIN_PIN at build time (see .env.example) rather
// than hardcoding a value in source, so the real PIN isn't sitting in git
// history of a public repo. For real access control this should be checked
// server-side instead.
export const ADMIN_PIN = process.env.REACT_APP_ADMIN_PIN || '0000';
