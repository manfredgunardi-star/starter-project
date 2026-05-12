import { useEffect, useState } from 'react';

export function useScrollDirection() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    let rafId = null;

    const onScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        const currentY = window.scrollY;
        const isMobile = window.innerWidth < 768;

        if (isMobile) {
          setHidden(currentY > lastY && currentY > 80);
        } else {
          setHidden(false);
        }

        lastY = currentY;
        rafId = null;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return hidden;
}
