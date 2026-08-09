/**
 * Interaction: Swift Scout (ogn-263-298, legend) "[1], [Exhaust]: Put a Teemo unit you own into your
 *   hand from your Champion Zone or the board."
 *   × Teemo, Scout (ogn-197-298, 2 · 1 Might · [Hidden] · "When you play me, give me +3 [Might] this turn.")
 *
 * Question: when must the activated ability appear in P1's legalActions?
 *   (a) Teemo, Scout in P1's Champion Zone, legend ready, 1+ energy;
 *   (b) Champion Zone empty and P1's only Teemo is HIDDEN face-down at bf1 (P1 controls bf1);
 *   (c) Teemo on the board at bf1 but P1 has 0 energy;
 *   (d) Teemo on board, energy available, but Swift Scout already exhausted;
 *   (e) the only Teemo is in P1's trash or hand;
 *   (f) P1's Teemo is on the board but currently controlled by P2 (stolen).
 *
 * Rules: 402.3 (an activated ability with no legal option is not legal to activate), 403.1.a (the
 * costs before ":" must be payable), 355.8, 355.9.a.1 ("unit" = an object on the Board), 355.9.a.3
 * (a "facedown card" is its own descriptor — a card in a Facedown Zone), 355.9.a.5 ("unit in the
 * Champion Zone" is an explicitly named off-board pool), 107.3.f (facedown cards are private),
 * 811.1.b (Hidden), 108.2 / 127.1 ("you own" ≠ "you control").
 *
 * Expected: (a) LISTED — moves Teemo CZ → hand on resolution, P2 gets priority in between.
 * (b) NOT listed — a facedown card is neither a unit on the board nor in the Champion Zone; the
 * engine must not offer the ability then dead-end, nor let P1 fish the hidden card back this way.
 * (c) NOT listed — [1] unpayable. (d) NOT listed — [Exhaust] unpayable. (e) NOT listed — trash /
 * hand are not among the named zones. (f) LISTED — ownership, not control; the stolen Teemo returns
 * to P1's hand.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SWIFT_SCOUT = "ogn-263-298";
const TEEMO_SCOUT = "ogn-197-298";
const ABILITY = 1; // index 0 is the hide-cost static; the [1],[Exhaust] ability is #1

/** Is `activateAbility:scout#1` in P1's menu right now? */
function listed(game: Game): boolean {
  return game.p1.legal().some((o) => o.key === `activateAbility:scout#${ABILITY}`);
}

/** The card ids the activation offers as its object (empty when not listed / no target field). */
function offered(game: Game): string[] {
  const field = game.p1.option(`activateAbility:scout#${ABILITY}`)?.fields.find((f) => f.arg === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].toSorted();
}

/** P1's open turn, Swift Scout ready, bf1 P1's (with a non-Teemo holder), `energy` in the pool. */
function base(energy = 1) {
  return scenario()
    .resources(P1, { energy })
    .legend(P1, SWIFT_SCOUT, "scout")
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
    .unit(P2, "base", { might: 2, name: "Enemy Grunt" }, "grunt");
}

