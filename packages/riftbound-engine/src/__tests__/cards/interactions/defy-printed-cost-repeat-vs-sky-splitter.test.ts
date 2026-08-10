/**
 * Interaction: Defy (ogn-045-298) · Spell · Calm · 1+[calm] · "[Reaction] Counter a spell that costs no
 *     more than [4] and no more than [rainbow]."
 *   × Rocket Barrage (sfd-077-221) · Spell · Mind · 4+[mind] · "[Repeat] [4][mind] … Choose one — Deal 4
 *     to a unit in a base. Kill a gear."
 *   × Sky Splitter (ogn-014-298) · Spell · Fury · 8+[fury] · "[Action] This spell's Energy cost is
 *     reduced by the highest Might among units you control. Deal 5 to a unit at a battlefield."
 *   (contrast: Wind Wall ogn-064-298 · 3+[calm][calm] · "[Reaction] Counter a spell.")
 *
 * Rules: 206 (a cost filter reads the PRINTED cost — the CR's own example is Defy vs a Repeat-paid
 * Rocket Barrage), 356.1.c / 820.1.d / 820.3 (Repeat is an ADDITIONAL cost on the same chain item; the
 * item executes its instructions an extra time on resolution — it is not a second spell), 425.1.a /
 * 425.1.a.1 / 425.1.c / 425.1.c.1 (a countered spell resolves none of its effects, goes to trash, costs are
 * not refunded), 355.8 / 355.9.b (a spell with no legal target cannot be played at all), 340.1 (LIFO),
 * 419.4.b (cost reductions change what is PAID, not the card's cost).
 *
 * Q/Expected:
 *  (a) P1 plays Rocket Barrage paying Repeat (8 energy + 2 mind total): exec#1 "Deal 4" at P2's base unit
 *      V, exec#2 "Kill a gear" at P2's gear G. P2 CAN Defy it (printed 4 / one pip). Defy resolves first
 *      and counters the ONE chain item — neither execution happens (V undamaged, G survives); Barrage →
 *      P1's trash; nothing refunded; it still counts as a card P1 played this turn.
 *  (b) P1 (controlling a 7-Might unit) plays Sky Splitter for 1+[fury]. P2 can NOT Defy it — printed
 *      energy cost 8 > 4 — Defy is not even castable; P2 keeps its resources; Sky Splitter deals 5.
 *  (c) Wind Wall (two [calm] pips > [rainbow]) is never a legal Defy target.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const ROCKET_BARRAGE = "sfd-077-221";
const SKY_SPLITTER = "ogn-014-298";
const WIND_WALL = "ogn-064-298";

/** Inline 1-cost pip-less action spell "draw 1" — something cheap for Wind Wall to counter in (c). */
const PING = { abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }], cardType: "spell", energyCost: 1, name: "Ping", timing: "action" };

/** Card ids offered for the `targets` field of `seat`'s cast option for `alias` (empty when not castable). */
function targetsOffered(game: Game, seat: "p1" | "p2", alias: string): string[] {
  const field = game[seat].option("cast", alias)?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : v === null ? [] : [v]) as string[]))];
}

