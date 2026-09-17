import { useSyncExternalStore } from "react";

/**
 * True while the viewport is at least `px` wide.
 *
 * Used to keep hero imagery out of the DOM entirely on phones: `display: none`
 * does not stop a browser fetching an <img>, and nor does `loading="lazy"`
 * reliably, so the only way not to spend a phone's data on a picture it will
 * never see is not to render it.
 */
export function useMinWidth(px) {
  const query = `(min-width: ${px}px)`;
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
