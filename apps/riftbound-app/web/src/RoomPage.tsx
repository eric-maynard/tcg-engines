import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./lib/useAuth";
import {
  type RoomView,
  fetchRoom,
  leaveRoom,
  pickDeck,
  startGame,
} from "./lib/lobby-api";
import { type SavedDeck, listDecks } from "./lib/deck-api";

/**
 * RoomPage — slice 2.
 *
 * Live room state for two players:
 *   - Shows the 6-char join code (copyable)
 *   - Each player picks a deck via a `<select>` of their own saved decks
 *   - Host sees a "Start Game" button (enabled when both decks set)
 *   - "Leave Room" returns to lobby; if host leaves, room dies
 *   - Subscribes to /api/lobby/room/:code/stream (SSE) for live updates;
 *     falls back to a 2s polling timer if EventSource isn't available
 */
export function RoomPage({
  code,
  onLeaveLobby,
  onStartMatch,
}: {
  code: string;
  onLeaveLobby: () => void;
  onStartMatch: (sessionId: string, as: "player-1" | "player-2") => void;
}) {
  const { user, loading } = useAuth();
  const [room, setRoom] = useState<RoomView | null>(null);
  const [decks, setDecks] = useState<SavedDeck[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Initial fetch + load this user's decks.
  useEffect(() => {
    if (!user) {return;}
    void (async () => {
      try {
        const [r, d] = await Promise.all([fetchRoom(code), listDecks()]);
        setRoom(r);
        setDecks(d);
      } catch (error) {
        setError(error instanceof Error ? error.message : String(error));
      }
    })();
  }, [code, user]);

  // Live updates via SSE.
  useEffect(() => {
    if (!user) {return;}
    if (typeof EventSource === "undefined") {
      // Fallback polling for environments without SSE.
      const t = setInterval(() => {
        void fetchRoom(code)
          .then(setRoom)
          .catch(() => { /* Swallow; transient */ });
      }, 2000);
      return () => clearInterval(t);
    }
    const es = new EventSource(`/api/lobby/room/${encodeURIComponent(code)}/stream`);
    es.addEventListener("room", (ev) => {
      try {
        setRoom(JSON.parse((ev as MessageEvent).data) as RoomView);
      } catch { /* */ }
    });
    es.addEventListener("closed", () => {
      setError("Room closed by host.");
      es.close();
    });
    es.onerror = () => {
      // Bun closes the stream on shutdown; let the polling fallback above
      // Pick up if the user retries.
    };
    return () => es.close();
  }, [code, user]);

  // Auto-redirect both players when room enters "in-progress" with a sessionId.
  useEffect(() => {
    if (!room?.sessionId || room.status !== "in-progress" || !user) {return;}
    const as: "player-1" | "player-2" = user.id === room.host.userId ? "player-1" : "player-2";
    onStartMatch(room.sessionId, as);
  }, [onStartMatch, room, user]);

  const myRole: "host" | "guest" | "spectator" = !user || !room
    ? "spectator"
    : (user.id === room.host.userId ? "host"
      : (user.id === room.guest?.userId ? "guest" : "spectator"));

  const myDeckId =
    myRole === "host" ? room?.host.deckId ?? null
    : (myRole === "guest" ? room?.guest?.deckId ?? null : null);

  const onPick = useCallback(async (deckId: string) => {
    setError(null);
    try {
      const next = await pickDeck(code, deckId);
      setRoom(next);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }, [code]);

  const onStart = useCallback(async () => {
    setError(null);
    try {
      const next = await startGame(code);
      setRoom(next);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }, [code]);

  const onLeave = useCallback(async () => {
    try {
      await leaveRoom(code);
    } catch { /* */ }
    onLeaveLobby();
  }, [code, onLeaveLobby]);

  const onCopy = useCallback(() => {
    void navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [code]);

  if (loading) {
    return <div className="room-page" data-testid="room-page">Loading…</div>;
  }
  if (!user) {
    return (
      <div className="room-page" data-testid="room-page">
        <p>You need to <a href="/api/auth/login">sign in</a> first.</p>
      </div>
    );
  }
  if (error && !room) {
    return (
      <div className="room-page" data-testid="room-page">
        <h1>Room {code}</h1>
        <div className="room-error" data-testid="room-error">{error}</div>
        <button type="button" onClick={onLeaveLobby}>Back to Lobby</button>
      </div>
    );
  }
  if (!room) {
    return <div className="room-page" data-testid="room-page">Loading room…</div>;
  }

  const bothPicked = room.host.hasDeck && Boolean(room.guest?.hasDeck);
  const canStart = myRole === "host" && bothPicked && room.guest && room.status !== "in-progress";

  return (
    <div className="room-page" data-testid="room-page">
      <header className="room-header">
        <h1>Room</h1>
        <div className="room-code-bar">
          <code className="room-code" data-testid="room-code">{room.code}</code>
          <button type="button" onClick={onCopy} data-testid="room-code-copy">
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </header>

      <div className="room-players">
        <RoomPlayerCard
          label="Host"
          name={room.host.displayName}
          deckId={room.host.deckId}
          isYou={myRole === "host"}
          decks={myRole === "host" ? decks : []}
          onPick={myRole === "host" ? onPick : undefined}
          testId="room-host"
          deckName={
            room.host.deckId
              ? decks.find((d) => d.id === room.host.deckId)?.name
              : undefined
          }
        />
        <RoomPlayerCard
          label="Guest"
          name={room.guest?.displayName ?? "Waiting for opponent…"}
          deckId={room.guest?.deckId ?? null}
          isYou={myRole === "guest"}
          decks={myRole === "guest" ? decks : []}
          onPick={myRole === "guest" ? onPick : undefined}
          empty={!room.guest}
          testId="room-guest"
          deckName={
            room.guest?.deckId
              ? decks.find((d) => d.id === room.guest?.deckId)?.name
              : undefined
          }
        />
      </div>

      <div className="room-status" data-testid="room-status">
        Status: <strong>{room.status}</strong>
        {myDeckId && <> · your pick: <strong>{decks.find((d) => d.id === myDeckId)?.name ?? myDeckId}</strong></>}
      </div>

      <div className="room-actions">
        {myRole === "host" && (
          <button
            type="button"
            onClick={() => void onStart()}
            disabled={!canStart}
            data-testid="room-start-button"
          >
            {room.status === "in-progress" ? "Game in progress" : "Start Game"}
          </button>
        )}
        <button type="button" onClick={() => void onLeave()} data-testid="room-leave-button">
          Leave Room
        </button>
      </div>

      {error && (
        <div className="room-error" data-testid="room-error">{error}</div>
      )}

      {!bothPicked && myRole === "host" && (
        <p className="room-hint">Share the code with a friend, then both pick decks.</p>
      )}
    </div>
  );
}

function RoomPlayerCard({
  label,
  name,
  deckId,
  deckName,
  isYou,
  decks,
  onPick,
  empty,
  testId,
}: {
  label: string;
  name: string;
  deckId: string | null;
  deckName?: string;
  isYou: boolean;
  decks: SavedDeck[];
  onPick?: (deckId: string) => Promise<void>;
  empty?: boolean;
  testId: string;
}) {
  return (
    <div
      className={`room-player-card${empty ? " is-empty" : ""}${isYou ? " is-you" : ""}`}
      data-testid={testId}
    >
      <h2>
        {label}
        {isYou && <span className="room-you-pill"> (you)</span>}
      </h2>
      <div className="room-player-name" data-testid={`${testId}-name`}>{name}</div>

      {empty ? (
        <div className="room-player-deck" data-testid={`${testId}-deck`}>—</div>
      ) : (isYou && onPick ? (
        <select
          value={deckId ?? ""}
          onChange={(e) => void onPick(e.target.value)}
          data-testid={`${testId}-deck-select`}
        >
          <option value="" disabled>Pick a deck…</option>
          {decks.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      ) : (
        <div className="room-player-deck" data-testid={`${testId}-deck`}>
          {deckId ? (deckName ?? "Deck selected") : "Picking…"}
        </div>
      ))}
    </div>
  );
}
