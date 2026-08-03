#!/usr/bin/env bun
/**
 * Smoke-test the running riftbound-app server via its HTTP API + WebSocket.
 * Verifies that engine changes haven't broken the app's game flow.
 *
 *   bun app-smoke.ts [http://localhost:3000]
 */

const BASE = process.argv[2] ?? "http://localhost:3000";
const WS_BASE = BASE.replace(/^http/, "ws");

async function post(path: string, body: unknown) {
  const r = await fetch(`${BASE}${path}`, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
async function get(path: string) {
  const r = await fetch(`${BASE}${path}`);
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

function ws(url: string): Promise<WebSocket> {
  return new Promise((res, rej) => {
    const s = new WebSocket(url);
    s.onopen = () => res(s);
    s.onerror = (e) => rej(e);
  });
}

console.log(`[smoke] target ${BASE}`);

// 1. Create game
const create = await post("/api/game/create", { seed: "smoke" });
if (create.status !== 200) {
  console.error("FAIL: create returned", create.status, create.body);
  process.exit(1);
}
const gameId = (create.body as any).gameId;
console.log(`[smoke] game ${gameId} created`);

// 2. Complete pregame via WS (both players mulligan-keep-all)
for (const pid of ["player-1", "player-2"]) {
  const s = await ws(`${WS_BASE}/ws/game/${gameId}?player=${pid}`);
  s.send(JSON.stringify({ keepCards: [], type: "pregame_mulligan" }));
  await new Promise((r) => setTimeout(r, 200));
  s.close();
}
await new Promise((r) => setTimeout(r, 500));
console.log("[smoke] pregame mulligans sent");

// 3. Verify SERVER_ONLY_MOVES denylist blocks a client channelRunes
const denied = await post(`/api/game/${gameId}/move`, {
  moveId: "channelRunes",
  params: { count: 5, directed: true, playerId: "player-1" },
  playerId: "player-1",
});
if (denied.status !== 403) {
  console.error("FAIL: SERVER_ONLY_MOVES did not block channelRunes:", denied);
  process.exit(1);
}
console.log("[smoke] SERVER_ONLY_MOVES denylist ✓");

// 4. Play up to 40 moves via the API, alternating who acts based on state
const NEVER = new Set(["concede", "removePlayer", "invitePlayer", "counterSpell"]);
let steps = 0;
let lastTurn = 0;
for (; steps < 60; steps++) {
  const st = await get(`/api/game/${gameId}/state`);
  const state = (st.body as any).state ?? st.body;
  if (state.status === "finished") break;
  const active =
    state.interaction?.chain?.activePlayer ??
    state.interaction?.showdownStack?.at?.(-1)?.focusPlayer ??
    state.turn?.activePlayer ??
    "player-1";
  lastTurn = state.turn?.number ?? lastTurn;

  const mv = await get(`/api/game/${gameId}/moves?player=${active}`);
  const moves = ((mv.body as any).moves ?? mv.body ?? []).filter(
    (m: any) => !NEVER.has(m.moveId)
  );
  if (!moves.length) {
    console.error(`[smoke] step ${steps}: no moves for ${active} (state=${JSON.stringify(state.turn)})`);
    break;
  }
  const chosen =
    moves.find((m: any) => m.moveId === "passChainPriority") ??
    moves.find((m: any) => m.moveId === "exhaustRune") ??
    moves.find((m: any) => m.moveId === "playUnit") ??
    moves.find((m: any) => m.moveId === "endTurn") ??
    moves[0];
  const res = await post(`/api/game/${gameId}/move`, {
    moveId: chosen.moveId,
    params: chosen.params ?? { playerId: active },
    playerId: active,
  });
  if (res.status !== 200 || (res.body as any).error) {
    console.error(`[smoke] step ${steps}: move ${chosen.moveId} failed`, res.status, res.body);
    process.exit(1);
  }
}

const final = await get(`/api/game/${gameId}/state`);
const fs = (final.body as any).state ?? final.body;
console.log(
  `[smoke] played ${steps} steps, turn=${fs.turn?.number}, status=${fs.status}, vp=${JSON.stringify(
    Object.fromEntries(Object.entries(fs.players ?? {}).map(([k, v]: any) => [k, v.victoryPoints]))
  )}`
);
console.log(
  steps >= 5 && (fs.turn?.number ?? 0) >= 2 ? "PASS: app flow works with engine changes" : "FAIL: game did not progress"
);
process.exit(steps >= 5 && (fs.turn?.number ?? 0) >= 2 ? 0 : 1);
