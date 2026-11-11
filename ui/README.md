# James kiosk UI

The touchscreen app that runs full-screen in Chromium on the Pi, next to
the bottles. React + TypeScript + Vite; talks to `../server` over REST and
socket.io (see `src/api.ts`). Design brief and rationale: GitHub issue #11.

```sh
npm install
npm run dev        # http://localhost:5173, backend expected on :8000
npm run build      # tsc + vite -> build/ (deploy.sh copies it to /var/www/html)
npm run lint       # oxlint
```

Env (see `.env.example`): `VITE_ADMIN_PIN` (client-side deterrent only),
`VITE_API_BASE` (default `http://localhost:8000`), and for design previews
`VITE_FEATURES=show,strength,estop,maintenance,leds,sound,queue` which turns
on the controls whose backend doesn't exist yet (`src/features.ts`).

Works with a mouse at 1024×600 and 1280×800; nothing needs hover,
double-tap or long-press.

## Screens

| Screen | File | Notes |
| --- | --- | --- |
| Home / menu | `components/HomeScreen.tsx`, `RecipeGrid.tsx`, `BottleStrip.tsx` | Surprise me + AI drink pills, menu grid (pourable first, blocked ones disabled with the reason), bottle strip in slot order, admin cog in the corner. Empty states: no recipes / nothing pourable. |
| Confirm | `components/ConfirmScreen.tsx` | Image, ml list, low / out-of-bottle warnings, strength selector (feature-gated), "Serve it!" and "Serve with show" (feature-gated). Server rejections rendered as short human messages. |
| Pouring | `components/PouringScreen.tsx` | Countdown from `pourTime`, background tinted with the drink colour, active slot glowing from `servoState`. Beat pulse + Skip show when show mode exists. Stop is disabled until `/api/estop` exists. |
| Done | `components/DoneScreen.tsx` | "Enjoy!", by-hand additions and garnish, Save this drink (AI recipes) with the on-screen keyboard, auto-return ring. |
| Attract | `components/AttractScreen.tsx` | After `idleSeconds` without touches, from Home only. Rotating featured drink, Top 5 tonight (kiosk-local log). |
| Admin | `components/admin/*` | PIN pad, then Bottles / Recipes / Maintenance / Settings / Stats tabs. Optional light theme here only. |
| System | `components/SystemStates.tsx`, `VersionBanner.tsx` | Loading, offline (socket down > 4 s) with retry, e-stop lock (PIN to clear), update banner. |

Shared: `Icon.tsx` (inline stroke icons), `Keyboard.tsx`, `PinPad.tsx`.
Logic without JSX: `drinkColor.ts` (ingredient colours, drink colour,
strength hint, bottle levels, availability), `stats.ts` (localStorage pour
log), `settings.ts` (kiosk-local settings), `hooks.ts` (idle, countdown,
progress, rotation), `features.ts`.

## Design tokens

All in `src/index.css` `:root`; the admin light variant overrides the
surface/text tokens under `.admin[data-theme='light']`.

| Token | Value | Use |
| --- | --- | --- |
| `--accent` / `--accent-dark` | `#1b95e0` / `#0a84d0` | brand blue: primary buttons, selected tabs, fills |
| `--purple` | `#6a2c91` | brand purple: AI pill gradient, attract glow |
| `--bg`, `--surface`, `--surface-2`, `--surface-3` | `#0b0b0e` … `#2d2d38` | page, cards, controls, tracks |
| `--text`, `--text-2`, `--text-muted` | `#f4f3ef`, `#c3c2b8`, `#8f8e85` | ≥ 4.5:1 on the surfaces above |
| `--danger`, `--warn`, `--ok` | `#e04545`, `#f5b324`, `#2fc26a` | always paired with an icon or word |
| `--drink`, `--drink-soft` | per screen | the current drink's colour, set inline |
| `--fs-small … --fs-count` | 16 / 20 / 24 / 28 / 44 / 64 / 160 px | body 20, drink names 28, headlines 44–64, countdown 160 (128 on 600 px tall) |
| `--touch`, `--touch-lg`, `--touch-xl` | 64 / 80 / 96 px | min tap height; primary action per screen uses xl |
| `--gap`, `--gap-lg` | 12 / 24 px | spacing between tap targets ≥ 8 px |
| `--radius`, `--radius-sm` | 16 / 10 px | |

Motion: `breathe` (pouring background), `glow` (active slot), `beat`
(show mode, period from BPM), `drift`/`pulse` (attract), `pop` (done).
All disabled by `prefers-reduced-motion` or the Reduce motion setting
(`<html data-reduce-motion>`).

## Pouring / show state diagram

```
            tap card / Surprise me / AI drink
  home ─────────────────────────────────────▶ confirm
   ▲                                            │ Serve it! / Serve with show
   │ Menu / Done / auto-return                  │ POST /drinkme {drink|recipe, show?}
   │                                            ▼
   │                    ┌─ error (validation) ◀─┤ !success → stays on confirm with message
   │                    │                       │ success {pourTime, show?}
   │                    │                       ▼
  done ◀──── pourTime elapsed ────────────── pouring ──┬─ Skip show → music off, pour continues
   │                                             │     └─ Stop (feature) → POST /api/estop
   │ Save this drink (AI) → POST /api/save-recipe│
   ▼                                             ▼
  home                                         locked ── PIN ──▶ home

  home ── 60 s idle ──▶ attract ── any tap ──▶ home
  any ── socket down > 4 s ──▶ offline ── Try again (reload) ──▶ loading ──▶ home
```

Show mode (issue #4) is driven entirely by what `/drinkme` returns: with
`show.bpm` the pouring screen pulses at that tempo, without it the
fallback is a silent fixed 120 BPM, and with `features.show` off the
button never appears.

## Not wired up yet

Rendered disabled / hidden until the backend exists, see
`src/features.ts` for the issue numbers: show mode and music, strength
factor, emergency stop, order queue, LEDs, sound, per-servo open/close,
prime, flush, belt home. "Test pour" and "Test shot" do work: they go
through `/drinkme` as a one-ingredient recipe, so they count as a serving.
