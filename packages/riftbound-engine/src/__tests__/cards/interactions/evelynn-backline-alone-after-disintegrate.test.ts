/**
 * Interaction: Evelynn, Entrancing (unl-141-219) · Champion Unit · Chaos · 2 · 2 Might
 *     "[Hidden] [Backline] (I must be assigned combat damage last.) When you play me from face down…"
 *   × Disintegrate (ogn-005-298) · Spell · Fury · 4 · Action
 *     "Deal 3 to a unit at a battlefield. If this kills it, do this: draw 1."
 *   × Shipyard Skulker (ogn-175-298) · Unit · 3 Might (vanilla)
 *   (+ Vanguard Sergeant ogn-219-298 · 4 Might vanilla attacker.)
 *
 * Question: is Backline's protection evaluated at assignment time, and what happens when the Backline
 * unit is the ONLY defender left? P2 defends bf1 with Skulker (3) + face-up Evelynn (2, Backline); P1
 * attacks with Vanguard Sergeant (4).
 *   (a) No spells: forced assignment, marks, deaths, who holds?
 *   (b) During the showdown P1 (Focus) resolves Disintegrate on the Skulker (dies, P1 draws 1); at the
 *       damage step Evelynn is alone — must P1 assign exactly-lethal 2 or all 4? Result?
 *
 * Rules: 826.3 / 826.4.b (Backline: invalid recipient until every OTHER same-controller non-Backline
 * unit has lethal assigned), 826.6, 465.2 / 465.2.c.3 / 465.2.c.4 (lethal in full before moving on; no
 * over-assignment "unless no further units remain"), 465.2.c.6, 319 (Cleanup after Disintegrate
 * resolves kills the Skulker mid-showdown), 466.1.a (Combat Cleanup kills + heals), 466.3.a (sole side
 * remaining wins), 466.5 (winner attacking establishes control → conquer).
 *
 * Expected: (a) 4 vs 3+2. Forced {Skulker 3, Evelynn 1}: Skulker dies, Evelynn survives (healed to 0),
 * Sergeant takes 5 ≥ 4 and dies; P2 keeps bf1, no points. (b) Skulker dies to Disintegrate before 465;
 * Backline is checked when damage is actually assigned, and with no other P2 unit it imposes nothing —
 * all 4 goes on Evelynn (forced, no prompt). Evelynn dies; the defenders now deal only 2 < 4, Sergeant
 * survives healed, P1 conquers bf1 (+1 point).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EVELYNN = "unl-141-219";
const DISINTEGRATE = "ogn-005-298";
const SKULKER = "ogn-175-298";
const SERGEANT = "ogn-219-298";

/** P1's turn: ready Sergeant in base with Disintegrate's [4]; P2 holds bf1 with Skulker + face-up Evelynn. */
function board() {
  return scenario()
    .resources(P1, { energy: 4 })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", SERGEANT, "sarge")
    .unit(P2, "bf1", SKULKER, "skulker")
    .unit(P2, "bf1", EVELYNN, "eve")
    .hand(P1, DISINTEGRATE, "dis");
}

