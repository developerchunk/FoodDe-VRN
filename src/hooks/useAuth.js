import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

/**
 * Who is signed in, if anyone.
 *
 * `signedIn` deliberately means "a real account", not "has a session": every
 * guest has an anonymous session, and treating that as signed in would offer
 * to sign them out of something they never signed into.
 */
export function useAuth() {
  /* Nothing to wait for when there is no client, so do not start in a loading
     state we would have to clear synchronously inside the effect. */
  const [state, setState] = useState({
    user: null,
    signedIn: false,
    loading: Boolean(supabase),
  });

  useEffect(() => {
    if (!supabase) return undefined;
    let cancelled = false;

    const apply = (user) => {
      if (cancelled) return;
      setState({
        user: user ?? null,
        signedIn: Boolean(user) && !user.is_anonymous,
        loading: false,
      });
    };

    supabase.auth.getUser().then(({ data }) => apply(data?.user));

    /* Fires when the guest returns from Google, which is a fresh page load, and
       whenever a session is linked, refreshed or ended. */
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) =>
      apply(session?.user),
    );

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, []);

  return state;
}
