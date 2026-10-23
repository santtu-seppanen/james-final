import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // scripts/deploy.sh sets APP_VERSION=$(git rev-parse HEAD) before
    // `npm run build`, so a running page can tell it's stale (see
    // src/components/VersionBanner.tsx). Falls back to 'dev' locally.
    __APP_VERSION__: JSON.stringify(process.env.APP_VERSION || 'dev'),
  },
  build: {
    // poll-mirror.sh on the Pi copies build/* into /var/www/html - keep
    // that working instead of Vite's default dist/.
    outDir: 'build',
  },
})
