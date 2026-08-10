/**
 * Interaction: Fury Rune (ogn-007-298) · Basic Rune — "[E]: [Reaction] — Add [1]." (164.2.a)
 *   × Hextech Ray (ogn-009-298) · Spell [Action] · Fury · 1 + [fury] — "Deal 3 to a unit at a battlefield."
 *   × Discipline (ogn-058-298) · Spell [Reaction] · Calm · 2 — "Give a unit +2 [Might] this turn. Draw 1."
 *   (+ Startipped Peak ogn-288-298 as bf1's live text — "When you hold here, you may channel 1 rune
 *    exhausted" — purely as a pause button: its yes/no stops the game inside P2's Beginning Phase so the
 *    pool can be read BEFORE P2's Main Phase begins.)
 *
 * Position: P1's turn. P2 controls 3 ready Fury Runes, pool (0E,{}), holds Discipline and a vanilla
 * 3-cost unit; P2's 7-Might unit T sits at bf1 (big enough to survive Ray + the later attack, so P2 still
 * holds bf1 next turn). P1 has exactly 1 + [fury] for Hextech Ray and a 3-Might attacker A in base.
 *
 * Question: P1 casts Ray at T; in the reaction window P2 exhausts all 3 runes but plays nothing and
 * passes; Ray resolves. Later the same turn P1 attacks bf1; in the combat showdown P2 (with Focus) plays
 * Discipline paid only from the float. P1 then ends the turn. (a) does a rune tap create a chain item /
 * give P1 priority; may P2 tap while merely holding priority with nothing to pay? (b) does the 3E survive
 * Ray resolving, the chain closing and the showdown opening (3 when Discipline is offered, 1 after)?
 * (c) when exactly is the last 1E lost — P1's Expiration Step (317.2.d) or P2's own Main Phase (316.3)?
 * (d) NO side: in P1's Neutral Open state may P2 tap at all; and does unspent float ever reach P2's Main
 * Phase to pay for the 3-drop?
 *
 * Rules: 164.2.a + 813.1.c.2 (basic-rune [E] is a Reaction-tagged activated Add ability: Closed states,
 * any turn), 429.2 / 429.2.a / 337.1.a (Add abilities resolve on finalization, never pass priority, no
 * chain item), 166.2 / 167 (pools only empty at 316.3 and 317.2.d), 317.2.d ("EACH player's Rune Pool
 * empties" in the turn player's Expiration Step), 316.3, 316.5.b / 310.1.a (Neutral Open: only the turn
 * player acts), 444.1.
 *
 * Expected: (a) each tap resolves at once — pool (0)→(1)→(2)→(3), chain still just [Ray], P2 keeps
 * priority throughout, P1 gets no window in between; legal with nothing to pay. (b) yes: 3E through Ray's
 * resolution, the empty chain, the move and the showdown; Discipline is listed for P2 on Focus and paid
 * from the float with every rune still exhausted → 1E. (c) the last 1E dies in P1's Expiration Step
 * (317.2.d) — P2's pool already reads 0 during P2's Beginning Phase, so 316.3 empties nothing. (d) P2 may
 * NOT tap in P1's Neutral Open state (no priority, no payment) — tapRune must not be listed for P2; and 3E
 * left floating is gone at 317.2.d: P2 starts its Main Phase at 0 and must tap freshly-readied runes for
 * the 3-drop.
 */
import { describe, expect, test } from "bun:test";
import type { Game, Seat } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FURY_RUNE = "ogn-007-298";
const HEXTECH_RAY = "ogn-009-298";
const DISCIPLINE = "ogn-058-298";
const STARTIPPED_PEAK = "ogn-288-298";

/**
 * P1's turn 2, main phase. bf1 = Startipped Peak (live), P2's, with P2's 7-Might T on it. P1: 3-Might A
 * in base, Hextech Ray in hand, exactly 1 + [fury]. P2: three ready Fury Runes r1–r3, empty pool,
 * Discipline + a vanilla 3-cost unit in hand.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2, def: STARTIPPED_PEAK, inert: false })
    .unit(P2, "bf1", { might: 7, name: "Target T" }, "t")
    .unit(P1, "base", { might: 3, name: "Attacker A" }, "a")
    .rune(P2, FURY_RUNE, { alias: "r1" })
    .rune(P2, FURY_RUNE, { alias: "r2" })
    .rune(P2, FURY_RUNE, { alias: "r3" })
    .hand(P1, HEXTECH_RAY, "ray")
    .hand(P2, DISCIPLINE, "disc")
    .hand(P2, { cardType: "unit", energyCost: 3, might: 3, name: "Three Drop" }, "drop");
}

function keys(game: Game, seat: Seat): string[] {
  return game.seat(seat).legal().map((o) => o.key);
}

function tapKeys(game: Game, seat: Seat): string[] {
  return keys(game, seat).filter((k) => k.startsWith("exhaustRune:"));
}

function pool(game: Game, seat: Seat) {
  return game.seat(seat).resources();
}

/** P1 casts Ray at T and passes; P2 (holding priority) taps r1, r2, r3 and passes → Ray resolves. Neutral Open again. */
async function floated(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("ray", { targets: "t" });
  await game.p1.passPriority();
  await game.p2.tapRune("r1");
  await game.p2.tapRune("r2");
  await game.p2.tapRune("r3");
  await game.p2.passPriority();
  expect(game.chain()).toEqual([]);
  return game;
}

