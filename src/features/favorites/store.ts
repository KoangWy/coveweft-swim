"use client";

import { useMemo, useSyncExternalStore } from "react";

export const FAVORITES_KEY = "coveweft-favorites";
const EVENT = "coveweft-favorites-change";
let fallback = "[]";
let memoryOnly = false;

export function parseFavorites(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return [
      ...new Set(
        value.filter(
          (id): id is string =>
            typeof id === "string" &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id),
        ),
      ),
    ].slice(0, 500);
  } catch {
    return [];
  }
}

function snapshot() {
  if (memoryOnly) return fallback;
  try {
    return localStorage.getItem(FAVORITES_KEY) ?? "[]";
  } catch {
    return fallback;
  }
}

function subscribe(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === FAVORITES_KEY || event.key === null) notify();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT, notify);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVENT, notify);
  };
}

function writeFavorites(ids: string[]) {
  fallback = JSON.stringify(ids);
  try {
    localStorage.setItem(FAVORITES_KEY, fallback);
  } catch {
    memoryOnly = true;
    // Keep the selection for this visit when browser storage is unavailable.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function toggleFavorite(id: string) {
  const ids = parseFavorites(snapshot());
  writeFavorites(
    ids.includes(id) ? ids.filter((value) => value !== id) : [id, ...ids].slice(0, 500),
  );
}

export function clearFavorites() {
  writeFavorites([]);
}

export function useFavorites() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => "[]");
  const ready = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const ids = useMemo(() => parseFavorites(raw), [raw]);
  return { ids, ready };
}
