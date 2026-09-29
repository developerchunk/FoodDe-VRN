import { supabase } from "./supabase";

/**
 * Signing in with Google, without losing what the guest already did.
 *
 * Guests are signed in anonymously from their first tap — that is how the cart,
 * the order and its receipt belong to anyone at all. Every order stores
 * guest_user_id = auth.uid(), and row level security shows a guest only the
 * rows matching that id.
 *
 * So the obvious call is the wrong one. signInWithOAuth() issues a NEW user id;
 * the orders placed moments earlier stay attached to the abandoned anonymous
 * user and disappear from the guest's history — not deleted, just unreachable,
 * which is worse because nothing looks broken.
 *
 * linkIdentity() attaches Google to the user who is already here. Same id, same
 * orders. It needs manual linking enabled on the project; when it is not, the
 * error says so rather than silently falling back to the lossy path.
 */
export async function signInWithGoogle() {
  if (!supabase) return { ok: false, error: "Sign-in is not available." };

  /* Come back to whichever page they left, not to the home page: this is
     offered mid-checkout, and losing their place would cost them the order. */
  const redirectTo = window.location.href;

  const { data: { user } = {} } = await supabase.auth.getUser();

  if (user?.is_anonymous) {
    const { error } = await supabase.auth.linkIdentity({
      provider: "google",
      options: { redirectTo },
    });
    if (!error) return { ok: true };

    /* 422 identity_already_exists: this Google account is already a user here,
       so there is nothing to link to the anonymous one. Signing in is right,
       and the anonymous orders are genuinely a different person's session. */
    if (error.code === "identity_already_exists" || error.status === 422) {
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      return signInError
        ? { ok: false, error: "Could not reach Google. Please try again." }
        : { ok: true };
    }
    return {
      ok: false,
      error:
        error.code === "manual_linking_disabled"
          ? "Sign-in is not finished being set up. Please tell the front desk."
          : "Could not reach Google. Please try again.",
    };
  }

  /* No session at all, or already a real account: a plain sign-in is correct. */
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
  return error
    ? { ok: false, error: "Could not reach Google. Please try again." }
    : { ok: true };
}

/** Back to being a guest. The anonymous session returns on the next order. */
export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}
