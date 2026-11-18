import { LocalStore } from "./local";
import { SupabaseStore } from "./supabase";
import type { Store } from "./types";

let store: Store | null = null;

export function getStore(): Store {
  if (!store) {
    const hasSupabase = process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY;
    if (!hasSupabase && (process.env.VERCEL)) {
      // Never silently fall back to ephemeral local storage in production:
      // uploaded documents would vanish between function invocations.
      throw new Error(
        "SUPABASE_URL and SUPABASE_SECRET_KEY must be set in production; refusing to use ephemeral local storage"
      );
    }
    store = hasSupabase ? new SupabaseStore() : new LocalStore();
  }
  return store;
}

export function storeMode(): "supabase" | "local" {
  return process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY ? "supabase" : "local";
}
