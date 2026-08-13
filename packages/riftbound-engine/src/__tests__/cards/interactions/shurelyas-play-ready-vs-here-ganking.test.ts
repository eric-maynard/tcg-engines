/**
 * Interaction: Shurelya's Requiem (sfd-192-221) · Equipment · Calm/Mind · 4 + [C][C] · +2 Might
 *     Rules Text:  "[Unique] · [Equip] [rainbow] · When you play this, ready your units."
 *     Effect Text: "Your units here have [Ganking]."
 *   × Vanguard Sergeant (ogn-219-298) · Unit · Order · 4 · 4 Might (vanilla) — A exhausted at P1's bf1, B exhausted in base
 *
 * Rules: 723 (Rules Text is never Inactive by default) vs 724 / 136.2.b (Effect Text is Inactive unless Attached);
 * 718.2 (attached → own printed Rules Text Inactive), 718.3 / 719.1 (Effect Text appended to the Top-Most card),
 * 718.4 (Might bonus), 718.5.c / 719.3.a (attachments travel with the Top-Most card), 719.4 (ready/exhausted states
 * are independent), 434.4 / 434.4.a (attaching sets location = bearer's; NOT a Move), 434.5 (attaching changes no
 * other state), 719.5 + 435.4.b (bearer board → trash: detach at its last location), 435.1.c (detached: Effect Text
 * Inactive, Rules Text active again), 435.4.a / 457.1 (loose gear at a battlefield is Recalled next Cleanup — a
 * Recall, not a play), 144.4.b / 144.4.c.1 / 810.1.b–c (bf → bf needs Ganking; Ganking only ADDS to the Standard Move).
 *
 * Question / expected:
 *  (a) Played from hand it enters base unattached; "When you play this, ready your units" is Rules Text → fires: A, B ready.
 *  (b) Unattached: the Ganking line is Effect Text → Inactive: neither A nor B has Ganking; A cannot go bf1 → bf2.
 *  (c) Equip to A at bf1: Requiem's location = bf1, attached, not a Move, nobody's ready state changes; A = 6; "here" =
 *      bf1 → A (and any P1 unit at bf1) has Ganking, B in base does not. A standard-moves bf1 → bf2: legal; A exhausted,
 *      Requiem rides along still READY; now "here" = bf2 — a P1 unit left at bf1 loses Ganking.
 *  (d) Equipped to B in base instead: "here" = base → A at bf1 has no Ganking → bf1 → bf2 illegal.
 *  (e) A (wearing it) dies at bf2: Requiem detaches at bf2, Effect Text off / Rules Text on → nobody has Ganking; it is
 *      Recalled to P1's base unattached and ready; "When you play this" does NOT fire again; [Equip] is usable again.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SHURELYAS = "sfd-192-221";
const SERGEANT = "ogn-219-298";

/**
 * P1's turn. bf1 = P1's with EXHAUSTED Sergeant A + ready 1-Might Squire C; EXHAUSTED Sergeant B in base; bf2 = P2's
 * (empty, or guarded by a `guard`-Might Wall). P1: Requiem in hand, 4 energy + calm 2 + mind 1 (play + one Equip)
 * + `sparePips` extra mind.
 */
function board(opts: { guard?: number; sparePips?: number } = {}) {
  const s = scenario()
    .resources(P1, { energy: 4, power: { calm: 2, mind: 1 + (opts.sparePips ?? 0) } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", SERGEANT, "A", { exhausted: true })
    .unit(P1, "bf1", { might: 1, name: "Squire C" }, "C")
    .unit(P1, "base", SERGEANT, "B", { exhausted: true })
    .hand(P1, SHURELYAS, "sr");
  if (opts.guard !== undefined) {
    s.unit(P2, "bf2", { might: opts.guard, name: "Wall" }, "wall");
  }
  return s;
}

const hasGanking = (game: Game, unit: string) => game.state(unit).keywords.includes("Ganking");

const equipPairs = (game: Game) =>
  game.p1
    .legal()
    .filter((o) => o.moveId === "equipCard")
    .flatMap((o) => o.variants.map((v) => `${String(v.params.equipmentId)}->${String(v.params.unitId)}`))
    .sort();

/** (a) play the Requiem from hand and let its play trigger resolve. */
async function played(opts: Parameters<typeof board>[0] = {}): Promise<Game> {
  const game = await board(opts).build();
  await game.p1.play("sr");
  await game.settle();
  return game;
}

/** (c)/(d) …then pay [rainbow] to Equip it onto `unit` and let that resolve. */
async function equippedTo(unit: "A" | "B", opts: Parameters<typeof board>[0] = {}): Promise<Game> {
  const game = await played(opts);
  await game.p1.choose("equipCard:-", { params: { equipmentId: "sr", unitId: unit } });
  await game.settle();
  expect(game.state("sr").attachedTo).toBe(unit);
  return game;
}

describe("(a) played from hand, unattached: the Rules-Text play trigger fires anyway (723)", () => {
  test("it enters P1's base unattached and READY; a triggered 'ready your units' item goes on the chain; on resolution A (bf1) and B (base) are both ready", async () => {
    const game = await board().build();
    await game.p1.play("sr");
    expect(game.zoneOf("sr")).toBe("base");
    expect(game.state("sr")).toMatchObject({ attachedTo: undefined, isReady: true });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sr", controller: P1, triggered: true })]);
    expect(game.state("A").isExhausted).toBe(true); // not yet
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("A")).toMatchObject({ isReady: true, zone: "battlefield-bf1" });
    expect(game.state("B")).toMatchObject({ isReady: true, zone: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, mind: 1 } });
  });
});

