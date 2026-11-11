// Small inline icon set, all stroke-based and tinted by currentColor so
// they follow the text colour of whatever button they sit in. Decorative
// by default (aria-hidden) - the surrounding control carries the label.
const PATHS: Record<string, string> = {
  sparkles:
    'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM5 17l.9 2.1L8 20l-2.1.9L5 23l-.9-2.1L2 20l2.1-.9L5 17zM19 15l.7 1.6 1.6.7-1.6.7L19 19.6l-.7-1.6-1.6-.7 1.6-.7.7-1.6z',
  robot:
    'M12 2v3M8 5h8a3 3 0 013 3v8a3 3 0 01-3 3H8a3 3 0 01-3-3V8a3 3 0 013-3zM9 11h.01M15 11h.01M9 15h6M2 11v4M22 11v4',
  music: 'M9 18V5l12-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zM21 16a3 3 0 11-6 0 3 3 0 016 0z',
  stop: 'M12 2a10 10 0 110 20 10 10 0 010-20zM9 9h6v6H9z',
  back: 'M15 18l-6-6 6-6',
  cog: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  warning: 'M12 3l10 18H2L12 3zM12 10v4M12 18h.01',
  check: 'M20 6L9 17l-5-5',
  refresh: 'M21 12a9 9 0 11-3-6.7M21 3v6h-6',
  glass: 'M5 3h14l-1.5 9a5.5 5.5 0 01-11 0L5 3zM12 17v4M8 21h8',
  bottle: 'M10 2h4v4l2 3v11a2 2 0 01-2 2h-4a2 2 0 01-2-2V9l2-3V2z',
  backspace: 'M21 5H8l-6 7 6 7h13a1 1 0 001-1V6a1 1 0 00-1-1zM17 9l-6 6M11 9l6 6',
  pause: 'M8 5v14M16 5v14',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 018 0v4',
  offline: 'M1 1l22 22M16.7 11.3A6 6 0 0118 12M8.5 16.5a5 5 0 017 0M12 20h.01M5 8.5A12 12 0 0112 6a12 12 0 0110 4M2 12a12 12 0 012.7-3.5',
  home: 'M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1v-9z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z',
  chart: 'M3 20h18M7 16V9M12 16V4M17 16v-6',
  wrench: 'M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.6 2.6-2.1-2.1 2.6-2.6z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  sun: 'M12 17a5 5 0 100-10 5 5 0 000 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
};

export type IconName = keyof typeof PATHS;

export function Icon({name, size = 24, className}: {name: IconName; size?: number; className?: string}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
