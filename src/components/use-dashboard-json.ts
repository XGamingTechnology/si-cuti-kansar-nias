"use client";
import { useCallback, useEffect, useState } from "react";
export function useDashboardJSON<T>(url: string | null) {
  const [state, setState] = useState<{
    data?: T;
    loading: boolean;
    error: string;
  }>({ loading: true, error: "" });
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((v) => v + 1), []);
  useEffect(() => {
    if (!url) return;
    let active = true;
    const controller = new AbortController();
    async function load() {
      setState({ loading: true, error: "" });
      try {
        const response = await fetch(url!, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) {
          if (response.status === 401) window.location.assign("/");
          throw new Error(data.error ?? "Data gagal dimuat.");
        }
        if (active) setState({ data, loading: false, error: "" });
      } catch (error) {
        if (active)
          setState({
            loading: false,
            error:
              error instanceof Error ? error.message : "Data gagal dimuat.",
          });
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [url, attempt]);
  return { ...state, reload };
}
