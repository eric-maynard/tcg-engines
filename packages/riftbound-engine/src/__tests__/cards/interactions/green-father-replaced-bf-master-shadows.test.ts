/**
 * Interaction: Green Father (unl-195-219) · Legend · Ivern · Calm/Order
 *     "When you conquer or hold, you may exhaust me to replace that battlefield with a Brush battlefield token."
 *   → Brush (unl-t03) battlefield token — "Bird, Cat, Dog, Poro, and Ivern units here have +1 [Might]. When you
 *     score here, you may replace this with the battlefield it replaced."
 *   × Master of Shadows (ven-191-166) · Legend · Zed · Fury/Chaos — "When you banish a card you own, empower me. …"
 *   × Wind and Ghosts (ven-106-166) · Spell · Chaos · 3+[chaos] · Action — "Choose a unit at a battlefield. If it
 *     has 3 [Might] or less, banish it. Otherwise, return it to its owner's hand."  (yes-side control)
 *
 * Rules: 438.1 (Replace = create a token in the place of a card, inheriting its statuses), 438.4 (Replacing is
 * NOT a subset of Banishing), 438.5 / 438.5.a (the replaced card is placed in Banishment "as Replaced, not
 * Banished"), 438.7 / 438.7.b (Swap Back: the token stops existing, the original returns to the slot inheriting
 * current statuses), 183 / 439.4 (a token is owned by whoever controlled the creating effect), 056 / 056.1 /
 * 056.2 / 108.6.a (a card can only ever sit in its OWNER's banishment), 127.1 (ownership never changes),
 * 191.4.a (an ability's controller = its source's controller), 186.1 (a token off the board ceases to exist),
 * 470 (one score per battlefield per turn).
 *
 * Question: P1 = Green Father, P2 = Master of Shadows. bfA is P2's OWN battlefield card, held by P2 with a
 * straggler; P1's Raider attacks, clears it, conquers, and P1 exhausts Green Father → Brush.
 *  (a) Brush token: owner P1, controller P1 (in bfA's slot).
 *  (b) The replaced bfA card: P2's banishment (its owner's), flagged Replaced — (P2, –, P2.banishment).
 *  (c) Master of Shadows does NOT empower: Replace is not a banish (438.4/438.5.a), and P1 — not P2 — did it.
 *  (d) Control: on P2's turn P2 Wind-and-Ghosts P2's own 2-Might unit at a battlefield → banished → empower.
 *  (e) P2 later retakes and scores the Brush and swaps back: token simply stops existing (no trash, no
 *      banishment); bfA returns owner P2 / controller P2; P2's banishment empty; no re-score.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GREEN_FATHER = "unl-195-219";
const MASTER_OF_SHADOWS = "ven-191-166";
const WIND_AND_GHOSTS = "ven-106-166";

/**
 * P1's turn 3. P1: legend Green Father, Raider (3) in base. P2: legend Master of Shadows; bfA is P2's OWN
 * battlefield card, held by a 1-Might Straggler; bfB (P1's card) is held by P2's Shade (2) — the Wind and
 * Ghosts subject; Bruiser (5) in P2's base for the retake; Wind and Ghosts in P2's hand.
 */
function board() {
  return scenario()
    .turn(3)
    .legend(P1, GREEN_FATHER, "gf")
    .legend(P2, MASTER_OF_SHADOWS, "mos")
    .battlefield("bfA", { controller: P2, owner: P2 })
    .battlefield("bfB", { controller: P2, owner: P1 })
    .unit(P2, "bfA", { might: 1, name: "Straggler" }, "straggler")
    .unit(P2, "bfB", { might: 2, name: "Shade" }, "shade")
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
    .unit(P2, "base", { might: 5, name: "Bruiser" }, "bruiser")
    .hand(P2, WIND_AND_GHOSTS, "wag");
}

const count = (game: Game, key: string): number => (game.gameState.turnEventCounts ?? {})[key] ?? 0;

/** The battlefield-row card currently named `name` (id, owner, controller of the slot, token-ness). */
function slotNamed(game: Game, name: string) {
  const id = game.battlefields().find((b) => game.state(b).name === name);
  if (id === undefined) {
    return undefined;
  }
  const s = game.state(id);
  return { controller: game.gameState.battlefields[id]?.controller ?? null, id, isToken: s.isToken, owner: s.owner, zone: s.zone };
}

