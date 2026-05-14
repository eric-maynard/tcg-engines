import { useEffect, useState } from "react";
import { PlayPage } from "./PlayPage";

/**
 * Root SPA component. The session id comes from `?session=<uuid>` in the
 * URL — if missing we create a fresh client-side UUID. In production this
 * will eventually be a lobby flow; for the scaffold one session per tab is
 * enough.
 */
export function App() {
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let id = params.get("session");
    if (!id) {
      id =
        typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2);
      params.set("session", id);
      const newUrl = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState({}, "", newUrl);
    }
    setSessionId(id);
  }, []);

  if (!sessionId) {
    return <div>Booting session…</div>;
  }

  return <PlayPage sessionId={sessionId} />;
}
