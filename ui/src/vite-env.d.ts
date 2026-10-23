/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ADMIN_PIN?: string;
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Injected by vite.config.ts's `define` from scripts/deploy.sh's
// APP_VERSION env var - see src/components/VersionBanner.tsx.
declare const __APP_VERSION__: string;
