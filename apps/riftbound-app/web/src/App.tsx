import { useCallback, useEffect, useState } from "react";
import { PlayPage } from "./PlayPage";
import { DeckListPage } from "./DeckListPage";
import { DeckBuilderPage } from "./DeckBuilderPage";
import { LobbyPage } from "./LobbyPage";
import { RoomPage } from "./RoomPage";
import { GoldfishPage } from "./GoldfishPage";
import { SealedPage } from "./SealedPage";
import { ProfilePage } from "./ProfilePage";
import { ReplayViewerPage } from "./ReplayViewerPage";
import { AuthBadge } from "./components/AuthBadge";

/**
 * Root SPA component. Top-level views:
 *
 *   /play/                       → PlayPage (game UI)
 *   /play/decks/                 → DeckListPage
 *   /play/decks/<id>             → DeckBuilderPage
 *   /play/lobby/                 → LobbyPage (slice 2)
 *   /play/lobby/<code>           → RoomPage   (slice 2)
 *   /play/goldfish/              → GoldfishPage (slice 6)
 *   /play/sealed/                → SealedPage   (slice 6)
 *
 * Routing is done with a hand-rolled hash/path reader rather than a router
 * library — keeps the SPA dependency surface tiny and avoids breaking the
 * existing PlayPage tests, which don't expect a router context.
 *
 * The PlayPage still consumes `?session=<uuid>` for its game session id.
 * Slice 6 adds a `&mode=goldfish` query flag which the play page reads to
 * surface a "Step Opponent" affordance in place of the disabled-input
 * "Waiting for opponent…" banner.
 */
const LOCAL_PLAYER_IDS = ["player-1", "player-2"] as const;
type LocalPlayerId = (typeof LOCAL_PLAYER_IDS)[number];

type PlayMode = "default" | "goldfish";

type Route =
  | { kind: "play"; sessionId: string; localPlayerId: LocalPlayerId; mode: PlayMode }
  | { kind: "deck-list" }
  | { kind: "deck-builder"; deckId: string }
  | { kind: "lobby" }
  | { kind: "room"; code: string }
  | { kind: "goldfish" }
  | { kind: "sealed" }
  | { kind: "profile" }
  | { kind: "replay"; gameId: string };

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

  // /play/goldfish/ — goldfish mode landing
  if (path.match(/^\/play\/goldfish\/?$/)) {
    return { kind: "goldfish" };
  }

  // /play/sealed/ — sealed pool builder
  if (path.match(/^\/play\/sealed\/?$/)) {
    return { kind: "sealed" };
  }

  // /play/profile/ — slice 7 profile page
  if (path.match(/^\/play\/profile\/?$/)) {
    return { kind: "profile" };
  }

  // /play/replays/:gameId — slice 7 replay viewer
  const replayMatch = path.match(/^\/play\/replays\/(.+?)\/?$/);
  if (replayMatch) {
    return { gameId: replayMatch[1], kind: "replay" };
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
  const modeParam = params.get("mode");
  const mode: PlayMode = modeParam === "goldfish" ? "goldfish" : "default";
  return { kind: "play", localPlayerId: seat, mode, sessionId: id };
}