describe("(b) before any Equip the Effect Text is Inactive (724): nobody has Ganking, A cannot go bf1 → bf2", () => {
  test("A and C at bf1 do not list Ganking — the loose Requiem in base grants them nothing", async () => {
    const game = await played();
    expect(hasGanking(game, "A")).toBe(false);
    expect(hasGanking(game, "C")).toBe(false);
  });

  // Expected (724 / 136.2.b): an UNATTACHED Equipment's Effect Text is Inactive, so "Your units here have
  // [Ganking]" grants nothing to anyone while the Requiem lies loose in base. Actual: the engine evaluates the
  // aura off the loose gear with "here" = P1's base, so B (in base) shows a static Ganking grant.
  test("unattached Requiem in base must not give B (a base unit) Ganking — Effect Text is Inactive unless Attached (724)", async () => {
    const game = await played();
    expect(game.state("sr").attachedTo).toBeUndefined();
    expect(hasGanking(game, "B")).toBe(false);
    expect(game.state("B").grantedKeywords).toEqual([]);
  });

  test("A (ready at bf1) may move bf1 → base (144.4.b) but bf1 → bf2 is not offered and is refused (144.4.c.1)", async () => {
    const game = await played();
    expect(game.p1.can("gank", "A")).toBe(false);
    expect((await game.p1.try((p) => p.gank("A", "bf2"))).ok).toBe(false);
    expect((await game.p1.try((p) => p.move("A", "bf2"))).ok).toBe(false);
    expect(game.locationOf("A")).toBe("bf1");
    await game.p1.move("A", "base");
    expect(game.locationOf("A")).toBe("base");
  });
});

describe("(c) Equip [rainbow] onto A at bf1: location follows A, not a Move, no state change; 'here' = A's battlefield", () => {
  test("the Equip costs exactly one more pip; the Requiem is now AT bf1 attached to A; A stays ready, the Requiem stays ready (434.4 / 434.5); A = 4 + 2 = 6 (718.4)", async () => {
    const game = await equippedTo("A");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, mind: 0 } });
    expect(game.locationOf("sr")).toBe("bf1");
    expect(game.state("sr")).toMatchObject({ attachedTo: "A", isReady: true });
    expect(game.state("A")).toMatchObject({ attachments: ["sr"], isReady: true, might: 6, zone: "battlefield-bf1" });
    expect(game.chain()).toEqual([]);
  });

  test("attaching was NOT a Move (434.4.a): no move was counted for P1 and bf2/bf1 control is untouched", async () => {
    const game = await equippedTo("A");
    expect(game.gameState.unitsMovedThisTurn?.[P1] ?? 0).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf1?.contested ?? false).toBe(false);
  });

  test("'Your units here have Ganking' is live through A: A has Ganking, C (P1's other unit at bf1) has Ganking, B in base does NOT", async () => {
    const game = await equippedTo("A");
    expect(hasGanking(game, "A")).toBe(true);
    expect(hasGanking(game, "C")).toBe(true);
    expect(hasGanking(game, "B")).toBe(false);
  });

  test("worn: the Requiem's own printed Rules Text is Inactive (718.2) — no further [Equip] is offered even with a spare pip", async () => {
    const game = await equippedTo("A", { sparePips: 1 });
    expect(game.p1.power("mind")).toBe(1);
    expect(equipPairs(game)).toEqual([]);
  });

  test("A standard-moves bf1 → bf2 via Ganking: legal; A is exhausted by the move, the Requiem rides along to bf2 (719.3.a) and is NOT exhausted (719.4); empty bf2 is conquered", async () => {
    const game = await equippedTo("A");
    expect(game.p1.can("gank", "A")).toBe(true);
    await game.p1.gank("A", "bf2");
    await game.settle();
    expect(game.locationOf("A")).toBe("bf2");
    expect(game.state("A")).toMatchObject({ attachments: ["sr"], isExhausted: true, might: 6 });
    expect(game.locationOf("sr")).toBe("bf2");
    expect(game.state("sr")).toMatchObject({ attachedTo: "A", isReady: true });
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("after the move 'here' = bf2: A (at bf2) still has Ganking, C left behind at bf1 no longer does, B in base still does not", async () => {
    const game = await equippedTo("A");
    await game.p1.gank("A", "bf2");
    await game.settle();
    expect(hasGanking(game, "A")).toBe(true);
    expect(hasGanking(game, "C")).toBe(false);
    expect(hasGanking(game, "B")).toBe(false);
    expect(game.p1.can("gank", "C")).toBe(false);
  });
});

