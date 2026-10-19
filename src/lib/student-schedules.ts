import { useCallback, useEffect, useRef, useState } from "react";

// Server-side persistence client. All schedule data is stored in Supabase and
// fetched fresh every session; the browser only holds an anonymous device
// token inside an httpOnly cookie (never the data itself).

export type StoredSchedule = {
  kind: string;
  data: unknown;
  updated_at: string;
};

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Loads the student's saved schedules of the given kinds (once per session). */
export function loadSchedules(): Promise<StoredSchedule[]> {
  return fetch("/api/student-schedules", { cache: "no-store" }).then(
    async (r) => {
      const j = (await r.json().catch(() => ({}))) as {
        schedules?: StoredSchedule[];
        error?: string;
      };
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      return j.schedules ?? [];
    },
  );
}

export async function saveSchedule(kind: string, data: unknown): Promise<void> {
  const res = await fetch("/api/student-schedules", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, data }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? `HTTP ${res.status}`);
  }
}

export async function clearSchedules(kind?: string): Promise<void> {
  const url = kind
    ? `/api/student-schedules?kind=${kind}`
    : "/api/student-schedules";
  await fetch(url, { method: "DELETE" });
}

/**
 * useSaved(kind, initialData) — returns [data, setData, { loaded, savingError }].
 * Data hydrates from the server on mount; later setData calls are stored
 * (debounced) server-side. `ready` is true once the server copy has arrived.
 */
export function useSaved<T>(
  kind: string,
  initial: T,
): {
  data: T;
  setData: (next: T | ((cur: T) => T)) => void;
  ready: boolean;
  error: string | null;
} {
  const [data, setLocal] = useState<T>(initial);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const latest = useRef(data);
  latest.current = data;

  useEffect(() => {
    let alive = true;
    loadSchedules()
      .then((rows) => {
        if (!alive) return;
        const row = rows.find((r) => r.kind === kind);
        if (row && isObject(row.data) && !isObjectEmpty(row.data))
          setLocal(row.data as T);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "Load failed");
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [kind]);

  const setData = useCallback(
    (next: T | ((cur: T) => T)) => {
      setLocal((cur) => {
        const value =
          typeof next === "function" ? (next as (c: T) => T)(cur) : next;
        if (timer.current && typeof window !== "undefined")
          window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          saveSchedule(kind, value).catch((e) =>
            setError(e instanceof Error ? e.message : "Save failed"),
          );
        }, 600);
        return value;
      });
    },
    [kind],
  );

  return { data, setData, ready, error };
}

function isObjectEmpty(v: Record<string, unknown>): boolean {
  const values = Object.values(v);
  return (
    values.length === 0 ||
    values.every((x) => x == null || (Array.isArray(x) && x.length === 0))
  );
}
