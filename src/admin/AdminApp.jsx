import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { Cloche, GoogleMark } from "../components/Icons";
import { isConfigured } from "../lib/supabase";
import { getSession, onAuthChange, signInWithGoogle, signOut, whoami } from "./api";
import { NoticeProvider } from "./ui";
import OrdersPage from "./pages/OrdersPage";
import KitchensPage from "./pages/KitchensPage";
import MenuPage from "./pages/MenuPage";
import CategoriesPage from "./pages/CategoriesPage";
import PlacesPage from "./pages/PlacesPage";
import DeliveryPage from "./pages/DeliveryPage";
import SettingsPage from "./pages/SettingsPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import CouponsPage from "./pages/CouponsPage";
import "./admin.css";

/**
 * The admin site, at /admin.
 *
 * Loaded as its own chunk, so a guest scanning a room's QR code never
 * downloads any of it. Who gets in is decided by the database (admin_users,
 * migration 0018), not here: these pages only choose what to show, and a
 * signed-in stranger who forced their way to one would find every list empty
 * and every save refused.
 */

const ADMIN_NAV = [
  { to: "orders", label: "Orders" },
  { to: "menu", label: "Menu" },
  { to: "kitchens", label: "Kitchens" },
  { to: "categories", label: "Categories" },
  { to: "places", label: "Places & rooms" },
  { to: "delivery", label: "Delivery partners" },
];
const SUPER_NAV = [
  { to: "analytics", label: "Analytics" },
  { to: "coupons", label: "Coupons" },
  { to: "settings", label: "Settings" },
];

/**
 * Who is signed in, and for how long.
 *
 * Admin access lasts 30 minutes from signing in (migration 0023). The database
 * is what enforces it -- after 30 minutes it refuses every admin read and
 * write -- so this only keeps the page honest: it shows the time left, and
 * when it runs out it signs this browser out and asks for Google again, rather
 * than leaving a page whose every save would fail.
 */
function useAdminSession() {
  const [state, setState] = useState(() =>
    isConfigured
      ? { status: "loading", email: null, roles: [] }
      : { status: "error", roles: [], error: "Supabase is not configured for this site." },
  );
  /* Set just before signing out at the 30-minute mark, so the sign-out that
     follows shows "session ended" rather than a bare sign-in page. */
  const ending = useRef(false);

  const resolve = useCallback(async (session) => {
    if (!session || session.user?.is_anonymous) {
      setState({ status: ending.current ? "expired" : "signed-out", email: null, roles: [] });
      ending.current = false;
      return;
    }
    try {
      const me = await whoami();
      if (me.expired) {
        /* Held a role, but signed in over 30 minutes ago. */
        ending.current = true;
        await signOut();
        return;
      }
      setState({
        status: me.roles?.length ? "ok" : "no-access",
        email: me.email ?? session.user.email,
        roles: me.roles ?? [],
        expiresAt: me.expires_at ? new Date(me.expires_at).getTime() : null,
      });
    } catch (e) {
      setState({ status: "error", email: session.user.email, roles: [], error: e.message });
    }
  }, []);

  useEffect(() => {
    if (!isConfigured) return undefined;
    getSession().then(resolve);
    return onAuthChange((session) => resolve(session));
  }, [resolve]);

  /* Checked every few seconds rather than one long timer: a phone that slept
     through the deadline notices as soon as it wakes. */
  useEffect(() => {
    if (state.status !== "ok" || !state.expiresAt) return undefined;
    const check = () => {
      if (Date.now() >= state.expiresAt) {
        ending.current = true;
        signOut();
      }
    };
    const t = setInterval(check, 5000);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", check);
    };
  }, [state.status, state.expiresAt]);

  return state;
}

/** "28 min left", ticking once a minute. */
function TimeLeft({ expiresAt }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);
  if (!expiresAt) return null;
  const mins = Math.max(0, Math.ceil((expiresAt - now) / 60000));
  return (
    <small className={`adm-nav__left ${mins <= 5 ? "is-low" : ""}`}>
      Session ends in {mins} min
    </small>
  );
}

function Gate({ children, title }) {
  return (
    <main className="adm-gate">
      <div className="adm-gate__card card">
        <Cloche size={48} />
        <p className="eyebrow">In Room Dining</p>
        <h1>{title}</h1>
        {children}
      </div>
    </main>
  );
}

function SignIn({ expired }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  return (
    <Gate title={expired ? "Your admin session has ended" : "Admin sign in"}>
      <p className="muted">
        {expired
          ? "Admin access lasts 30 minutes. Sign in again to carry on."
          : "Sign in with the Google account your access was set up for."}
      </p>
      <button
        type="button"
        className="btn btn-primary btn-block"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await signInWithGoogle();
          } catch (e) {
            setError(e.message);
            setBusy(false);
          }
        }}
      >
        <GoogleMark /> {busy ? "Opening Google…" : "Continue with Google"}
      </button>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </Gate>
  );
}