/** Sergeant attacks bf1; P1 (Focus) casts Disintegrate on the Skulker and the whole chain (spell + its draw) resolves. */
async function skulkerDisintegrated(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("sarge", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("dis", { targets: "skulker" });
  for (let i = 0; i < 8 && game.decision()?.kind === "action" && (game.decision() as { context?: string }).context === "chain"; i++) {
    await game.acting().passPriority();
  }
  expect(game.chain()).toEqual([]);
  return game;
}

describe("setup", () => {
  test("Evelynn face-up at bf1 is a 2-Might unit with Backline; Skulker 3; Sergeant 4", async () => {
    const game = await board().build();
    expect(game.state("eve")).toMatchObject({ isHidden: false, might: 2, zone: "battlefield-bf1" });
    expect(game.state("eve").keywords).toContain("Backline");
    expect(game.state("skulker").might).toBe(3);
    expect(game.state("sarge").might).toBe(4);
  });
});

describe("(a) no spells — Backline forces {Skulker 3, Evelynn 1}", () => {
  test("P1 is never asked to distribute: Evelynn is an invalid recipient until Skulker has lethal 3, then the last 1 has nowhere else to go (826.4.b, 465.2.c.3/.4) — the combat runs straight through", async () => {
    const game = await board().build();
    await game.p1.move("sarge", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.decision()?.kind).not.toBe("distribute");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("marks: Evelynn was dealt exactly 1 combat damage (not 2, not 0) — i.e. Skulker took exactly its lethal 3", async () => {
    const game = await board().build();
    await game.p1.move("sarge", "bf1");
    await game.settle();
    const eve = game.state("eve").meta as { lastDamage?: { amount: number; combat: boolean }; dealtDamageThisTurn?: boolean };
    expect(eve.dealtDamageThisTurn).toBe(true);
    expect(eve.lastDamage).toMatchObject({ amount: 1, combat: true });
  });

  test("deaths and control: Skulker dies, Evelynn survives healed to 0, Sergeant takes 3+2 = 5 ≥ 4 and dies; P2 keeps bf1 uncontested; nobody scores (466.1.a, 466.3)", async () => {
    const game = await board().build();
    await game.p1.move("sarge", "bf1");
    await game.settle();
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.zoneOf("sarge")).toBe("trash");
    expect(game.state("eve")).toMatchObject({ damage: 0, might: 2, zone: "battlefield-bf1" });
    expect(game.p2.units("bf1")).toEqual(["eve"]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});

describe("(b) Disintegrate removes the front-liner mid-showdown — Evelynn alone takes all 4", () => {
  test("Disintegrate is castable by the Focus holder in the combat showdown for 4 energy; it offers Skulker, Evelynn and P1's own Sergeant (all 'at a battlefield')", async () => {
    const game = await board().build();
    await game.p1.move("sarge", "bf1");
    const offered = (game.p1.option("cast", "dis")?.fields.find((f) => f.name === "targets")?.options ?? []).flat().sort();
    expect(offered).toEqual(["eve", "sarge", "skulker"]);
    await game.p1.cast("dis", { targets: "skulker" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dis", controller: P1, targets: ["skulker"] })]);
  });

  test("it resolves inside the showdown: Skulker dies in the ensuing Cleanup (319) BEFORE any combat damage, P1 draws 1; the showdown is still open with Evelynn as P2's only unit at bf1, undamaged", async () => {
    const game = await board().build();
    const deck = game.p1.deck().length;
    await game.p1.move("sarge", "bf1");
    await game.p1.cast("dis", { targets: "skulker" });
    for (let i = 0; i < 8 && (game.decision() as { context?: string } | null)?.context === "chain"; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.zoneOf("dis")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(1); // Disintegrate gone, drew 1
    expect(game.p1.deck()).toHaveLength(deck - 1);
    expect(game.p2.units("bf1")).toEqual(["eve"]);
    expect(game.state("eve").damage).toBe(0);
    expect(game.state("sarge")).toMatchObject({ combatRole: "attacker", damage: 0, zone: "battlefield-bf1" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
  });

  test("after P1's chain closes Focus has passed to P2; P2 then P1 pass and the damage step runs with NO distribute prompt — a lone Backline unit shelters behind nobody (826.3 'any OTHER unit')", async () => {
    const game = await skulkerDisintegrated();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.passFocus();
    expect(game.decision()?.kind).not.toBe("distribute");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("all 4 (not the minimum-lethal 2) is dealt to Evelynn — 465.2.c.4 lifts the cap once no further units remain; she dies", async () => {
    const game = await skulkerDisintegrated();
    await game.settle();
    expect(game.zoneOf("eve")).toBe("trash");
    const eve = game.state("eve").meta as { lastDamage?: { amount: number; combat: boolean } };
    expect(eve.lastDamage).toMatchObject({ amount: 4, combat: true });
  });

  test("return damage drops to Evelynn's 2 < 4: Sergeant survives, is healed to 0, and as the sole side remaining P1 wins and CONQUERS bf1 for 1 point (466.3.a, 466.5)", async () => {
    const game = await skulkerDisintegrated();
    await game.settle();
    expect(game.state("sarge")).toMatchObject({ combatRole: null, damage: 0, might: 4, zone: "battlefield-bf1" });
    expect((game.state("sarge").meta as { lastDamage?: { amount: number } }).lastDamage).toMatchObject({ amount: 2, combat: true });
    expect(game.p1.units("bf1")).toEqual(["sarge"]);
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.p2.trash().sort()).toEqual(["eve", "skulker"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast in one line: same attack, the only difference is whether the Skulker is removed before 465 — P2 holds (a) vs P1 conquers (b)", async () => {
    const plain = await board().build();
    await plain.p1.move("sarge", "bf1");
    await plain.settle();
    const spelled = await skulkerDisintegrated();
    await spelled.settle();
    expect([plain.gameState.battlefields.bf1?.controller, spelled.gameState.battlefields.bf1?.controller]).toEqual([P2, P1]);
    expect([plain.zoneOf("sarge"), spelled.zoneOf("sarge")]).toEqual(["trash", "battlefield-bf1"]);
    expect([plain.zoneOf("eve"), spelled.zoneOf("eve")]).toEqual(["battlefield-bf1", "trash"]);
  });
});