describe("Swift Scout's [1],[Exhaust] — when is it in legalActions? (facedown Teemo & friends)", () => {
  test("(a) Teemo, Scout in the CHAMPION ZONE, legend ready, 1 energy → LISTED, and the champion-zone Teemo is the object offered (355.9.a.5)", async () => {
    const game = await base(1).champion(P1, TEEMO_SCOUT, "teemo").build();
    expect(game.zoneOf("teemo")).toBe("championZone");
    expect(listed(game)).toBe(true);
    expect(game.p1.can("activate", "scout")).toBe(true);
    expect(offered(game)).toEqual(["teemo"]); // never the non-Teemo holder, never P2's grunt
  });

  test("(a) activating it: pays exactly [1], exhausts the legend, is a chain item P2 may respond to, and on resolution Teemo moves Champion Zone → P1's hand", async () => {
    const game = await base(2).champion(P1, TEEMO_SCOUT, "teemo").build();
    await game.p1.activate("scout", ABILITY);
    expect(game.p1.energy()).toBe(1);
    expect(game.state("scout").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "scout", controller: P1, triggered: false })]);
    expect(game.zoneOf("teemo")).toBe("championZone"); // not yet
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2); // the opponent gets priority before it resolves
    await game.p2.passPriority();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("teemo");
    }
    await game.settle();
    expect(game.zoneOf("teemo")).toBe("hand");
    expect(game.p1.hand()).toContain("teemo");
    expect(game.p1.champion()).toBeUndefined();
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(b) Champion Zone empty, the ONLY Teemo is face-down at bf1 → NOT listed: a facedown card is not a 'unit on the board' (355.9.a.1 / 355.9.a.3 / 107.3.f)", async () => {
    const game = await base(3).facedown(P1, "bf1", TEEMO_SCOUT, "teemo").build();
    expect(game.zoneOf("teemo")).toBe("facedown-bf1");
    expect(game.state("teemo").isHidden).toBe(true);
    expect(game.p1.champion()).toBeUndefined();
    expect(listed(game)).toBe(false);
    expect(game.p1.can("activate", "scout")).toBe(false);
    expect(offered(game)).not.toContain("teemo");
  });

  test("(b) …and forcing it is rejected without side effects: energy kept, legend still ready, Teemo still hidden at bf1, no chain / no dead-end prompt", async () => {
    const game = await base(3).facedown(P1, "bf1", TEEMO_SCOUT, "teemo").build();
    const r = await game.p1.try((p) => p.activate("scout", ABILITY));
    expect(r.ok).toBe(false);
    const withTarget = await game.p1.try((p) => p.activate("scout", ABILITY, { targets: "teemo" }));
    expect(withTarget.ok).toBe(false);
    expect(game.p1.energy()).toBe(3);
    expect(game.state("scout").isReady).toBe(true);
    expect(game.zoneOf("teemo")).toBe("facedown-bf1");
    expect(game.p1.hand()).not.toContain("teemo");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(b) contrast: the same board WITH a champion-zone Teemo is listed, but the facedown copy is still not among the objects — only the CZ one is", async () => {
    const game = await base(1).facedown(P1, "bf1", TEEMO_SCOUT, "hiddenTeemo").champion(P1, TEEMO_SCOUT, "czTeemo").build();
    expect(listed(game)).toBe(true);
    expect(offered(game)).toEqual(["czTeemo"]); // the facedown copy is not an object
    expect((await game.p1.try((p) => p.activate("scout", ABILITY, { targets: "hiddenTeemo" }))).ok).toBe(false);
    expect(game.zoneOf("hiddenTeemo")).toBe("facedown-bf1");
  });

  test("(c) Teemo on the board at bf1 but 0 energy (power does not pay [1]) → NOT listed (403.1.a)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 0, power: { chaos: 2 } })
      .legend(P1, SWIFT_SCOUT, "scout")
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", TEEMO_SCOUT, "teemo")
      .build();
    expect(listed(game)).toBe(false);
    expect(game.p1.can("activate", "scout")).toBe(false);
    expect((await game.p1.try((p) => p.activate("scout", ABILITY))).ok).toBe(false);
    expect(game.zoneOf("teemo")).toBe("battlefield-bf1");
    // control: the very same board with 1 energy lists it
    const funded = await scenario().resources(P1, { energy: 1 }).legend(P1, SWIFT_SCOUT, "scout").battlefield("bf1", { controller: P1 }).unit(P1, "bf1", TEEMO_SCOUT, "teemo").build();
    expect(listed(funded)).toBe(true);
  });

  test("(d) Teemo on board, energy available, but Swift Scout already EXHAUSTED → NOT listed ([Exhaust] cost unpayable)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .card("scout", { def: SWIFT_SCOUT, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", TEEMO_SCOUT, "teemo")
      .build();
    expect(game.state("scout").isExhausted).toBe(true);
    expect(listed(game)).toBe(false);
    expect(game.p1.can("activate", "scout")).toBe(false);
    expect((await game.p1.try((p) => p.activate("scout", ABILITY))).ok).toBe(false);
    expect(game.p1.energy()).toBe(3);
  });

  test("(e) the only Teemo is in P1's TRASH → NOT listed (trash is neither the board nor the Champion Zone)", async () => {
    const game = await base(3).trash(P1, TEEMO_SCOUT, "teemo").build();
    expect(game.zoneOf("teemo")).toBe("trash");
    expect(listed(game)).toBe(false);
    expect(game.p1.can("activate", "scout")).toBe(false);
    expect((await game.p1.try((p) => p.activate("scout", ABILITY, { targets: "teemo" }))).ok).toBe(false);
    expect(game.zoneOf("teemo")).toBe("trash");
  });

  test("(e) the only Teemo is in P1's HAND → NOT listed (already in hand; hand is not a named zone)", async () => {
    const game = await base(3).hand(P1, TEEMO_SCOUT, "teemo").build();
    expect(game.zoneOf("teemo")).toBe("hand");
    expect(listed(game)).toBe(false);
    expect(game.p1.can("activate", "scout")).toBe(false);
    expect(game.p1.energy()).toBe(3);
    expect(game.state("scout").isReady).toBe(true);
  });

  test("(f) P1 OWNS a Teemo on the board that P2 currently CONTROLS (stolen, at P2's battlefield) → LISTED: 'you own', not 'you control' (108.2 / 127.1); it is the object offered", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .legend(P1, SWIFT_SCOUT, "scout")
      .battlefield("bf1", { controller: P2 })
      .card("teemo", { controller: P2, def: TEEMO_SCOUT, owner: P1, zone: "bf1" })
      .unit(P2, "bf1", { might: 2, name: "Enemy Grunt" }, "grunt")
      .build();
    expect(game.state("teemo")).toMatchObject({ controller: P2, owner: P1, zone: "battlefield-bf1" });
    expect(game.p2.units("bf1")).toContain("teemo"); // it really is P2's unit right now
    expect(listed(game)).toBe(true);
    expect(offered(game)).toEqual(["teemo"]); // P2's own grunt is not a Teemo
  });

  test("(f) anti-theft: P1 pays [1], exhausts Swift Scout, P2 may respond, and the stolen Teemo goes to its OWNER's (P1's) hand — P2 loses the unit and gets nothing", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .legend(P1, SWIFT_SCOUT, "scout")
      .battlefield("bf1", { controller: P2 })
      .card("teemo", { controller: P2, def: TEEMO_SCOUT, owner: P1, zone: "bf1" })
      .unit(P2, "bf1", { might: 2, name: "Enemy Grunt" }, "grunt")
      .build();
    const p2Hand = game.p2.hand().length;
    await game.p1.activate("scout", ABILITY);
    expect(game.p1.energy()).toBe(0);
    expect(game.state("scout").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "scout", controller: P1 })]);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.passPriority();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("teemo");
    }
    await game.settle();
    expect(game.zoneOf("teemo")).toBe("hand");
    expect(game.p1.hand()).toContain("teemo");
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.p2.units("bf1")).toEqual(["grunt"]);
    expect(game.state("teemo")).toMatchObject({ owner: P1, zone: "hand" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2); // grunt still holds it
    expect(game.violations()).toEqual([]);
  });
});
