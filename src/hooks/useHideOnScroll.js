import { useEffect, useState } from "react";

/**
 * True while the reader is scrolling down the page, false once they scroll
 * back up or are near the top -- the usual rule for a bar that gets out of
 * the way while reading and comes back when wanted.
 *
 * Small movements are ignored, so a finger resting on the screen does not
 * make the bar flicker; the direction is judged only once the page has
 * moved `travel` pixels from where it was last judged.
 */
export function useHideOnScroll({ near = 120, travel = 12 } = {}) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let anchor = window.scrollY;
    let frame = 0;

    const judge = () => {
      frame = 0;
      const y = window.scrollY;
      if (y < near) {
        setHidden(false);
        anchor = y;
      } else if (Math.abs(y - anchor) >= travel) {
        setHidden(y > anchor);
        anchor = y;
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(judge);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [near, travel]);

  return hidden;
}
