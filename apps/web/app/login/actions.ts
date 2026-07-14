"use server";

import { redirect } from "next/navigation";

import { getSupabaseServerClient } from "../../src/supabase-server";

export async function loginAction(formData: FormData) {
  const supabase = await getSupabaseServerClient();
  if (supabase === null) {
    redirect("/login?error=configuration");
  }

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    redirect("/login?error=authentication");
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error !== null) {
    redirect("/login?error=authentication");
  }

  redirect("/sites");
}

export async function signOutAction() {
  const supabase = await getSupabaseServerClient();
  if (supabase !== null) {
    await supabase.auth.signOut();
  }
  redirect("/login");
}
