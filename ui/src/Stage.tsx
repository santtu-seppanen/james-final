import {useEffect, useState, type ReactNode} from 'react';
import {PORTRAIT_ROTATION} from './config';

function viewport() {
  return {w: window.innerWidth, h: window.innerHeight};
}

// Presents the UI portrait. On a landscape viewport it lays the app out
// in a h x w box and turns that box by PORTRAIT_ROTATION; the browser maps
// touches through the transform, so nothing else has to know. A viewport
// that is already portrait (dev tools, a rotated display) is left alone.
export function Stage({children}: {children: ReactNode}) {
  const [vp, setVp] = useState(viewport);

  useEffect(() => {
    const onResize = () => setVp(viewport());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (vp.w <= vp.h) return <div className="stage">{children}</div>;

  const shift = PORTRAIT_ROTATION === 90 ? `translateX(${vp.w}px)` : `translateY(${vp.h}px)`;
  return (
    <div
      className="stage stage--rotated"
      style={{width: vp.h, height: vp.w, transform: `${shift} rotate(${PORTRAIT_ROTATION}deg)`}}>
      {children}
    </div>
  );
}
