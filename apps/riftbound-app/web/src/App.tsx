import { useCallback, useEffect, useState } from "react";
import { PlayPage } from "./PlayPage";
import { DeckListPage } from "./DeckListPage";
import { DeckBuilderPage } from "./DeckBuilderPage";
import { LobbyPage } from "./LobbyPage";
import { RoomPage } from "./RoomPage";
import { AuthBadge } from "./components/AuthBadge";

/**
 * Root SPA component. Top-level views:
 *
 *   /play/                       → PlayPage (game UI)
 *   /play/decks/                 → DeckListPage
 *   /play/decks/<id>             → DeckBuilderPage
 *   /play/lobby/                 → LobbyPage (slice 2)
 *   /play/lobby/<code>           → RoomPage   (slice 2)
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
  | { kind: "deck-builder"; deckId: string }
  | { kind: "lobby" }
  | { kind: "room"; code: string };

function readRoute(): Route {
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);

  // /play/lobby/<code?> — lobby + room
  const lobbyMatch = path.match(/^\/play\/lobby\/?(.*)$/);
  if (lobbyMatch) {
    const rest = lobbyMatch[1].replace(/\/$/, "");
    if (!rest) {return { kind: "lobby" };}
    return { code: rest.toUpperCase(), kind: "room" };
  }

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
  const goLobby = useCallback(() => navigate("/play/lobby/"), []);
  const goRoom = useCallback((code: string) => navigate(`/play/lobby/${encodeURIComponent(code)}`), []);
  const goPlayWithSession = useCallback((sessionId: string, as: "player-1" | "player-2") => {
    navigate(`/play/?session=${encodeURIComponent(sessionId)}&as=${as}`);
  }, []);
  const goDeckBuilder = useCallback(
    (id: string) => navigate(`/play/decks/${encodeURIComponent(id)}`),
    [],
  );

  if (!route) {return <div>Booting session…</div>;}

  if (route.kind === "deck-list") {
    return (
      <>
        <AuthBadge />
        <TopNav onPlay={goPlay} onDecks={goDeckList} onLobby={goLobby} current="decks" />
        <DeckListPage onOpenDeck={goDeckBuilder} onNavigatePlay={goPlay} />
      </>
    );
  }

  if (route.kind === "deck-builder") {
    return (
      <>
        <AuthBadge />
        <TopNav onPlay={goPlay} onDecks={goDeckList} onLobby={goLobby} current="decks" />
        <DeckBuilderPage deckId={route.deckId} onBack={goDeckList} />
      </>
    );
  }

  if (route.kind === "lobby") {
    return (
      <>
        <AuthBadge />
        <TopNav onPlay={goPlay} onDecks={goDeckList} onLobby={goLobby} current="lobby" />
        <LobbyPage onEnterRoom={goRoom} />
      </>
    );
  }

  if (route.kind === "room") {
    return (
      <>
        <AuthBadge />
        <TopNav onPlay={goPlay} onDecks={goDeckList} onLobby={goLobby} current="lobby" />
        <RoomPage
          code={route.code}
          onLeaveLobby={goLobby}
          onStartMatch={goPlayWithSession}
        />
      </>
    );
  }

  // Route.kind === "play"
  return (
    <>
      <AuthBadge />
      <TopNav onPlay={goPlay} onDecks={goDeckList} onLobby={goLobby} current="play" />
      <PlayPage sessionId={route.sessionId} localPlayerId={route.localPlayerId} />
    </>
  );
}

function TopNav({
  onPlay,
  onDecks,
  onLobby,
  current,
}: {
  onPlay: () => void;
  onDecks: () => void;
  onLobby: () => void;
  current: "play" | "decks" | "lobby";
}) {
  return (
    <nav className="app-top-nav" data-testid="app-top-nav">
      <button
        type="button"
        onClick={onPlay}
        data-testid="nav-play"
        aria-current={current === "play" ? "page" : undefined}
      >
        Play
      </button>
      <button
        type="button"
        onClick={onDecks}
        data-testid="nav-decks"
        aria-current={current === "decks" ? "page" : undefined}
      >
        Decks
      </button>
      <button
        type="button"
        onClick={onLobby}
        data-testid="nav-lobby"
        aria-current={current === "lobby" ? "page" : undefined}
      >
        Lobby
      </button>
    </nav>
  );
}
