/** The menu lives at /menu (a room link is /menu?id=<code>); /r/<code> is the
 *  older sticker form, redirected there. */
export const isMenuPath = (pathname) =>
  pathname === "/menu" || pathname.startsWith("/r/");