/** Raider attacks bfA, kills the Straggler, P1 conquers (+1); Green Father asks → YES → bfA becomes a Brush. */
async function conquerAndBrush(): Promise<Game> {
  const game = await board().build();
  expect(slotNamed(game, "bfA")).toEqual({ controller: P2, id: "bfA", isToken: false, owner: P2, zone: "battlefieldRow" });
  await game.p1.move("raider", "bfA");
  const r = await game.settle();
  expect(r.decision).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "gf" } });
  expect(game.zoneOf("straggler")).toBe("trash");
  expect(game.p1.points()).toBe(1);
  await game.p1.yes();
  expect(game.state("gf").isExhausted).toBe(true); // the cost, paid on accepting
  await game.settle();
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  return game;
}

describe("(a)/(b) who owns what after Green Father replaces P2's own battlefield", () => {
  test("(a) the Brush token sits in bfA's slot, is OWNED by P1 (183/439.4 — P1 controlled the creating ability) and CONTROLLED by P1 (438.1 — it inherits the control P1 just established); Raider is still standing on it", async () => {
    const game = await conquerAndBrush();
    const brush = slotNamed(game, "Brush");
    expect(brush).toEqual({ controller: P1, id: "bfA", isToken: true, owner: P1, zone: "battlefieldRow" });
    expect(game.locationOf("raider")).toBe("bfA");
    expect(game.p1.units("bfA")).toEqual(["raider"]);
    expect(game.battlefields()).toHaveLength(2); // replaced in place, no extra slot
  });

  test("(b) the replaced bfA CARD is placed in Banishment (438.5) — P2's banishment, because P2 owns it (056/056.2/108.6.a), never P1's; it stays P2's card (127.1) and the token remembers it as 'the battlefield it replaced'", async () => {
    const game = await conquerAndBrush();
    const banished = game.cardsAt("banishment");
    expect(banished).toHaveLength(1);
    const replaced = banished[0]!;
    expect(game.state(replaced)).toMatchObject({ cardType: "battlefield", name: "bfA", owner: P2, zone: "banishment" });
    expect(game.p2.banishment()).toEqual([replaced]);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.state("bfA").meta.replacedBattlefieldCardId).toBe(replaced); // 438.5.a — held "as Replaced"
    // report: Brush = (owner P1, controller P1, battlefield row); bfA card = (owner P2, —, P2's banishment)
    expect([slotNamed(game, "Brush")?.owner, slotNamed(game, "Brush")?.controller, game.state(replaced).owner, game.state(replaced).zone]).toEqual([P1, P1, P2, "banishment"]);
  });
});

describe("(c) Master of Shadows does not empower off a Replace", () => {
  test("no 'banish' event happened at all (438.4 — Replacing is not Banishing; 438.5.a — the card is 'Replaced, not Banished') and the acting player was P1 anyway (191.4.a): P2's legend stays un-empowered", async () => {
    const game = await conquerAndBrush();
    expect(count(game, "banish")).toBe(0);
    expect(count(game, "banish|p:player-2")).toBe(0);
    expect(count(game, "empower")).toBe(0);
    expect(game.state("mos").isEmpowered).toBe(false);
    expect(game.chain()).toEqual([]);
    // …and it is not a delayed thing either: still nothing by P2's turn
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("mos").isEmpowered).toBe(false);
  });

  test("(d) yes-side control in the same game: on P2's turn P2 casts Wind and Ghosts on P2's own Shade (2 Might, at bfB) → banished into P2's banishment BY P2 → Master of Shadows empowers — the trigger is live, (c) failed on rules not setup", async () => {
    const game = await conquerAndBrush();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.do("addResources", { energy: 3, power: { chaos: 1 } }); // pools emptied at end of turn
    const offered = (game.p2.option("cast", "wag")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toEqual(expect.arrayContaining(["shade", "raider"])); // units AT a battlefield, either side
    expect(offered).not.toContain("bruiser"); // in base
    await game.p2.cast("wag", { targets: "shade" });
    await game.settle();
    expect(game.zoneOf("shade")).toBe("banishment");
    expect(game.p2.banishment()).toContain("shade");
    expect(count(game, "banish|p:player-2")).toBe(1);
    expect(game.state("mos").isEmpowered).toBe(true);
    expect(game.state("mos").isReady).toBe(true);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });
});

