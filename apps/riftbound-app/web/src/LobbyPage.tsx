import { useCallback, useState } from "react";
import { useAuth } from "./lib/useAuth";
import { createRoom, joinRoom } from "./lib/lobby-api";

/**
 * LobbyPage — Slice 2 of RiftAtlas parity.
 *
 * Two big actions:
 *   - Create Room (POST /api/lobby/room/create → /play/lobby/<code>)
 *   - Join Room (input 6-char code → POST /api/lobby/room/<code>/join)
 */
export function LobbyPage({
  onEnterRoom,
}: {
  onEnterRoom: (code: string) => void;
}) {
  const { user, loading } = useAuth();
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const room = await createRoom();
      onEnterRoom(room.code);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [onEnterRoom]);

  const handleJoin = useCallback(async () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) {
      setError("Code must be 6 characters");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await joinRoom(code);
      onEnterRoom(code);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [joinCode, onEnterRoom]);

  if (loading) {
    return <div className="lobby-page" data-testid="lobby-page">Loading…</div>;
  }
  if (!user) {
    return (
      <div className="lobby-page" data-testid="lobby-page">
        <h1>Multiplayer Lobby</h1>
        <p>
          You need to <a href="/api/auth/login">sign in</a> to create or join a room.
        </p>
      </div>
    );
  }

  return (
    <div className="lobby-page" data-testid="lobby-page">
      <h1>Multiplayer Lobby</h1>
      <p className="lobby-subtitle">Sign-in as {user.displayName ?? user.username}</p>

      <div className="lobby-actions">
        <div className="lobby-action-card">
          <h2>Create Room</h2>
          <p>Start a new private room and share the code with a friend.</p>
          <button
            type="button"
            data-testid="lobby-create-button"
            onClick={() => void handleCreate()}
            disabled={busy}
          >
            {busy ? "Creating…" : "Create Room"}
          </button>
        </div>

        <div className="lobby-action-card">
          <h2>Join Room</h2>
          <p>Enter the 6-character code your friend shared.</p>
          <input
            type="text"
            data-testid="lobby-join-input"
            placeholder="e.g. ABC234"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            maxLength={6}
            spellCheck={false}
          />
          <button
            type="button"
            data-testid="lobby-join-button"
            onClick={() => void handleJoin()}
            disabled={busy || joinCode.trim().length !== 6}
          >
            {busy ? "Joining…" : "Join Room"}
          </button>
        </div>
      </div>

      {error && (
        <div className="lobby-error" data-testid="lobby-error">
          {error}
        </div>
      )}
    </div>
  );
}
