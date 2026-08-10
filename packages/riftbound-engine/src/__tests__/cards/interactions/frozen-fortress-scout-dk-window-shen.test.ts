/**
 * Interaction: Frozen Fortress (unl-212-219) · Battlefield
 *     "At the start of each player's Beginning Phase, deal 1 to each unit here. (This happens before scoring.)"
 *   × Soaring Scout (ogn-216-298) · 1 Might · "[Deathknell] — Channel 1 rune exhausted."
 *   × Shen, Kinkou (ogn-241-298) · 3 Might champion, [3]+[order]
 *     "[Reaction] (Play any time, even before spells and abilities resolve, including to a battlefield you control.) [Shield 2] [Tank]"
 *
 * Question: 1v1 to 8, P1 on 7. P1 controls Frozen Fortress with a LONE Soaring Scout and holds Shen
 * (and can pay for him). P1's turn begins. YES case: the Fortress trigger kills the Scout — is control
 * of the Fortress lost in that Cleanup (task 4), given task 3a just queued the Scout's Deathknell? May
 * P1, in response to its own Deathknell, play Shen TO the Fortress and then HOLD it for the 8th point?
 * NO case: the lone unit is a vanilla 1-Might Recruit (no death trigger) — is there any window to land
 * Shen at the Fortress before control lapses, and does P1 score? Safe line: respond to the Fortress
 * trigger itself with Shen before it resolves.
 *
 * Rules: 319.2/319.5 (Cleanups after phase transition / chain item removed), 315.2.a.1 (Beginning Step
 * "start of Beginning Phase" triggers), 190.6.a (P1 controls the Fortress's ability), 323.4/808.1.d.2
 * (task 3a: Deathknell queued as a Pending Item BEFORE 3b puts the unit in the trash), 323.6/190.4.c
 * (task 4 removes control only in an OPEN state with no showdown/combat there), 309.1 (a Chain exists →
 * Closed), 320.1 (no priority inside a Cleanup — nothing happens between 3b and 4), 355.2.a (valid
 * locations = base or a battlefield you control), 190.3.a.1 (no Contested when you already control it),
 * 315.2.b.2/469.2 (Scoring Step: Hold), 471.1.a.1 (Final-Point restriction is Conquer-only), 323.1/472
 * (≥ Victory Score and ahead at a Cleanup → win).
 *
 * Expected: YES — after the Fortress trigger resolves the Scout is in the trash, its Deathknell is on the
 * chain, and the Fortress is STILL P1's (Closed State → task 4 skipped). P1 holds priority, may play Shen
 * to the Fortress (offered: base + fort), Deathknell resolves (1 rune channeled exhausted), Scoring Step
 * holds the Fortress → 8 → P1 wins. NO — the Recruit dies with nothing queued, the same Cleanup is Open
 * → control lapses at once; the next thing P1 sees is the main phase with the Fortress uncontrolled, Shen
 * is offered only to base, P1 stays on 7. Safe line — Shen played in response to the Fortress trigger
 * takes 1, survives, P1 holds and wins.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FROZEN_FORTRESS = "unl-212-219";
const SOARING_SCOUT = "ogn-216-298";
const SHEN = "ogn-241-298";

/** Legal `to` destinations offered to P1 for playing `alias` right now ([] when not offered). */
function destinationsOffered(game: Game, alias: string): string[] {
  const opt = game.p1.option("play", alias);
  const field = opt?.fields.find((f) => f.arg === "to");
  return ((field?.options ?? []) as string[]).slice().sort();
}

/**
 * P2 is about to end turn 2. P1: 7 points (to 8), controls Frozen Fortress with one lone unit there,
 * Shen in hand, four ready Order runes (3 to tap for energy, 1 to recycle for the [order] pip).
 */
function board(lone: "scout" | "recruit") {
  const s = scenario()
    .turn(2)
    .active(P2)
    .victoryScore(8)
    .points(P1, 7)
    .points(P2, 0)
    .rune(P1, "order", { alias: "r1" })
    .rune(P1, "order", { alias: "r2" })
    .rune(P1, "order", { alias: "r3" })
    .rune(P1, "order", { alias: "r4" })
    .battlefield("fort", { controller: P1, def: FROZEN_FORTRESS, inert: false, owner: P1 })
    .battlefield("bf2", { controller: null })
    .hand(P1, SHEN, "shen");
  return lone === "scout"
    ? s.unit(P1, "fort", SOARING_SCOUT, "scout")
    : s.unit(P1, "fort", { might: 1, name: "Recruit" }, "recruit");
}

