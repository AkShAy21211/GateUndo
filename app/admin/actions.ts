"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  clearAdminSession,
  isAdminAuthenticated,
  isAdminConfigured,
  isValidAdminPassword,
  setAdminSession,
} from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabase/admin";

function getSuggestionId(formData: FormData) {
  const suggestionId = formData.get("suggestionId");

  if (typeof suggestionId !== "string" || !suggestionId) {
    throw new Error("Missing suggestion id");
  }

  return suggestionId;
}

function requireAdmin() {
  if (!isAdminAuthenticated()) {
    redirect("/admin?error=session");
  }
}

export async function loginAdminAction(formData: FormData) {
  if (!isAdminConfigured()) {
    redirect("/admin?error=config");
  }

  const password = formData.get("password");

  if (typeof password !== "string" || !isValidAdminPassword(password)) {
    redirect("/admin?error=login");
  }

  setAdminSession();
  redirect("/admin");
}

export async function logoutAdminAction() {
  clearAdminSession();
  redirect("/admin");
}

export async function approveSuggestionAction(formData: FormData) {
  requireAdmin();

  const suggestionId = getSuggestionId(formData);
  const supabase = createAdminClient();
  const { error } = await supabase.rpc("promote_gate_suggestion_to_gate", {
    target_suggestion_id: suggestionId,
  });

  if (error) {
    redirect("/admin?error=approve");
  }

  revalidatePath("/");
  revalidatePath("/admin");
  redirect("/admin?success=approved");
}

export async function rejectSuggestionAction(formData: FormData) {
  requireAdmin();

  const suggestionId = getSuggestionId(formData);
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("gate_suggestions")
    .update({
      status: "rejected",
      updated_at: new Date().toISOString(),
    })
    .eq("id", suggestionId)
    .in("status", ["pending", "community_confirmed"]);

  if (error) {
    redirect("/admin?error=reject");
  }

  revalidatePath("/");
  revalidatePath("/admin");
  redirect("/admin?success=rejected");
}