describe("(e) P2 retakes the Brush, scores it, and swaps back", () => {
  /**
   * …P2's turn (P2 first Holds bfB with Shade: +1 in its Beginning Phase): Bruiser (5) attacks the Brush held by
   * Raider (3), wins, conquers (+1) → the Brush asks its controller. Returns P2's points/score-events BEFORE the attack.
   */
  async function retake(): Promise<{ game: Game; pointsBefore: number; scoresBefore: number }> {
    const game = await conquerAndBrush();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    const pointsBefore = game.p2.points();
    const scoresBefore = count(game, "score|p:player-2");
    expect(pointsBefore).toBe(1); // the bfB hold
    await game.p2.move("bruiser", "bfA");
    expect(game.state("bruiser").combatRole).toBe("attacker");
    const r = await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.p2.points()).toBe(pointsBefore + 1);
    expect(r.decision).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "bfA" } }); // "you" = the Brush's controller now, P2
    return { game, pointsBefore, scoresBefore };
  }

  test("the swap-back is offered to P2 (the scorer/controller — not P1 who owns the token); before answering, the Brush is P1-owned but P2-controlled with bfA still in P2's banishment", async () => {
    const { game } = await retake();
    expect(slotNamed(game, "Brush")).toEqual({ controller: P2, id: "bfA", isToken: true, owner: P1, zone: "battlefieldRow" });
    expect(game.p2.banishment().map((id) => game.state(id).name)).toEqual(["bfA"]);
  });

  test("YES → the Brush token stops existing outright (438.7.b / 186.1): no 'Brush' in either trash, either banishment, or anywhere; the bfA card is back in the slot as a non-token owned by P2 (127.1) and controlled by P2 (inherits the current control); P2's banishment is empty", async () => {
    const { game } = await retake();
    await game.p2.yes();
    await game.settle();
    expect(game.has("bfA")).toBe(false); // the token (it had taken over the slot id)
    expect(game.findAll({ name: "Brush" })).toEqual([]);
    expect([...game.p1.trash(), ...game.p2.trash()].map((id) => game.state(id).name)).not.toContain("Brush");
    expect(game.cardsAt("banishment")).toEqual([]);
    expect(game.p2.banishment()).toEqual([]);
    expect(game.p1.banishment()).toEqual([]);
    const back = slotNamed(game, "bfA");
    expect(back).toMatchObject({ controller: P2, isToken: false, owner: P2, zone: "battlefieldRow" });
    expect(game.battlefields()).toHaveLength(2);
    expect(game.locationOf("bruiser")).toBe(back?.id); // units there do not move
  });

  test("no re-score on the swap (470): P2 gained exactly 1 point (the conquer) and one score event from the retake; nothing was banished this turn so Master of Shadows is still not empowered; back to P2's open main phase", async () => {
    const { game, pointsBefore, scoresBefore } = await retake();
    await game.p2.yes();
    await game.settle();
    expect(game.p2.points()).toBe(pointsBefore + 1);
    expect(game.p1.points()).toBe(1);
    expect(count(game, "score|p:player-2")).toBe(scoresBefore + 1);
    expect(count(game, "conquer|p:player-2")).toBe(1);
    expect(count(game, "banish")).toBe(0);
    expect(game.state("mos").isEmpowered).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("the card that comes back is the SAME object that waited in P2's banishment (438.7.b 'the original card is returned') — engine deletes the banished card and mints a fresh 'replaced-…' object in the slot (harness cardConservation violation)", async () => {
    // Expected: the id that sat in P2's banishment is now in the battlefield row and no invariant fires.
    // Actual: that id no longer exists; a new id appears "from nowhere" carrying the bfA definition.
    const { game } = await retake();
    const waiting = game.p2.banishment()[0]!;
    await game.p2.yes();
    await game.settle();
    expect(game.has(waiting)).toBe(true);
    expect(game.zoneOf(waiting)).toBe("battlefieldRow");
    expect(slotNamed(game, "bfA")?.id).toBe(waiting);
    expect(game.violations()).toEqual([]);
  });

  test("NO → the Brush stays (P1-owned token under P2's control) and bfA keeps waiting in P2's banishment", async () => {
    const { game, pointsBefore } = await retake();
    await game.p2.no();
    await game.settle();
    expect(slotNamed(game, "Brush")).toEqual({ controller: P2, id: "bfA", isToken: true, owner: P1, zone: "battlefieldRow" });
    expect(game.p2.banishment().map((id) => game.state(id).name)).toEqual(["bfA"]);
    expect(game.p2.points()).toBe(pointsBefore + 1);
  });
});