/** (a) P1: exactly 8 energy + 2 mind (base + Repeat). P2: exactly Defy's 1 + [calm], a 5-Might unit V and a gear G in base. */
function barrageBoard() {
  return scenario()
    .resources(P1, { energy: 8, power: { mind: 2 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: null })
    .unit(P2, "base", { might: 5, name: "Victim" }, "victim")
    .gear(P2, { cardType: "gear", name: "Gadget" }, "gadget")
    .hand(P1, ROCKET_BARRAGE, "barrage")
    .hand(P2, DEFY, "defy");
}

/** (b) P1: a 7-Might unit in base and exactly 1 energy + [fury]. P2: Defy's 1 + [calm] and a 6-Might unit at bf1. */
function skySplitterBoard() {
  return scenario()
    .resources(P1, { energy: 1, power: { fury: 1 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 7, name: "Giant" }, "giant")
    .unit(P2, "bf1", { might: 6, name: "Target" }, "target")
    .hand(P1, SKY_SPLITTER, "sky")
    .hand(P2, DEFY, "defy");
}

/** P1 casts Barrage with Repeat paid: exec#1 mode 0 (Deal 4) at V, exec#2 mode 1 (Kill a gear) at G; P1 then passes priority to P2. */
async function castRepeatedBarrage(game: Game): Promise<void> {
  await game.p1.cast("barrage", { modes: [0, 1], repeat: 1, targets: ["victim", "gadget"] });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
}

describe("Defy reads PRINTED cost — Repeat-paid Rocket Barrage yes, discounted Sky Splitter no", () => {
  // ── (a) Rocket Barrage with Repeat ───────────────────────────────────────────────────────────

  test("(a) paying Repeat drains all 8 energy + 2 mind for ONE chain item naming both objects (356.1.c / 820.1.d)", async () => {
    const game = await barrageBoard().build();
    await game.p1.cast("barrage", { modes: [0, 1], repeat: 1, targets: ["victim", "gadget"] });
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("mind")).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "barrage", controller: P1, targets: ["victim", "gadget"], triggered: false })]);
    expect(game.chain()).toHaveLength(1);
  });

  test("(a) P2 CAN Defy it: the Repeat-paid Barrage (printed 4 + one pip) is offered as Defy's target and the cast is accepted — Defy sits on top of the chain (206, 340.1)", async () => {
    const game = await barrageBoard().build();
    await castRepeatedBarrage(game);
    expect(game.p2.can("cast", "defy")).toBe(true);
    expect(targetsOffered(game, "p2", "defy")).toEqual(["barrage"]);
    await game.p2.cast("defy", { targets: "barrage" });
    expect(game.p2.energy()).toBe(0);
    expect(game.p2.power("calm")).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["barrage", "defy"]);
  });

  test("(a) Defy resolves first and counters the single item: NEITHER execution happens — V takes no damage, G survives; Barrage → P1's trash, Defy → P2's trash (425.1.a / 820.3)", async () => {
    const game = await barrageBoard().build();
    await castRepeatedBarrage(game);
    await game.p2.cast("defy", { targets: "barrage" });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.state("victim").damage).toBe(0);
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.zoneOf("gadget")).toBe("base");
    expect(game.zoneOf("barrage")).toBe("trash");
    expect(game.p1.trash()).toContain("barrage");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.p2.trash()).toContain("defy");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(a) nothing is refunded — base cost AND the Repeat additional cost stay paid (425.1.c.1); the countered Barrage still counts as a card P1 played this turn", async () => {
    const game = await barrageBoard().build();
    await castRepeatedBarrage(game);
    await game.p2.cast("defy", { targets: "barrage" });
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power()).toBe(0);
    expect(game.p2.energy()).toBe(0);
    expect(game.p2.power()).toBe(0);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(game.gameState.cardsPlayedThisTurn?.[P2]).toBe(1);
  });

  test("(a) control: un-Defied, the repeated Barrage performs BOTH executions — 4 damage to V and G killed", async () => {
    const game = await barrageBoard().build();
    await castRepeatedBarrage(game);
    await game.settle();
    expect(game.state("victim").damage).toBe(4);
    expect(game.zoneOf("gadget")).toBe("trash");
    expect(game.zoneOf("barrage")).toBe("trash");
  });

  // ── (b) Sky Splitter, discounted to 1 ────────────────────────────────────────────────────────

  test("(b) with a 7-Might unit P1 casts Sky Splitter for exactly 1 energy + [fury]; the card's cost still READS 8 (419.4.b)", async () => {
    const game = await skySplitterBoard().build();
    expect(game.state("sky").energyCost).toBe(8);
    expect(game.p1.can("cast", "sky")).toBe(true);
    await game.p1.cast("sky", { targets: "target" });
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("fury")).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sky", controller: P1, targets: ["target"] })]);
  });

  test("(b) P2 can NOT Defy it: printed energy 8 > 4 → no legal target → Defy is not castable at all, a forced cast is rejected and P2 keeps its 1 + [calm] (206, 355.8)", async () => {
    const game = await skySplitterBoard().build();
    await game.p1.cast("sky", { targets: "target" });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "defy")).toBe(false);
    expect(targetsOffered(game, "p2", "defy")).toEqual([]);
    await expect(game.p2.cast("defy", { targets: "sky" })).rejects.toThrow();
    expect(game.zoneOf("defy")).toBe("hand");
    expect(game.p2.energy()).toBe(1);
    expect(game.p2.power("calm")).toBe(1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["sky"]);
  });

  test("(b) Sky Splitter then resolves normally: 5 damage to the 6-Might target (survives), spell to trash", async () => {
    const game = await skySplitterBoard().build();
    await game.p1.cast("sky", { targets: "target" });
    await game.settle();
    expect(game.state("target").damage).toBe(5);
    expect(game.zoneOf("target")).toBe("battlefield-bf1");
    expect(game.zoneOf("sky")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  // ── (c) Wind Wall: two pips > [rainbow] ──────────────────────────────────────────────────────

  test("(c) Wind Wall (3 + [calm][calm]) on the chain is NOT a legal Defy target — Defy is offered only the pip-less 1-cost Ping beneath it; forcing Wind Wall is rejected", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { calm: 1 } })
      .resources(P2, { energy: 3, power: { calm: 2 } })
      .battlefield("bf1", { controller: P2 })
      .hand(P1, PING, "ping")
      .hand(P1, DEFY, "defy")
      .hand(P2, WIND_WALL, "windWall")
      .build();
    await game.p1.cast("ping");
    await game.p1.passPriority();
    await game.p2.cast("windWall", { targets: "ping" });
    expect(game.p2.energy()).toBe(0);
    expect(game.p2.power("calm")).toBe(0);
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ping", "windWall"]);
    expect(targetsOffered(game, "p1", "defy")).toEqual(["ping"]);
    await expect(game.p1.cast("defy", { targets: "windWall" })).rejects.toThrow();
    expect(game.zoneOf("defy")).toBe("hand");
    expect(game.p1.energy()).toBe(1);
    // And Wind Wall does its job: Ping is countered (no draw), both spells to trash.
    const hand = game.p1.hand().length;
    await game.settle();
    expect(game.zoneOf("ping")).toBe("trash");
    expect(game.zoneOf("windWall")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand); // Defy still there, nothing drawn
  });
});
