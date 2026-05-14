import { useCallback, useEffect, useState } from "react";
import { PlayPage } from "./PlayPage";
import { DeckListPage } from "./DeckListPage";
import { DeckBuilderPage } from "./DeckBuilderPage";
import { AuthBadge } from "./components/AuthBadge";

/**
 * Root SPA component. Two top-level views:
 *
 *   /play/                       → PlayPage (game UI)
 *   /play/decks/                 → DeckListPage
 *   /play/decks/<id>             → DeckBuilderPage
 *
 * Routing is done with a hand-rolled hash/path reader rather than a router
 * library — keeps the SPA dependency surface tiny and avoids breaking the
 * existing PlayPage tests, which don't expect a router context.
 *
 * The PlayPage still consumes `?session=<uuid>` for its game session id.
 */
const LOCAL_PLAYER_IDS = ["player-1", "player-2"] as const;
type LocalPlayerId = (typeof LOCAL_PLAYER_IDS)[number];

type Route =
  | { kind: "play"; sessionId: string; localPlayerId: LocalPlayerId }
  | { kind: "deck-list" }
  | { kind: "deck-builder"; deckId: string };

function readRoute(): Route {
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);

  // /play/decks/<id?> — deck builder
  const deckMatch = path.match(/^\/play\/decks\/?(.*)$/);
  if (deckMatch) {
    const rest = deckMatch[1].replace(/\/$/, "");
    if (!rest) {return { kind: "deck-list" };}
    return { deckId: rest, kind: "deck-builder" };
  }

  // Default: play view.
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
  const seat: LocalPlayerId = asParam === "player-2" ? "player-2" : "player-1";
  return { kind: "play", localPlayerId: seat, sessionId: id };
}

function navigate(path: string): void {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function App() {
  const [route, setRoute] = useState<Route | null>(null);

  useEffect(() => {
    const update = () => setRoute(readRoute());
    update();
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);

  const goPlay = useCallback(() => navigate("/play/"), []);
  const goDeckList = useCallback(() => navigate("/play/decks/"), []);
  const goDeckBuilder = useCallback(
    (id: string) => navigate(`/play/decks/${encodeURIComponent(id)}`),
    [],
  );

  if (!route) {return <div>Booting session…</div>;}

  if (route.kind === "deck-list") {
    return (
      <>
        <AuthBadge />
        <DeckListPage onOpenDeck={goDeckBuilder} onNavigatePlay={goPlay} />
      </>
    );
  }

  if (route.kind === "deck-builder") {
    return (
      <>
        <AuthBadge />
        <DeckBuilderPage deckId={route.deckId} onBack={goDeckList} />
      </>
    );
  }

  // Route.kind === "play"
  return (
    <>
      <AuthBadge />
      <TopNav onDecks={goDeckList} />
      <PlayPage sessionId={route.sessionId} localPlayerId={route.localPlayerId} />
    </>
  );
}

function TopNav({ onDecks }: { onDecks: () => void }) {
  return (
    <nav className="app-top-nav" data-testid="app-top-nav">
      <button type="button" onClick={onDecks} data-testid="nav-decks">
        Decks
      </button>
    </nav>
  );
}
