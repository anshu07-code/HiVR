"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SignUpSchema, BusinessSignupSchema } from "@/lib/schemas";
import type { UserRole } from "@/lib/supabase/types";

/* ====================================================================== */
/*  Sign in                                                               */
/* ====================================================================== */

export async function signInWithEmail(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const sb = createClient();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("invalid login") || msg.includes("invalid credentials")) {
      return {
        error: "Invalid email or password. If you just signed up, check that you clicked the confirmation link in your email — or disable email confirmation in Supabase → Authentication → Sign In/Up → Email.",
      };
    }
    return { error: error.message };
  }
  if (!data?.session) {
    return { error: "Sign-in didn't return a session. Try again, or disable email confirmation in Supabase." };
  }

  // Determine where to route: business users go to /business/dashboard,
  // everyone else goes to /dashboard.
  let nextPath = "/dashboard";
  try {
    const { data: u } = await sb.from("users").select("roles").eq("id", data.user.id).maybeSingle();
    const roles: string[] = ((u as any)?.roles as string[] | null) ?? [];
    if (roles.includes("business") && !roles.includes("buyer") && !roles.includes("employee")) {
      nextPath = "/business/dashboard";
    }
  } catch {
    // Fallback to /dashboard if the lookup fails.
  }

  revalidatePath("/", "layout");
  redirect(nextPath);
}

/* ====================================================================== */
/*  Sign up — individual                                                  */
/* ====================================================================== */

export async function signUpWithEmail(formData: FormData) {
  const roleIntent = String(formData.get("role_intent") ?? "buyer");
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  // Buyers must provide a phone at signup — the eKYC pipeline needs it.
  if ((roleIntent === "buyer" || roleIntent === "both") && !phoneRaw) {
    return { error: "Phone is required for buyer accounts (used for eKYC + dispute contact)." };
  }
  const parsed = SignUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    full_name: formData.get("full_name"),
    phone: phoneRaw || undefined,
    role_intent: roleIntent,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const sb = createClient();
  const { data, error } = await sb.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    phone: parsed.data.phone,
    options: {
      data: { full_name: parsed.data.full_name, role_intent: parsed.data.role_intent },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });
  if (error) return { error: friendlyAuthError(error.message) };

  if (data?.user && !data?.session) {
    return { needsEmailConfirmation: true, email: parsed.data.email };
  }

  const { data: { user } } = await sb.auth.getUser();
  if (user) {
    const intent = parsed.data.role_intent;
    const roles: UserRole[] =
      intent === "buyer"    ? ["buyer"] :
      intent === "employee" ? ["employee"] :
                              ["buyer", "employee"];
    await sb.from("users").update({
      full_name: parsed.data.full_name,
      phone: parsed.data.phone ?? null,
      roles,
      current_mode: roles.includes("employee") ? "employee" : "buyer",
    }).eq("id", user.id);

    if (roles.includes("buyer")) await sb.from("buyer_profiles").upsert({ user_id: user.id });
    if (roles.includes("employee")) await sb.from("employee_profiles").upsert({ user_id: user.id });

    await createAdminClient().rpc("award_signup_bonus", {
      p_user_id: user.id,
      p_points: 50,
    });
  }
  revalidatePath("/", "layout");
  redirect(parsed.data.role_intent === "employee" ? "/onboarding/employee" : "/dashboard");
}

/* ====================================================================== */
/*  Sign up — business                                                    */
/* ====================================================================== */

export async function signUpBusiness(formData: FormData) {
  const parsed = BusinessSignupSchema.safeParse({
    legal_name:        formData.get("legal_name"),
    brand_name:        formData.get("brand_name") || undefined,
    entity_type:       formData.get("entity_type"),
    pan:               formData.get("pan"),
    gstin:             formData.get("gstin") || undefined,
    website:           formData.get("website") || undefined,
    work_email:        formData.get("work_email"),
    work_phone:        formData.get("work_phone"),
    password:          formData.get("password"),
    contact_name:      formData.get("contact_name"),
    contact_role:      formData.get("contact_role"),
    contact_phone:     formData.get("contact_phone"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const d = parsed.data;
  const sb = createClient();

  // 1. Create the auth user with the work email + password.
  //    The work email becomes the login. Full name = "Business: {legal_name} - {contact_name}".
  const signupName = `${d.legal_name} — ${d.contact_name}`;
  const { data, error } = await sb.auth.signUp({
    email: d.work_email,
    password: d.password,
    phone: d.work_phone,
    options: {
      data: {
        full_name:   signupName,
        role_intent: "business",
        legal_name:  d.legal_name,
        entity_type: d.entity_type,
        pan:         d.pan,
        contact_name: d.contact_name,
        contact_role: d.contact_role,
        contact_phone: d.contact_phone,
      },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });
  if (error) return { error: friendlyAuthError(error.message) };

  if (data?.user && !data?.session) {
    return { needsEmailConfirmation: true, email: d.work_email };
  }

  // 2. Set users.roles = ["business"] + write contact info to the public.users row.
  if (data?.user) {
    await sb.from("users").update({
      full_name: signupName,
      phone: d.work_phone,
      roles: ["business"],
      current_mode: "buyer", // business owners act as buyers
    }).eq("id", data.user.id);
  }

  revalidatePath("/", "layout");
  // 3. The 0031 trigger trg_new_business_profile auto-creates a free trial subscription
  //    when a business_profiles row is inserted. We don't insert the row here —
  //    the /onboarding/business wizard does that on Step 1 (legal) so it can
  //    include the proper address + city/state/incorporation_date.
  redirect("/onboarding/business");
}

/* ====================================================================== */
/*  Other auth flows (kept for parity)                                    */
/* ====================================================================== */

export async function signInWithGoogle() {
  // Redirect to our own API route that initiates Google OAuth from our domain.
  // This makes Google show "to continue to <our domain>" instead of the
  // raw Supabase project subdomain on the consent screen.
  redirect(`${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google`);
}

function friendlyOAuthError(raw: string): string {
  if (/Unsupported provider|provider is not enabled/i.test(raw)) {
    return "Google sign-in isn't enabled in this Supabase project yet. Use email + password to sign up, or enable Google in Supabase → Authentication → Providers.";
  }
  return raw;
}

export async function signInWithOtp(formData: FormData) {
  const phone = String(formData.get("phone") ?? "");
  if (!/^\+?[1-9]\d{6,14}$/.test(phone)) {
    return { error: "Invalid phone. Use international format: +91XXXXXXXXXX" };
  }
  const sb = createClient();
  const { error } = await sb.auth.signInWithOtp({ phone });
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("unsupported phone provider") || msg.includes("phone provider not configured")) {
      return { error: "Phone sign-in isn't enabled in this Supabase project yet. Use email + password to log in, or enable Phone in Supabase → Authentication → Providers (requires Twilio)." };
    }
    return { error: error.message };
  }
  return { ok: true };
}

export async function verifyOtp(formData: FormData) {
  const phone = String(formData.get("phone") ?? "");
  const token = String(formData.get("token") ?? "");
  const sb = createClient();
  const { error } = await sb.auth.verifyOtp({ phone, token, type: "sms" });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signOut() {
  const sb = createClient();
  await sb.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

function friendlyAuthError(raw: string): string {
  const r = raw.toLowerCase();
  if (r.includes("already registered") || r.includes("user already")) {
    return "This email is already registered. Try logging in instead — or use a different email.";
  }
  if (r.includes("password") && r.includes("at least")) {
    return "Password must be at least 8 characters.";
  }
  if (r.includes("invalid email") || r.includes("email is invalid")) {
    return "Please enter a valid email address.";
  }
  return raw;
}
