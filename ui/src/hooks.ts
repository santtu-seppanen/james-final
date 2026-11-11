import {useEffect, useRef, useState} from 'react';

// Fires onIdle after `seconds` without any touch/mouse/key activity.
// `enabled` false (admin open, pouring...) resets and pauses the timer.
export function useIdle(seconds: number, enabled: boolean, onIdle: () => void) {
  const callback = useRef(onIdle);
  useEffect(() => {
    callback.current = onIdle;
  });

  useEffect(() => {
    if (!enabled || seconds <= 0) return;
    let timer = 0;
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => callback.current(), seconds * 1000);
    };
    const events = ['pointerdown', 'touchstart', 'keydown', 'mousemove'];
    events.forEach((e) => window.addEventListener(e, arm, {passive: true}));
    arm();
    return () => {
      window.clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, arm));
    };
  }, [seconds, enabled]);
}

// Whole seconds left of `totalMs`, counted from mount. The pouring screen
// mounts once per pour, so there's no need to handle totalMs changing.
export function useCountdown(totalMs: number): number {
  const [end] = useState(() => Date.now() + totalMs);
  const [left, setLeft] = useState(() => Math.ceil(totalMs / 1000));
  useEffect(() => {
    const id = window.setInterval(() => {
      setLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000)));
    }, 250);
    return () => window.clearInterval(id);
  }, [end]);
  return left;
}

// A 0..1 progress value advancing while `running`, over `durationMs`.
// Used for the Done screen's auto-return ring.
export function useProgress(durationMs: number, running: boolean): number {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (!running) return;
    const start = Date.now();
    const id = window.setInterval(() => {
      setProgress(Math.min(1, (Date.now() - start) / durationMs));
    }, 100);
    return () => window.clearInterval(id);
  }, [durationMs, running]);
  return running ? progress : 0;
}

// Rotates through `count` items every `ms` while `running`.
export function useRotation(count: number, ms: number, running: boolean): number {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!running || count <= 1) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % count), ms);
    return () => window.clearInterval(id);
  }, [count, ms, running]);
  return count > 0 ? index % count : 0;
}
