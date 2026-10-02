import { supabase } from "./supabase";

/**
 * A signed-up guest's name and mobile number, kept on their own account.
 *
 * They live in the account's user_metadata rather than a table: only the
 * person signed in can read or change them, they travel with the session to
 * every device, and there is nothing for row level security to get wrong.
 * Google's own `full_name` is a starting point for the name until the guest
 * saves one of their own.
 *
 * The number is a convenience for checkout, never a way in: signing in is
 * always by e-mail (Google), and order history follows the e-mail.
 */

/** { name, phone } for a signed-in user; empty strings when not set. */
export function profileOf(user) {
  const m = user?.user_metadata ?? {};
  return {
    name: m.profile_name ?? m.full_name ?? m.name ?? "",
    phone: m.profile_phone ?? "",
  };
}

/** Whether the guest has saved anything of their own yet. */
export const hasSavedProfile = (user) =>
  Boolean(user?.user_metadata?.profile_name || user?.user_metadata?.profile_phone);

export async function saveProfile({ name, phone }) {
  if (!supabase) throw new Error("Your profile is unavailable right now.");
  const { data, error } = await supabase.auth.updateUser({
    data: { profile_name: name.trim(), profile_phone: phone },
  });
  if (error) throw new Error("Could not save your details. Please try again.");
  return data.user;
}
