/**
 * Interaction: Teemo, Strategist (ogn-121-298) · Unit · 2+[?] · 2 Might — "[Hidden] (Hide now for [rainbow] to
 *     react with later for [0].) When I defend, …"                                   — FACEDOWN at bfA (owner P1)
 *   × Zhonya's Hourglass (ogn-077-298) · Gear · 2 — "[Hidden] If a friendly unit would die, kill this instead. …"
 *                                                                                     — FACEDOWN at bfB (owner P2)
 *
 * Question: P1 controls bfA (unit + hidden Teemo), P2 controls bfB (unit + hidden Zhonya's). Pre-check: neither
 * seat can see the other's facedown identity (128.4). (a) P2 concedes during P1's Main Phase — in the final state
 * are BOTH facedown cards revealed to both players? Do they change zones (652.1 banish? 323.7 trash?), and is P1
 * offered to "react" with Teemo? (b) Same board, but the game ends by P1 holding bfA for the 8th point — same?
 *
 * Rules: 421.4 ("If a facedown card would change zones OR IF THE GAME ENDS, its owner reveals it to all
 * players"), 421.3, 128.4 (a facedown card is Private to its controller), 650 / 651.1 (concede any time; last
 * player standing wins), 652 / 652.1 (Removal-of-a-Player banishes their facedown cards — only "if the game
 * continues"), 323.7 (lost-control facedown → trash happens in a Cleanup; none runs after game end), 323.1 /
 * 196 (reaching the Victory Score wins; winning ends the game), 811 (a hidden card is playable later for 0).
 *
 * Expected: pre-check — each opposing view shows one anonymous facedown object (owner only). (a) P1 wins at once;
 * per 421.4 the terminal views of BOTH seats name Teemo (owner P1) and Zhonya's (owner P2) and the public reveal
 * record lists both; neither card changes zones (still in facedown-bfA / facedown-bfB — not banished, not
 * trashed); no decision of any kind is pending. (b) Identical: 421.4 keys on "the game ends", not on how.
 * Negative control: while the game is live nothing is revealed and Teemo stays playable from hidden for 0.
 */
import { describe, expect, test } from "bun:test";
import type { CardView } from "../../../harness";
import { P1, P2, isHiddenView, scenario } from "../../../harness";

const TEEMO = "ogn-121-298";
const ZHONYAS = "ogn-077-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;
type SeatId = typeof P1 | typeof P2;

/**
 * Turn 3, P1's Main Phase, Victory 8, P1 5 pts / P2 4 pts (nobody about to win). P1 controls bfA with a vanilla
 * Keeper and hid Teemo there on turn 1; P2 controls bfB with a vanilla Keeper and hid Zhonya's there on turn 2.
 * Pools are empty (a play from hidden costs [0]).
 */
function board() {
  return scenario()
    .turn(3)
    .active(P1)
    .victoryScore(8)
    .points(P1, 5)
    .points(P2, 4)
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .unit(P1, "bfA", { might: 3, name: "A Keeper" }, "keeperA")
    .unit(P2, "bfB", { might: 3, name: "B Keeper" }, "keeperB")
    .facedown(P1, "bfA", TEEMO, "teemo", { hiddenOnTurn: 1 })
    .facedown(P2, "bfB", ZHONYAS, "zhonyas", { hiddenOnTurn: 2 });
}

/** Same board one step earlier: P2's turn 2 is ending and P1 sits on 7 — holding bfA in P1's Beginning Phase wins. */
function holdBoard() {
  return board().turn(2).active(P2).points(P1, 7);
}

function slot(game: Game, viewer: SeatId, bf: "bfA" | "bfB"): readonly CardView[] {
  return game.view(viewer).zones[`facedown-${bf}`] ?? [];
}

function publiclyRevealed(game: Game): string[] {
  return (game.gameState.publicReveals ?? []).flatMap((r) => [...r.cardIds]);
}

/** (a) P2 concedes while it is P1's Main Phase (650: "at any time" — P2 holds no decision, so use the raw move). */
async function p2Concedes(game: Game): Promise<void> {
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  await game.p2.do("concede");
}

/** (b) P2 ends turn 2; P1's Beginning Phase holds bfA for the 8th point. */
async function p1HoldsForTheWin(game: Game): Promise<void> {
  await game.p2.endTurn();
  const r = await game.settle();
  expect(r.reason).toBe("game-over");
}

function expectBothStillFacedownInPlace(game: Game): void {
  expect(game.zoneOf("teemo")).toBe("facedown-bfA");
  expect(game.zoneOf("zhonyas")).toBe("facedown-bfB");
  for (const seat of [game.p1, game.p2]) {
    expect(seat.banishment()).toEqual([]);
    expect(seat.trash()).toEqual([]);
  }
  expect(game.state("teemo")).toMatchObject({ controller: P1, owner: P1 });
  expect(game.state("zhonyas")).toMatchObject({ controller: P2, owner: P2 });
}