/** Rune abilities are Reaction-speed: P1 floats [3] + [order] while holding priority. */
async function payForShen(game: Game): Promise<void> {
  await game.p1.tapRune("r1");
  await game.p1.tapRune("r2");
  await game.p1.tapRune("r3");
  await game.p1.recycleRune("r4");
}

/** P2 ends → P1's Beginning Phase; both pass on the Fortress trigger so it resolves. */
async function resolveFortressTrigger(game: Game): Promise<void> {
  await game.p2.endTurn();
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fort", name: "Frozen Fortress", triggered: true })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
}

describe("Frozen Fortress × Soaring Scout Deathknell window × Shen, Kinkou — holding an emptied Fortress for the win", () => {
  // ── common: the Beginning Step ────────────────────────────────────────────────────────

  test("start of P1's Beginning Phase: the Fortress trigger is a chain item controlled by P1 (190.6.a), P1 holds priority, nothing scored yet", async () => {
    const game = await board("scout").build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fort", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.state("scout").damage).toBe(0);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
  });

  // ── YES case: Soaring Scout ───────────────────────────────────────────────────────────

  test("YES: the trigger kills the Scout — task 3a queues its Deathknell (P1's item) and 3b trashes it (323.4/323.5, 808.1.d.2)", async () => {
    const game = await board("scout").build();
    await resolveFortressTrigger(game);
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "scout", controller: P1, name: "Soaring Scout", triggered: true })]);
    expect(game.phase()).toBe("beginning");
  });

  test("YES: task 4 is SKIPPED — a Chain exists (Closed State, 309.1) so the empty Fortress is still controlled by P1 (323.6/190.4.c)", async () => {
    const game = await board("scout").build();
    await resolveFortressTrigger(game);
    expect(game.p1.units("fort")).toEqual([]);
    expect(game.gameState.battlefields.fort?.controller).toBe(P1);
    expect(game.gameState.battlefields.fort?.contested).toBe(false);
  });

  test("YES: P1 receives priority on its own Deathknell and — after floating [3]+[order] — Shen is offered to base AND to the Fortress (355.2.a, Reaction)", async () => {
    const game = await board("scout").build();
    await resolveFortressTrigger(game);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await payForShen(game);
    expect(game.p1.can("play", "shen")).toBe(true);
    expect(destinationsOffered(game, "shen")).toEqual(["base", "battlefield-fort"]);
  });

  test("YES: Shen played to the Fortress enters there at once, uncontested (190.3.a.1), with the Deathknell still waiting on the chain", async () => {
    const game = await board("scout").build();
    await resolveFortressTrigger(game);
    await payForShen(game);
    await game.p1.play("shen", { to: "fort" });
    expect(game.zoneOf("shen")).toBe("battlefield-fort");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.gameState.battlefields.fort).toMatchObject({ contested: false, controller: P1 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "scout", triggered: true })]);
    expect(game.p1.points()).toBe(7); // still the Beginning Step — no scoring yet
  });

  test("YES: the Deathknell then resolves — P1 channels 1 rune EXHAUSTED (pool 3 → 4, none ready, rune deck −1)", async () => {
    const game = await board("scout").build();
    await resolveFortressTrigger(game);
    await payForShen(game);
    // r1..r3 tapped, r4 recycled → 3 in pool, 0 ready
    expect(game.p1.runes()).toHaveLength(3);
    const runeDeck = game.p1.runeDeck().length;
    await game.p1.play("shen", { to: "fort" });
    await game.settle();
    expect(game.p1.runes()).toHaveLength(4);
    expect(game.p1.runes({ ready: true })).toEqual([]);
    expect(game.p1.runeDeck()).toHaveLength(runeDeck - 1);
  });

  test("YES: Scoring Step — P1 HOLDS Frozen Fortress (469.2) for the 8th point; Hold is not a Conquer so no Final-Point restriction (471.1.a.1) → P1 WINS (323.1/472)", async () => {
    const game = await board("scout").build();
    await resolveFortressTrigger(game);
    await payForShen(game);
    await game.p1.play("shen", { to: "fort" });
    const r = await game.settle();
    expect(r.reason).toBe("game-over");
    expect(game.gameState.battlefields.fort?.controller).toBe(P1);
    expect(game.gameState.scoredThisTurn?.[P1]).toEqual(["fort"]);
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("YES contrast: if P1 just passes on its Deathknell, the chain empties → Open → task 4 strips the empty Fortress; no hold, P1 stays on 7", async () => {
    const game = await board("scout").build();
    await resolveFortressTrigger(game);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.gameState.battlefields.fort?.controller ?? null).toBeNull();
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(destinationsOffered(game, "shen")).not.toContain("battlefield-fort");
  });

  // ── NO case: vanilla Recruit ──────────────────────────────────────────────────────────

  test("NO: the Recruit dies with nothing queued — the same Cleanup is Open, so control lapses immediately; there is no priority between 3b and 4 (320.1): P1's next decision is already the main phase", async () => {
    const game = await board("recruit").build();
    await resolveFortressTrigger(game);
    expect(game.zoneOf("recruit")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.phase()).toBe("main");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.gameState.battlefields.fort?.controller ?? null).toBeNull();
  });

  test("NO: P1 does not score — stays on 7, nothing recorded as scored, game continues", async () => {
    const game = await board("recruit").build();
    await resolveFortressTrigger(game);
    expect(game.p1.points()).toBe(7);
    expect(game.gameState.scoredThisTurn?.[P1]).toEqual([]);
    expect(game.isOver()).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("NO: Shen can now only go to base — the uncontrolled Fortress is not a valid location (355.2.a) and playing him there is rejected", async () => {
    const game = await board("recruit").build();
    await resolveFortressTrigger(game);
    await payForShen(game);
    expect(game.p1.can("play", "shen")).toBe(true);
    expect(destinationsOffered(game, "shen")).toEqual(["base"]);
    await expect(game.p1.play("shen", { to: "fort" })).rejects.toThrow();
    expect(game.zoneOf("shen")).toBe("hand");
  });

  // ── safe line (works in both cases) ───────────────────────────────────────────────────

  test("safe line: respond to the Fortress trigger BEFORE it resolves — Shen to the Fortress is offered while the trigger is on the chain", async () => {
    const game = await board("recruit").build();
    await game.p2.endTurn();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fort", triggered: true })]);
    await payForShen(game);
    expect(destinationsOffered(game, "shen")).toEqual(["base", "battlefield-fort"]);
    await game.p1.play("shen", { to: "fort" });
    expect(game.zoneOf("shen")).toBe("battlefield-fort");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fort", triggered: true })]); // trigger still pending
  });

  test("safe line (Recruit): the trigger then pings both — Recruit dies, Shen (3) takes 1 and survives, the Fortress is never empty → P1 holds → 8 → wins", async () => {
    const game = await board("recruit").build();
    await game.p2.endTurn();
    await payForShen(game);
    await game.p1.play("shen", { to: "fort" });
    const r = await game.settle();
    expect(r.reason).toBe("game-over");
    expect(game.zoneOf("recruit")).toBe("trash");
    expect(game.state("shen")).toMatchObject({ damage: 1, might: 3, zone: "battlefield-fort" });
    expect(game.gameState.battlefields.fort?.controller).toBe(P1);
    expect(game.p1.points()).toBe(8);
    expect(game.winner()).toBe(P1);
  });

  test("safe line (Scout): same outcome — Scout dies (Deathknell channels 1 exhausted), Shen survives on 1 damage, P1 holds and wins", async () => {
    const game = await board("scout").build();
    await game.p2.endTurn();
    await payForShen(game);
    await game.p1.play("shen", { to: "fort" });
    const r = await game.settle();
    expect(r.reason).toBe("game-over");
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.state("shen")).toMatchObject({ damage: 1, zone: "battlefield-fort" });
    expect(game.p1.runes()).toHaveLength(4); // 3 left in pool + 1 channeled by the Deathknell
    expect(game.p1.points()).toBe(8);
    expect(game.winner()).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