function Shell({ email, roles, expiresAt, children }) {
  const [navOpen, setNavOpen] = useState(false);
  /* On a phone the nav covers the page; choosing a page closes it. */
  const close = () => setNavOpen(false);

  const isAdmin = roles.includes("admin");
  const isSuper = roles.includes("super_admin");

  return (
    <div className={`adm-shell ${navOpen ? "nav-open" : ""}`}>
      <header className="adm-top">
        <button
          type="button"
          className="adm-icon-btn adm-top__menu"
          aria-label="Menu"
          aria-expanded={navOpen}
          onClick={() => setNavOpen((v) => !v)}
        >
          <span aria-hidden="true">☰</span>
        </button>
        <span className="adm-top__brand">
          <Cloche size={28} /> <strong>In Room Dining</strong> <span>Admin</span>
        </span>
      </header>

      <nav className="adm-nav" aria-label="Admin">
        <div className="adm-nav__brand">
          <Cloche size={34} />
          <div>
            <strong>In Room Dining</strong>
            <small>{isSuper && !isAdmin ? "Super admin" : "Admin"}</small>
          </div>
        </div>
        {isAdmin && (
          <ul>
            {ADMIN_NAV.map((n) => (
              <li key={n.to}>
                <NavLink to={`/admin/${n.to}`} onClick={close}>
                  {n.label}
                </NavLink>
              </li>
            ))}
          </ul>
        )}
        {isSuper && (
          <>
            <p className="adm-nav__group">Super admin</p>
            <ul>
              {SUPER_NAV.map((n) => (
                <li key={n.to}>
                  <NavLink to={`/admin/${n.to}`} onClick={close}>
                  {n.label}
                </NavLink>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="adm-nav__me">
          <small title={email}>{email}</small>
          <TimeLeft expiresAt={expiresAt} />
          <button type="button" className="btn btn-ghost adm-btn-sm" onClick={signOut}>
            Sign out
          </button>
        </div>
      </nav>
      <div className="adm-scrim" onClick={close} aria-hidden="true" />

      <div className="adm-main" id="main">
        {children}
      </div>
    </div>
  );
}

export default function AdminApp() {
  const me = useAdminSession();

  useEffect(() => {
    const prevTitle = document.title;
    document.title = "Admin · In Room Dining";
    /* Nothing under /admin belongs in a search engine. */
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex, nofollow";
    document.head.appendChild(robots);
    return () => {
      document.title = prevTitle;
      robots.remove();
    };
  }, []);

  if (me.status === "loading")
    return (
      <Gate title="Checking your access…">
        <span className="spinner spinner--dark" aria-hidden="true" />
      </Gate>
    );
  if (me.status === "signed-out") return <SignIn />;
  if (me.status === "expired") return <SignIn expired />;
  if (me.status === "error")
    return (
      <Gate title="Something went wrong">
        <p className="muted">{me.error}</p>
        <button type="button" className="btn btn-ghost" onClick={() => window.location.reload()}>
          Reload
        </button>
      </Gate>
    );
  if (me.status === "no-access")
    return (
      <Gate title="No admin access">
        <p className="muted">
          <strong>{me.email}</strong> is signed in but has not been given admin access. Ask the
          owner to add this address, or sign in with a different account.
        </p>
        <button type="button" className="btn btn-ghost btn-block" onClick={signOut}>
          Sign out
        </button>
      </Gate>
    );

  const isAdmin = me.roles.includes("admin");
  const isSuper = me.roles.includes("super_admin");
  const home = isAdmin ? "/admin/orders" : "/admin/analytics";

  return (
    <NoticeProvider>
      <Shell email={me.email} roles={me.roles} expiresAt={me.expiresAt}>
        <Routes>
          <Route index element={<Navigate to={home} replace />} />
          {isAdmin && (
            <>
              <Route path="orders" element={<OrdersPage />} />
              <Route path="menu" element={<MenuPage />} />
              <Route path="kitchens" element={<KitchensPage />} />
              <Route path="categories" element={<CategoriesPage />} />
              <Route path="places" element={<PlacesPage />} />
              <Route path="delivery" element={<DeliveryPage />} />
            </>
          )}
          {isSuper && (
            <>
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="coupons" element={<CouponsPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </>
          )}
          <Route path="*" element={<Navigate to={home} replace />} />
        </Routes>
      </Shell>
    </NoticeProvider>
  );
}