function expectRevealedToBoth(game: Game): void {
  for (const viewer of [P1, P2] as const) {
    const a = slot(game, viewer, "bfA");
    const b = slot(game, viewer, "bfB");
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(isHiddenView(a[0]!)).toBe(false);
    expect(isHiddenView(b[0]!)).toBe(false);
    expect(a[0]).toMatchObject({ defId: TEEMO, id: "teemo", name: "Teemo, Strategist", owner: P1 });
    expect(b[0]).toMatchObject({ defId: ZHONYAS, id: "zhonyas", name: "Zhonya's Hourglass", owner: P2 });
  }
}

describe("Game end reveals every facedown card (421.4) — Teemo (P1, bfA) & Zhonya's Hourglass (P2, bfB)", () => {
  // ── pre-check: private while live ─────────────────────────────────────────────────────────
  test("pre-check (128.4): P2's view of facedown-bfA is one anonymous object owned by P1; P1's view of facedown-bfB is one anonymous object owned by P2; each seat names its OWN card; battlefield summaries publicly show facedownCount 1", async () => {
    const game = await board().build();
    expect(slot(game, P2, "bfA")).toEqual([{ hidden: true, index: 0, owner: P1, zone: "facedown-bfA" }]);
    expect(slot(game, P1, "bfB")).toEqual([{ hidden: true, index: 0, owner: P2, zone: "facedown-bfB" }]);
    expect(slot(game, P1, "bfA")[0]).toMatchObject({ defId: TEEMO, id: "teemo", isHidden: true, owner: P1 });
    expect(slot(game, P2, "bfB")[0]).toMatchObject({ defId: ZHONYAS, id: "zhonyas", isHidden: true, owner: P2 });
    expect(game.view(P2).battlefields.find((b) => b.id === "bfA")).toMatchObject({ controller: P1, facedownCount: 1 });
    expect(game.view(P1).battlefields.find((b) => b.id === "bfB")).toMatchObject({ controller: P2, facedownCount: 1 });
    expect(publiclyRevealed(game)).toEqual([]);
  });

  // ── (a) concession ────────────────────────────────────────────────────────────────────────
  test("(a) P2 concedes during P1's Main Phase (650): the game ends immediately, P1 wins (651.1), and no decision of any kind is pending — P1 is NOT offered a Hidden reaction with Teemo", async () => {
    const game = await board().build();
    expect(game.p1.can("reveal", "teemo")).toBe(true); // live: the option exists …
    await p2Concedes(game);
    expect(game.isOver()).toBe(true);
    expect(game.gameState.status).toBe("finished");
    expect(game.winner()).toBe(P1);
    expect(game.decision()).toBeNull(); // … over: nothing is asked of anyone
    expect(game.p1.legal()).toEqual([]);
    expect(game.p1.can("reveal", "teemo")).toBe(false);
    expect(game.p2.legal()).toEqual([]);
    expect(game.chain()).toEqual([]);
  });

  test("(a) neither facedown card changes zones on the concession: both remain in their Facedown Zones — not banished (652.1 applies only 'if the game continues'), not trashed (323.7 needs a Cleanup)", async () => {
    const game = await board().build();
    await p2Concedes(game);
    expect(game.isOver()).toBe(true);
    expectBothStillFacedownInPlace(game);
    expect(game.violations()).toEqual([]);
  });

  // BUG — expected (421.4 second limb: "…or if the game ends, its owner reveals it to all players"): in the
  // terminal state BOTH seats' views carry the identity of BOTH facedown cards (Teemo at bfA, Zhonya's at bfB).
  // Actual: after status = finished each opposing view is still the redacted { hidden: true, owner } object.
  test("(a) after the concession both facedown cards are revealed to BOTH players — P2's view names Teemo at bfA and P1's view names Zhonya's Hourglass at bfB (421.4)", async () => {
    const game = await board().build();
    await p2Concedes(game);
    expect(game.isOver()).toBe(true);
    expectRevealedToBoth(game);
  });

  // BUG — expected (421.4 + 424.1): the game-end reveal is a reveal "to all players", so the shared public
  // reveal record gains one entry per owner: P1 → teemo, P2 → zhonyas. Actual: publicReveals stays empty.
  test("(a) the concession's game-end reveal is written to the public reveal record for each OWNER (P1: teemo, P2: zhonyas)", async () => {
    const game = await board().build();
    await p2Concedes(game);
    expect(game.isOver()).toBe(true);
    const rec = game.gameState.publicReveals ?? [];
    expect(rec).toContainEqual(expect.objectContaining({ cardIds: expect.arrayContaining(["teemo"]), playerId: P1 }));
    expect(rec).toContainEqual(expect.objectContaining({ cardIds: expect.arrayContaining(["zhonyas"]), playerId: P2 }));
  });

  // ── (b) reaching 8 by a Hold ──────────────────────────────────────────────────────────────
  test("(b) P1 on 7 holds bfA at the start of turn 3 → 8 points, game over in P1's Beginning Phase, P1 wins (323.1 / 196); both cards still facedown in place, no zone change, no prompt", async () => {
    const game = await holdBoard().build();
    await p1HoldsForTheWin(game);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.p1.points()).toBe(8);
    expect(game.phase()).toBe("beginning");
    expect(game.decision()).toBeNull();
    expectBothStillFacedownInPlace(game);
    expect(game.violations()).toEqual([]);
  });

  // BUG — same as (a): 421.4 keys on "the game ends", not on how it ends. Expected: both terminal views name
  // both cards. Actual: still redacted for the opposing seat.
  test("(b) after the winning Hold both facedown cards are revealed to BOTH players in the final views (421.4)", async () => {
    const game = await holdBoard().build();
    await p1HoldsForTheWin(game);
    expect(game.isOver()).toBe(true);
    expectRevealedToBoth(game);
  });

  // BUG — same as (a) for the record. Expected: entries P1 → teemo and P2 → zhonyas. Actual: none.
  test("(b) the Hold win's game-end reveal is written to the public reveal record for each owner", async () => {
    const game = await holdBoard().build();
    await p1HoldsForTheWin(game);
    expect(game.isOver()).toBe(true);
    const rec = game.gameState.publicReveals ?? [];
    expect(rec).toContainEqual(expect.objectContaining({ cardIds: expect.arrayContaining(["teemo"]), playerId: P1 }));
    expect(rec).toContainEqual(expect.objectContaining({ cardIds: expect.arrayContaining(["zhonyas"]), playerId: P2 }));
  });

  // ── negative control: the reveal is caused solely by the game ending ──────────────────────
  test("negative control: while the game is live nothing is revealed — through P1's turn 3 and into P2's turn both slots stay redacted for the opposing seat and off the public record; Teemo is playable from hidden for [0] on P1's turn, Zhonya's on P2's (811)", async () => {
    const game = await board().build();
    expect(game.isOver()).toBe(false);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.p1.can("reveal", "teemo")).toBe(true); // for [0]: legal with an empty pool
    expect(game.p2.can("reveal", "zhonyas")).toBe(false); // not P2's turn, no priority
    await game.advanceTurn(); // → P2's turn (P2 holds bfB: 4 → 5; nobody wins)
    expect(game.turnPlayer()).toBe(P2);
    expect(game.isOver()).toBe(false);
    expect(game.p2.can("reveal", "zhonyas")).toBe(true);
    expect(slot(game, P2, "bfA")).toEqual([{ hidden: true, index: 0, owner: P1, zone: "facedown-bfA" }]);
    expect(slot(game, P1, "bfB")).toEqual([{ hidden: true, index: 0, owner: P2, zone: "facedown-bfB" }]);
    expect(publiclyRevealed(game)).toEqual([]);
    expectBothStillFacedownInPlace(game);
    expect(game.state("teemo").isHidden).toBe(true);
    expect(game.state("zhonyas").isHidden).toBe(true);
  });

  test("negative control: actually playing Teemo from hidden on a live turn costs P1 nothing ([0]) and is the ONLY way its face becomes public before game end — it leaves the facedown slot for a public zone (P2 now sees Teemo at bfA by identity) while Zhonya's stays private", async () => {
    const game = await board().build();
    await game.p1.reveal("teemo");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("teemo")).toBe("battlefield-bfA");
    expect(game.state("teemo")).toMatchObject({ controller: P1, isHidden: false, might: 2 });
    expect(slot(game, P2, "bfA")).toEqual([]);
    expect(game.view(P2).battlefields.find((b) => b.id === "bfA")).toMatchObject({ facedownCount: 0 });
    const p2SeesAtA = game.view(P2).zones["battlefield-bfA"] ?? [];
    expect(p2SeesAtA.some((v) => !isHiddenView(v) && v.id === "teemo" && v.defId === TEEMO)).toBe(true);
    // Zhonya's is untouched and still private to P2.
    expect(slot(game, P1, "bfB")).toEqual([{ hidden: true, index: 0, owner: P2, zone: "facedown-bfB" }]);
    expect(game.isOver()).toBe(false);
  });
});
