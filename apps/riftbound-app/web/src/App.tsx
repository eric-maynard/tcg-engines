import { useEffect, useState } from "react";
import { PlayPage } from "./PlayPage";
import { AuthBadge } from "./components/AuthBadge";

/**
 * Root SPA component. The session id comes from `?session=<uuid>` in the
 * URL — if missing we create a fresh client-side UUID. In production this
 * will eventually be a lobby flow; for the scaffold one session per tab is
 * enough.
 *
 * 2p support: a second query param `?as=player-1|player-2` selects the local
 * Seat for this browser. Defaults to `player-1` so existing single-player
 * Tests / screenshots keep working unchanged. The value is normalized here so
 * Downstream components can trust it without re-parsing the URL.
 */
const LOCAL_PLAYER_IDS = ["player-1", "player-2"] as const;
type LocalPlayerId = (typeof LOCAL_PLAYER_IDS)[number];

export function App() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [localPlayerId, setLocalPlayerId] = useState<LocalPlayerId>("player-1");

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
    const asParam = params.get("as");
    const seat: LocalPlayerId =
      asParam === "player-2" ? "player-2" : "player-1";
    setLocalPlayerId(seat);
    setSessionId(id);
  }, []);

  if (!sessionId) {
    return <div>Booting session…</div>;
  }

  return (
    <>
      <AuthBadge />
      <PlayPage sessionId={sessionId} localPlayerId={localPlayerId} />
    </>
  );
}
