import { useCallback, useEffect, useState } from "react";
import {
  type FriendEntry,
  type ProfileResponse,
  acceptFriendRequest,
  getProfile,
  sendFriendRequest,
} from "./lib/profile-api";

/**
 * ProfilePage — Slice 7 (RiftAtlas parity).
 *
 * One-stop dashboard for the signed-in user:
 *   - Identity (username + display name)
 *   - Deck count + recent games summary (last 10, with view-replay link)
 *   - Win / loss / draw record
 *   - Friend list with online status + invite + add-by-username flow
 *
 * Unauthenticated visitors get a friendly "Sign in to see your profile"
 * prompt rather than an error — the page is reachable from the top nav.
 */
export function ProfilePage({
  onOpenReplay,
}: {
  onOpenReplay: (gameId: string) => void;
}) {
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [addUsername, setAddUsername] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addMsg, setAddMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = await getProfile();
      setData(p);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (/Not authenticated/i.test(msg)) {
        setData(null);
        setError("anonymous");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onAddFriend = useCallback(async () => {
    const u = addUsername.trim();
    if (!u) {return;}
    setAddBusy(true);
    setAddMsg(null);
    try {
      await sendFriendRequest(u);
      setAddMsg(`Request sent to ${u}`);
      setAddUsername("");
      await refresh();
    } catch (error) {
      setAddMsg(error instanceof Error ? error.message : String(error));
    } finally {
      setAddBusy(false);
    }
  }, [addUsername, refresh]);

  const onAccept = useCallback(
    async (userId: string) => {
      try {
        await acceptFriendRequest(userId);
        await refresh();
      } catch (error) {
        setAddMsg(error instanceof Error ? error.message : String(error));
      }
    },
    [refresh],
  );

  if (loading) {
    return (
      <div className="profile-page" data-testid="profile-page">
        <p>Loading profile…</p>
      </div>
    );
  }

  if (error === "anonymous" || !data) {
    return (
      <div className="profile-page" data-testid="profile-page">
        <header className="profile-header">
          <h1>Profile</h1>
        </header>
        <p data-testid="profile-anonymous">
          Sign in to see your decks, win rate, and friend list.
        </p>
        {error && error !== "anonymous" && (
          <p className="profile-error" data-testid="profile-error">{error}</p>
        )}
      </div>
    );
  }

  const winRate = data.gameCount > 0
    ? Math.round((data.winCount / data.gameCount) * 100)
    : 0;

  return (
    <div className="profile-page" data-testid="profile-page">
      <header className="profile-header">
        <h1 data-testid="profile-display-name">
          {data.user.displayName ?? data.user.username}
        </h1>
        <p className="profile-username">@{data.user.username}</p>
      </header>

      <section className="profile-stats" data-testid="profile-stats">
        <div className="profile-stat">
          <div className="profile-stat-label">Decks</div>
          <div className="profile-stat-value" data-testid="profile-deck-count">
            {data.deckCount}
          </div>
        </div>
        <div className="profile-stat">
          <div className="profile-stat-label">Games</div>
          <div className="profile-stat-value" data-testid="profile-game-count">
            {data.gameCount}
          </div>
        </div>
        <div className="profile-stat">
          <div className="profile-stat-label">Win rate</div>
          <div className="profile-stat-value" data-testid="profile-win-rate">
            {winRate}%
          </div>
        </div>
        <div className="profile-stat">
          <div className="profile-stat-label">W / L / D</div>
          <div className="profile-stat-value" data-testid="profile-wld">
            {data.winCount} / {data.lossCount} / {data.drawCount}
          </div>
        </div>
      </section>

      <section className="profile-recent" data-testid="profile-recent">
        <h2>Recent games</h2>
        {data.recentGames.length === 0 ? (
          <p className="profile-empty" data-testid="profile-recent-empty">
            No games yet — play a match to see it here.
          </p>
        ) : (
          <ul className="profile-recent-list">
            {data.recentGames.map((g) => (
              <li
                key={g.id}
                className={`profile-recent-row ${g.youWon ? "won" : "lost"}`}
                data-testid={`profile-game-${g.id}`}
              >
                <span className="profile-recent-result">
                  {g.result === "draw"
                    ? "Draw"
                    : (g.youWon
                      ? "Win"
                      : "Loss")}
                </span>
                <span className="profile-recent-opponent">
                  vs {g.opponent?.displayName ?? g.opponent?.username ?? "(no opponent recorded)"}
                </span>
                <span className="profile-recent-meta">
                  {g.moveCount} moves · {new Date(g.endedAt).toLocaleDateString()}
                </span>
                <button
                  type="button"
                  className="profile-recent-replay"
                  data-testid={`profile-game-replay-${g.id}`}
                  onClick={() => onOpenReplay(g.id)}
                >
                  View replay
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="profile-friends" data-testid="profile-friends">
        <h2>Friends</h2>
        <div className="profile-friends-add">
          <input
            type="text"
            placeholder="Add by username"
            value={addUsername}
            onChange={(e) => setAddUsername(e.target.value)}
            data-testid="profile-friend-add-input"
          />
          <button
            type="button"
            onClick={() => void onAddFriend()}
            disabled={addBusy || !addUsername.trim()}
            data-testid="profile-friend-add-button"
          >
            {addBusy ? "Sending…" : "+ Add"}
          </button>
        </div>
        {addMsg && (
          <p className="profile-friend-msg" data-testid="profile-friend-msg">
            {addMsg}
          </p>
        )}
        <FriendList friends={data.friends} onAccept={onAccept} />
      </section>
    </div>
  );
}

function FriendList({
  friends,
  onAccept,
}: {
  friends: FriendEntry[];
  onAccept: (userId: string) => Promise<void>;
}) {
  if (friends.length === 0) {
    return (
      <p className="profile-empty" data-testid="profile-friends-empty">
        No friends yet — add one above.
      </p>
    );
  }
  return (
    <ul className="profile-friends-list">
      {friends.map((f) => (
        <li
          key={f.userId}
          className={`profile-friend ${f.status}`}
          data-testid={`profile-friend-${f.userId}`}
        >
          <span className={`profile-friend-online ${f.online ? "yes" : "no"}`}>
            {f.online ? "●" : "○"}
          </span>
          <span className="profile-friend-name">
            {f.displayName ?? f.username}
          </span>
          <span className="profile-friend-status">
            {f.status === "pending"
              ? (f.direction === "incoming"
                ? "wants to be friends"
                : "request sent")
              : "friend"}
          </span>
          {f.status === "pending" && f.direction === "incoming" && (
            <button
              type="button"
              onClick={() => void onAccept(f.userId)}
              data-testid={`profile-friend-accept-${f.userId}`}
            >
              Accept
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