describe("(d) NO side — Equipped to B in base: 'here' = P1's base, which gives A at bf1 nothing", () => {
  test("the Requiem sits in base on B (B = 6); A and C at bf1 have NO Ganking; A cannot move bf1 → bf2", async () => {
    const game = await equippedTo("B");
    expect(game.locationOf("sr")).toBe("base");
    expect(game.state("B")).toMatchObject({ attachments: ["sr"], might: 6, zone: "base" });
    expect(hasGanking(game, "A")).toBe(false);
    expect(hasGanking(game, "C")).toBe(false);
    expect(game.p1.can("gank", "A")).toBe(false);
    expect((await game.p1.try((p) => p.gank("A", "bf2"))).ok).toBe(false);
    expect(game.locationOf("A")).toBe("bf1");
  });

  test("B nominally 'has Ganking' in base but that adds nothing new (810.1.c): B's legal moves are still just base → a battlefield, and A may still only retreat bf1 → base", async () => {
    const game = await equippedTo("B");
    expect((await game.p1.try((p) => p.gank("A", "bf2"))).ok).toBe(false);
    await game.p1.move("A", "base"); // the retreat is always allowed
    expect(game.locationOf("A")).toBe("base");
    await game.p1.move("B", "bf1"); // base → own battlefield: the ordinary Standard Move; the Requiem rides along
    expect(game.locationOf("B")).toBe("bf1");
    expect(game.locationOf("sr")).toBe("bf1");
    expect(game.state("sr")).toMatchObject({ attachedTo: "B", isReady: true });
  });
});

describe("(e) A, wearing it, dies in combat at bf2: detach at bf2 → recalled to base; texts flip back; no re-trigger", () => {
  /** Play → (B moves base → bf1 to be EXHAUSTED again as a re-trigger detector) → Equip A → A ganks into a 7-Might Wall at bf2 and dies. */
  async function aDiesAtBf2(): Promise<Game> {
    const game = await played({ guard: 7, sparePips: 1 });
    await game.p1.move("B", "bf1"); // own battlefield: no showdown; B is now exhausted at bf1
    await game.settle();
    expect(game.state("B")).toMatchObject({ isExhausted: true, zone: "battlefield-bf1" });
    await game.p1.choose("equipCard:-", { params: { equipmentId: "sr", unitId: "A" } });
    await game.settle();
    expect(game.state("A")).toMatchObject({ attachments: ["sr"], might: 6 });
    await game.p1.gank("A", "bf2");
    await game.settle(); // showdown passes out; 6 into the 7-Might Wall (lives), 7 into A (dies)
    return game;
  }

  test("A goes board → P1's trash; the Wall survives (took 6 < 7, healed) and P2 keeps bf2", async () => {
    const game = await aDiesAtBf2();
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.p1.trash()).toContain("A");
    expect(game.state("wall")).toMatchObject({ damage: 0, zone: "battlefield-bf2" });
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test("the Requiem is NOT trashed with A: it detached (719.5 / 435.4.b) and, as loose gear at a battlefield, was Recalled to P1's BASE in the Cleanup (435.4.a / 457.1) — unattached, still ready, P1's", async () => {
    const game = await aDiesAtBf2();
    expect(game.p1.trash()).not.toContain("sr");
    expect(game.zoneOf("sr")).toBe("base");
    expect(game.state("sr")).toMatchObject({ attachedTo: undefined, controller: P1, isReady: true, location: "base", owner: P1 });
    expect(game.p1.gear()).toEqual(["sr"]);
    expect(game.cardsAt("battlefield-bf2")).toEqual(["wall"]);
  });

  test("Effect Text is Inactive again (435.1.c): nobody — B and C at bf1, the Wall — has Ganking any more", async () => {
    const game = await aDiesAtBf2();
    expect(hasGanking(game, "B")).toBe(false);
    expect(hasGanking(game, "C")).toBe(false);
    expect(hasGanking(game, "wall")).toBe(false);
    expect(game.p1.can("gank", "C")).toBe(false);
  });

  test("the Recall is not a play: 'When you play this, ready your units' does NOT fire again — chain empty, B (exhausted at bf1) stays exhausted, cards-played count unchanged at 1", async () => {
    const game = await aDiesAtBf2();
    expect(game.chain()).toEqual([]);
    expect(game.state("B").isExhausted).toBe(true);
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(1); // only the original play of the Requiem
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("its printed Rules Text is active again (435.1.c): with the spare pip [Equip] is offered anew onto P1's remaining units (B, C)", async () => {
    const game = await aDiesAtBf2();
    expect(game.p1.power("mind")).toBe(1);
    expect(equipPairs(game)).toEqual(["sr->B", "sr->C"]);
  });
});
