import { supabase } from "./supabase";

const KEY = "location";

export interface SavedLocation {
  lat: number;
  lon: number;
  city: string | null;
  at: string;
}

/** Città da coordinate (Nominatim, gratuito). Se fallisce resta null: le coordinate valgono comunque. */
export async function reverseCity(lat: number, lon: number): Promise<string | null> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=it&lat=${lat}&lon=${lon}`, {
      headers: { "User-Agent": "second-brain/1.0 (personal)" },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { address?: Record<string, string> };
    const a = j.address ?? {};
    return a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? null;
  } catch {
    return null;
  }
}

/** Posizione condivisa da Telegram (opt-in: la salvo solo se Daro la manda). */
export async function saveLocation(lat: number, lon: number): Promise<SavedLocation> {
  const loc: SavedLocation = { lat, lon, city: await reverseCity(lat, lon), at: new Date().toISOString() };
  const { error } = await supabase.from("app_settings").upsert({ key: KEY, value: JSON.stringify(loc), updated_at: loc.at });
  if (error) throw error;
  return loc;
}

export async function getLocation(): Promise<SavedLocation | null> {
  const { data } = await supabase.from("app_settings").select("value").eq("key", KEY).maybeSingle();
  if (!data?.value) return null;
  try {
    return JSON.parse(data.value) as SavedLocation;
  } catch {
    return null;
  }
}