/** …then P1 attacks bf1 with A and passes Focus; P2 (Focus) plays Discipline on T from the float; combat resolves. */
async function disciplinedFromFloat(): Promise<Game> {
  const game = await floated();
  await game.p1.move("a", "bf1");
  await game.p1.passFocus();
  await game.p2.cast("disc", { targets: "t" });
  await game.settle();
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  return game;
}

describe("Rune float on the opponent's turn — taps are instant Adds, the float lives until 317.2.d (not 316.3)", () => {
  // ── (a) tapping in the reaction window ────────────────────────────────────────────────────────

  test("(a) in the Closed state on Ray, P2 holds priority with NOTHING to pay and all three [E] Add abilities are listed for it (813.1.c.2)", async () => {
    const game = await board().build();
    await game.p1.cast("ray", { targets: "t" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(tapKeys(game, P2).sort()).toEqual(["exhaustRune:r1", "exhaustRune:r2", "exhaustRune:r3"]);
    expect(game.p2.can("cast", "disc")).toBe(false); // pool-only affordability: nothing floated yet
    expect(pool(game, P2)).toEqual({ energy: 0, power: {} });
  });

  test("(a) each tap finalizes and resolves at once: pool (0)→(1)→(2)→(3), never a chain item, P2 keeps priority and P1 gets no window in between (429.2, 429.2.a, 337.1.a)", async () => {
    const game = await board().build();
    await game.p1.cast("ray", { targets: "t" });
    await game.p1.passPriority();
    const trace = [pool(game, P2)];
    for (const r of ["r1", "r2", "r3"]) {
      await game.p2.tapRune(r);
      trace.push(pool(game, P2));
      expect(game.chain().map((i) => i.cardId)).toEqual(["ray"]);
      expect(game.actingSeat()).toBe(P2);
      expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
      expect(keys(game, P1)).not.toContain("passChainPriority:-"); // P1 is not being asked anything
      expect(game.state(r).isExhausted).toBe(true);
    }
    expect(trace).toEqual([
      { energy: 0, power: {} },
      { energy: 1, power: {} },
      { energy: 2, power: {} },
      { energy: 3, power: {} },
    ]);
    expect(tapKeys(game, P2)).toEqual([]);
    expect(game.p2.can("cast", "disc")).toBe(true); // now affordable — but P2 plays nothing
  });

  // ── (b) the float survives resolution, the empty chain, the move and the showdown ─────────────

  test("(b) P2 passes; Ray resolves (3 to T) and the chain closes — P2 still has (3), all runes exhausted (167)", async () => {
    const game = await floated();
    expect(game.state("t")).toMatchObject({ damage: 3, zone: "battlefield-bf1" });
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(pool(game, P2)).toEqual({ energy: 3, power: {} });
    expect(game.p2.runes({ ready: true })).toEqual([]);
  });

  test("(b) later that turn P1 attacks bf1: combat showdown opens, P1 (Focus) passes → Discipline IS listed for P2 on Focus with the pool still (3) and no ready rune", async () => {
    const game = await floated();
    await game.p1.move("a", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(pool(game, P2)).toEqual({ energy: 3, power: {} });
    await game.p1.passFocus();
    expect(game.actingSeat()).toBe(P2);
    expect(pool(game, P2)).toEqual({ energy: 3, power: {} });
    expect(game.p2.runes({ ready: true })).toEqual([]);
    expect(game.p2.can("cast", "disc")).toBe(true);
    expect(keys(game, P2)).toContain("playSpell:disc");
  });

  test("(b) Discipline (2) is paid ENTIRELY from the float: (3)→(1), every rune still exhausted; it resolves (+2 to T, P2 draws 1) and combat plays out (A dies into T)", async () => {
    const game = await floated();
    await game.p1.move("a", "bf1");
    await game.p1.passFocus();
    const hand = game.p2.hand().length;
    await game.p2.cast("disc", { targets: "t" });
    expect(pool(game, P2)).toEqual({ energy: 1, power: {} });
    expect(game.p2.runes({ ready: true })).toEqual([]);
    await game.settle();
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(hand - 1 + 1);
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.state("t")).toMatchObject({ mightModifier: 2, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(pool(game, P2)).toEqual({ energy: 1, power: {} }); // still floating after combat
  });

  // ── (c) the last 1E dies at 317.2.d, not 316.3 ────────────────────────────────────────────────

  test("(c) P1 ends the turn: the Expiration Step's 'empty pools' pass records P2 losing exactly that 1E (317.2.d — EACH player's pool)", async () => {
    const game = await disciplinedFromFloat();
    expect(pool(game, P2)).toEqual({ energy: 1, power: {} });
    await game.p1.endTurn();
    const passes = game.trace().expiration;
    expect(passes).toHaveLength(1);
    expect(passes[0]?.steps).toEqual(["heal", "expire", "empty-pools"]);
    expect(passes[0]?.poolsEmptied).toEqual({ [P2]: { energy: 1, power: {} } });
  });

  test("(c) …so P2's pool already reads (0) DURING P2's Beginning Phase (paused on the Peak's hold prompt, after Awaken readied r1–r3) — 316.3 later empties an already-empty pool", async () => {
    const game = await disciplinedFromFloat();
    await game.p1.endTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("beginning");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "bf1" } });
    expect(pool(game, P2)).toEqual({ energy: 0, power: {} });
    expect(game.p2.runes({ ready: true }).sort()).toEqual(["r1", "r2", "r3"]); // 315.1.b Awaken already ran
    await game.p2.no();
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(pool(game, P2)).toEqual({ energy: 0, power: {} });
    expect(game.p2.runes()).toHaveLength(5); // + the Channel Phase's 2
  });

  // ── (d) the NO side ───────────────────────────────────────────────────────────────────────────

  // Expected (316.5.b / 310.1.a / 429.3): in a Neutral Open state on P1's turn only P1 may act; P2 has
  // neither priority nor a payment in progress, so its runes' [Reaction] Add abilities are not
  // activatable and must not be enumerated. Actual: with no chain open the engine's rune gate
  // (`holdsRunePriority`) lets EVERY player tap/recycle, so exhaustRune:r1–r3 are listed for P2 and a
  // tap goes through.
  test("P2 must not be offered tapRune in P1's Neutral Open state (no priority, nothing to pay — 316.5.b, 310.1.a)", async () => {
    const game = await board().build();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(tapKeys(game, P2)).toEqual([]);
    expect(game.p2.can("tapRune")).toBe(false);
    await expect(game.p2.tapRune("r1")).rejects.toThrow();
    expect(pool(game, P2)).toEqual({ energy: 0, power: {} });
  });

  test("(d) if P2 never spends the 3E: all of it vanishes in P1's Expiration Step (317.2.d) — P2's Beginning Phase and Main Phase both open at (0)", async () => {
    const game = await floated();
    expect(pool(game, P2)).toEqual({ energy: 3, power: {} });
    await game.p1.endTurn();
    expect(game.trace().expiration[0]?.poolsEmptied).toEqual({ [P2]: { energy: 3, power: {} } });
    expect(game.phase()).toBe("beginning");
    expect(pool(game, P2)).toEqual({ energy: 0, power: {} });
    await game.p2.no();
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(pool(game, P2)).toEqual({ energy: 0, power: {} });
  });

  test("(d) …so the 3-drop is NOT playable at the start of P2's Main Phase; P2 must tap three freshly-readied runes first, and then it is", async () => {
    const game = await floated();
    await game.p1.endTurn();
    await game.p2.no();
    await game.settle();
    expect(game.p2.can("play", "drop")).toBe(false);
    expect(game.p2.runes({ ready: true }).length).toBeGreaterThanOrEqual(3);
    await game.p2.tapRunes(3);
    expect(pool(game, P2)).toEqual({ energy: 3, power: {} });
    expect(game.p2.can("play", "drop")).toBe(true);
    await game.p2.play("drop", { to: "base" });
    expect(game.zoneOf("drop")).toBe("base");
    expect(pool(game, P2)).toEqual({ energy: 0, power: {} });
    expect(game.violations()).toEqual([]);
  });
});
