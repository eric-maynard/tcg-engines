/**
 * Interaction: conceding mid-chain — Falling Star (ogn-029-298) × Wind Wall (ogn-064-298) × Watchful Sentry (ogn-096-298)
 *
 *   Falling Star — Spell · Fury · 2 + [fury][fury] · Action    "Deal 3 to a unit. Deal 3 to a unit."
 *   Wind Wall — Spell · Calm · 3 + [calm][calm] · Reaction     "Counter a spell."
 *   Watchful Sentry — Unit · Mind · 2 · 1 Might                "[Deathknell] — Draw 1."
 *
 * Rules: 650 (a player may concede at ANY time — a Closed state with priority included), 651 / 651.1 (the conceder is
 * removed; if only one player remains that player Wins), 196 (when a player wins, the game ends), 652 (the removal
 * pipeline — 652.4 "counter all spells of the conceded player", 652.5.c priority hand-off — runs only "if the game
 * continues"), 195, 358.5.
 *
 * Question: P1 (turn player) plays Falling Star choosing P2's Watchful Sentry for both "Deal 3". P2 responds with Wind
 * Wall targeting Falling Star and passes; chain [Falling Star, Wind Wall], priority back with P1 (mid-FEPR, Closed).
 * (a) P1 concedes instead of passing. (b) Variant: P2 — holding priority right after Wind Wall is finalized, Wall
 * unresolved on top — concedes. Who wins, does Wind Wall resolve/counter, does Falling Star resolve, does the Sentry die
 * and draw, is any further priority/Decision surfaced?
 *
 * Expected: (a) Concede is on P1's menu; P1 is removed, P2 Wins, the game ends IMMEDIATELY — the 652 steps are not run:
 * the chain is abandoned, not drained (both items still listed, neither flagged countered), Falling Star neither
 * resolves nor is countered, the Sentry takes 0, stays in base, no Deathknell, P2 draws 0; status finished, exactly one
 * winner (P2), reason concede; no Decision for anyone; every later move by either seat is rejected with the state
 * byte-identical. (b) Symmetric: P1 wins at once; Wind Wall and Falling Star both unresolved in the terminal snapshot,
 * Sentry alive and undamaged, no draw, no Decision surfaced to P1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FALLING_STAR = "ogn-029-298";
const WIND_WALL = "ogn-064-298";
const WATCHFUL_SENTRY = "ogn-096-298";

/** P1's turn, open main phase. P1: exactly Falling Star's cost + the spell; P2: the Sentry in base, exactly Wind Wall's cost + the spell. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 2 } })
    .resources(P2, { energy: 3, power: { calm: 2 } })
    .unit(P1, "base", { might: 2, name: "Bystander" }, "bystander")
    .unit(P2, "base", WATCHFUL_SENTRY, "sentry")
    .hand(P1, FALLING_STAR, "star")
    .hand(P2, WIND_WALL, "wall");
}

/** Falling Star (both instances → Sentry), P1 passes, P2 answers with Wind Wall on Falling Star. P2 now holds priority with Wall on top. */
async function starThenWall(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("star", { targets: ["sentry", "sentry"] });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "star", controller: P1, targets: ["sentry", "sentry"] })]);
  await game.p1.passPriority();
  expect(game.p2.can("cast", "wall")).toBe(true);
  await game.p2.cast("wall", { targets: "star" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["star", "wall"]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

/** …and P2 passes, handing priority back to P1 with both items unresolved (the (a) position). */
async function priorityBackToP1(): Promise<Game> {
  const game = await starThenWall();
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.chain().map((c) => c.cardId)).toEqual(["star", "wall"]);
  return game;
}

/** The frozen-board facts both variants share. */
function expectChainAbandoned(game: Game, hands: { p1: number; p2: number }): void {
  // Chain left exactly as it was: two unresolved items, neither marked countered, both spell cards still "on the chain".
  expect(game.chain()).toEqual([
    expect.objectContaining({ cardId: "star", controller: P1, countered: false, targets: ["sentry", "sentry"] }),
    expect.objectContaining({ cardId: "wall", controller: P2, countered: false, targets: ["star"] }),
  ]);
  expect(game.zoneOf("star")).toBe("chain");
  expect(game.zoneOf("wall")).toBe("chain");
  // Falling Star never resolved: Sentry undamaged, alive, no Deathknell, nobody drew.
  expect(game.state("sentry")).toMatchObject({ damage: 0, zone: "base" });
  expect((game.gameState.damageLog ?? []).length).toBe(0);
  expect(game.p2.trash()).toEqual([]);
  expect(game.p1.trash()).toEqual([]);
  expect(game.p2.hand()).toHaveLength(hands.p2);
  expect(game.p1.hand()).toHaveLength(hands.p1);
  // Costs stay paid — nothing is unwound either.
  expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
}

describe("(a) P1 concedes while holding priority under [Falling Star, Wind Wall]", () => {
  test("650: concede is on P1's menu in this Closed, mid-chain priority window (alongside pass)", async () => {
    const game = await priorityBackToP1();
    expect(game.p1.can("concede")).toBe(true);
    expect(game.p1.legal().map((o) => o.verb).sort()).toEqual(["concede", "passPriority"]);
    expect(game.isOver()).toBe(false);
  });

  test("651 / 651.1 / 196: P1 is removed, P2 is the one remaining player and WINS, the game is finished at once with reason 'concede' and exactly one winner", async () => {
    const game = await priorityBackToP1();
    await game.p1.concede();
    expect(game.isOver()).toBe(true);
    expect(game.gameState.status).toBe("finished");
    expect(game.winner()).toBe(P2);
    expect(game.gameState.removedPlayers).toEqual([P1]);
    expect(game.engine.getGameEndResult()).toMatchObject({ metadata: { concededBy: P1 }, reason: "concede", winner: P2 });
    expect(game.view().winner).toBe(P2);
    expect(game.view().status).toBe("finished");
  });

  test("the game did not continue, so 652 is NOT run: the chain is abandoned undrained — Wind Wall never resolves (nothing is flagged countered), Falling Star neither resolves nor is countered, Sentry takes 0 and lives, no Deathknell, P2 draws 0", async () => {
    const game = await priorityBackToP1();
    const hands = { p1: game.p1.hand().length, p2: game.p2.hand().length };
    await game.p1.concede();
    expectChainAbandoned(game, hands);
    expect(game.violations()).toEqual([]);
  });

  test("no priority hand-off (652.5.c not run): no Decision for anyone — game.decision(), P1's and P2's are all null, settle() reports game-over without touching the state", async () => {
    const game = await priorityBackToP1();
    await game.p1.concede();
    expect(game.decision()).toBeNull();
    expect(game.p1.decision()).toBeNull();
    expect(game.p2.decision()).toBeNull();
    expect(game.p2.legal()).toEqual([]);
    expect(game.p1.legal()).toEqual([]);
    const h = game.stateHash();
    const s = await game.settle();
    expect(s).toMatchObject({ reason: "game-over", steps: 0 });
    expect(game.stateHash()).toBe(h);
  });

  test("terminal means terminal: every subsequent move by either seat — pass, resolve, concede again (menu or raw) — is rejected and the state stays byte-identical", async () => {
    const game = await priorityBackToP1();
    await game.p1.concede();
    const h = game.stateHash();
    const attempts: [string, () => Promise<unknown>][] = [
      ["p2.pass", () => game.p2.pass()],
      ["p2.passPriority", () => game.p2.passPriority()],
      ["p2.concede", () => game.p2.concede()],
      ["p1.pass", () => game.p1.pass()],
      ["p1.concede", () => game.p1.concede()],
      ["p2 raw passChainPriority", () => game.p2.do("passChainPriority")],
      ["p2 raw resolveChain", () => game.p2.do("resolveChain")],
      ["p2 raw concede", () => game.p2.do("concede")],
      ["p1 raw concede", () => game.p1.do("concede")],
      ["p1 raw endTurn", () => game.p1.do("endTurn")],
    ];
    for (const [label, fn] of attempts) {
      const r = await game.p1.try(() => fn());
      expect({ label, ok: r.ok }).toEqual({ label, ok: false });
      expect(game.stateHash()).toBe(h);
    }
    expect(game.winner()).toBe(P2);
    expect(game.chain()).toHaveLength(2);
  });
});

describe("(b) variant — P2 concedes while holding priority with its own Wind Wall unresolved on top", () => {
  test("650 / 651.1: concede is on P2's menu there; P2 is removed and P1 WINS immediately (reason concede, one winner)", async () => {
    const game = await starThenWall();
    expect(game.p2.can("concede")).toBe(true);
    await game.p2.concede();
    expect(game.isOver()).toBe(true);
    expect(game.gameState.status).toBe("finished");
    expect(game.winner()).toBe(P1);
    expect(game.gameState.removedPlayers).toEqual([P2]);
    expect(game.engine.getGameEndResult()).toMatchObject({ metadata: { concededBy: P2 }, reason: "concede", winner: P1 });
  });

  test("symmetric freeze: Wind Wall does not resolve (652.4 would only have countered P2's OWN Wall anyway — and it is not run), Falling Star does not resolve, the terminal snapshot still shows two unresolved items, Sentry alive at 0 damage, no draw", async () => {
    const game = await starThenWall();
    const hands = { p1: game.p1.hand().length, p2: game.p2.hand().length };
    await game.p2.concede();
    expectChainAbandoned(game, hands);
    expect(game.violations()).toEqual([]);
  });

  test("no Decision is surfaced to P1 (the would-be next priority holder); settle() is a no-op game-over and any move by either seat is rejected with the state unchanged", async () => {
    const game = await starThenWall();
    await game.p2.concede();
    expect(game.decision()).toBeNull();
    expect(game.p1.decision()).toBeNull();
    expect(game.p1.legal()).toEqual([]);
    const h = game.stateHash();
    expect((await game.settle()).reason).toBe("game-over");
    for (const fn of [() => game.p1.pass(), () => game.p1.concede(), () => game.p1.do("resolveChain"), () => game.p1.do("passChainPriority"), () => game.p2.do("concede")]) {
      expect((await game.p1.try(() => fn())).ok).toBe(false);
    }
    expect(game.stateHash()).toBe(h);
    expect(game.winner()).toBe(P1);
  });

  test("control — had nobody conceded, the chain WOULD have drained: Wind Wall counters Falling Star, Sentry survives, both spells hit the trash, P1's open main phase (so the frozen snapshots above are the concession's doing)", async () => {
    const game = await priorityBackToP1();
    const p2Hand = game.p2.hand().length;
    await game.settle();
    expect(game.isOver()).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("star")).toBe("trash");
    expect(game.state("sentry")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
