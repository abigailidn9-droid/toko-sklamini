import { DEFAULT_SETTINGS } from "@sklamini/shared";

function env(name: string, fallback: string): string {
  const value = (import.meta.env as Record<string, string | undefined>)[name];
  return typeof value === "string" && value.trim() ? value.trim().replace(/\/$/, "") : fallback;
}

/** Alamat cloud toko — tertanam di aplikasi, tanpa isi pengaturan. */
export const CLOUD_API_URL = env("VITE_API_URL", DEFAULT_SETTINGS.apiUrl.replace(/\/$/, ""));
export const CLOUD_API_TOKEN = env("VITE_API_TOKEN", DEFAULT_SETTINGS.apiToken);