function navigate(path: string): void {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function App() {
  const [route, setRoute] = useState<Route | null>(null);
  /**
   * Admin "Manual" mode — when ON, the play page surfaces right-click
   * context menus on zones / units / cards so the player can directly
   * spawn tokens, move cards, set damage/counters, exhaust, destroy, or
   * recycle. Defaults to OFF because manual mode bypasses rule
   * enforcement. Persisted in localStorage so a toggle survives reloads.
   */
  const [manualMode, setManualMode] = useState<boolean>(() => {
    try {
      return globalThis.localStorage?.getItem("rb-manual-mode") === "true";
    } catch {
      return false;
    }
  });
  const toggleManual = useCallback(() => {
    setManualMode((prev) => {
      const next = !prev;
      try { globalThis.localStorage?.setItem("rb-manual-mode", next ? "true" : "false"); } catch { /* Noop */ }
      return next;
    });
  }, []);

  useEffect(() => {
    const update = () => setRoute(readRoute());
    update();
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);

  const goPlay = useCallback(() => navigate("/play/"), []);
  const goDeckList = useCallback(() => navigate("/play/decks/"), []);
  const goLobby = useCallback(() => navigate("/play/lobby/"), []);
  const goGoldfish = useCallback(() => navigate("/play/goldfish/"), []);
  const goSealed = useCallback(() => navigate("/play/sealed/"), []);
  const goProfile = useCallback(() => navigate("/play/profile/"), []);
  const goReplay = useCallback(
    (gameId: string) => navigate(`/play/replays/${encodeURIComponent(gameId)}`),
    [],
  );
  const goRoom = useCallback((code: string) => navigate(`/play/lobby/${encodeURIComponent(code)}`), []);
  const goPlayWithSession = useCallback((sessionId: string, as: "player-1" | "player-2") => {
    navigate(`/play/?session=${encodeURIComponent(sessionId)}&as=${as}`);
  }, []);
  const goPlayGoldfish = useCallback((sessionId: string) => {
    navigate(`/play/?session=${encodeURIComponent(sessionId)}&as=player-1&mode=goldfish`);
  }, []);
  const goDeckBuilder = useCallback(
    (id: string) => navigate(`/play/decks/${encodeURIComponent(id)}`),
    [],
  );

  if (!route) {return <div>Booting session…</div>;}

  const navProps = {
    manualMode,
    onDecks: goDeckList,
    onGoldfish: goGoldfish,
    onLobby: goLobby,
    onPlay: goPlay,
    onProfile: goProfile,
    onSealed: goSealed,
    onToggleManual: toggleManual,
  };

  if (route.kind === "deck-list") {
    return (
      <>
        <AuthBadge />
        <TopNav {...navProps} current="decks" />
        <DeckListPage onOpenDeck={goDeckBuilder} onNavigatePlay={goPlay} />
      </>
    );
  }

  if (route.kind === "deck-builder") {
    return (
      <>
        <AuthBadge />
        <TopNav {...navProps} current="decks" />
        <DeckBuilderPage deckId={route.deckId} onBack={goDeckList} />
      </>
    );
  }

  if (route.kind === "lobby") {
    return (
      <>
        <AuthBadge />
        <TopNav {...navProps} current="lobby" />
        <LobbyPage onEnterRoom={goRoom} />
      </>
    );
  }

  if (route.kind === "room") {
    return (
      <>
        <AuthBadge />
        <TopNav {...navProps} current="lobby" />
        <RoomPage
          code={route.code}
          onLeaveLobby={goLobby}
          onStartMatch={goPlayWithSession}
        />
      </>
    );
  }

  if (route.kind === "goldfish") {
    return (
      <>
        <AuthBadge />
        <TopNav {...navProps} current="goldfish" />
        <GoldfishPage onStart={goPlayGoldfish} />
      </>
    );
  }

  if (route.kind === "sealed") {
    return (
      <>
        <AuthBadge />
        <TopNav {...navProps} current="sealed" />
        <SealedPage />
      </>
    );
  }

  if (route.kind === "profile") {
    return (
      <>
        <AuthBadge />
        <TopNav {...navProps} current="profile" />
        <ProfilePage onOpenReplay={goReplay} />
      </>
    );
  }

  if (route.kind === "replay") {
    return (
      <>
        <AuthBadge />
        <TopNav {...navProps} current="profile" />
        <ReplayViewerPage gameId={route.gameId} onBack={goProfile} />
      </>
    );
  }

  // Route.kind === "play"
  return (
    <>
      <AuthBadge />
      <TopNav {...navProps} current="play" />
      <PlayPage
        sessionId={route.sessionId}
        localPlayerId={route.localPlayerId}
        mode={route.mode}
        manualMode={manualMode}
      />
    </>
  );
}

function TopNav({
  onPlay,
  onDecks,
  onLobby,
  onGoldfish,
  onSealed,
  onProfile,
  current,
  manualMode,
  onToggleManual,
}: {
  onPlay: () => void;
  onDecks: () => void;
  onLobby: () => void;
  onGoldfish: () => void;
  onSealed: () => void;
  onProfile: () => void;
  current: "play" | "decks" | "lobby" | "goldfish" | "sealed" | "profile";
  manualMode: boolean;
  onToggleManual: () => void;
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
      <button
        type="button"
        onClick={onGoldfish}
        data-testid="nav-goldfish"
        aria-current={current === "goldfish" ? "page" : undefined}
      >
        Goldfish
      </button>
      <button
        type="button"
        onClick={onSealed}
        data-testid="nav-sealed"
        aria-current={current === "sealed" ? "page" : undefined}
      >
        Sealed
      </button>
      <button
        type="button"
        onClick={onProfile}
        data-testid="nav-profile"
        aria-current={current === "profile" ? "page" : undefined}
      >
        Profile
      </button>
      <button
        type="button"
        onClick={onToggleManual}
        data-testid="nav-manual"
        data-manual-on={manualMode ? "true" : "false"}
        className={manualMode ? "manual-on" : ""}
        aria-pressed={manualMode ? "true" : "false"}
        title={
          manualMode
            ? "Manual mode ON — right-click zones / cards for direct controls. Click to disable."
            : "Enable manual mode — right-click zones / cards to spawn tokens, move units, set damage, etc."
        }
      >
        Manual{manualMode ? " ●" : ""}
      </button>
    </nav>
  );
}
