/**
 * Spectral Matron — ogn-226-298 · Unit · Order · 4 energy + [order][order] · 4 Might
 *
 *   When you play me, you may play a unit costing no more than [3] and no more than [rainbow]
 *   from your trash, ignoring its cost.
 *
 * Rules: 383.3.a (leading "you may" → optional trigger), 206 (cost comparisons use the printed
 * cost: Energy ≤ 3 AND Power ≤ 1), 355.10.a (your trash is public → the unit is chosen from
 * YOUR trash), 359.2.c / 143.4 (a played unit enters the board exhausted at a valid location),
 * "ignoring its cost" → nothing is paid.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-226-298";
const SKULKER = "ogn-175-298"; // 3 energy, no power — eligible
const FAE = "ogn-097-298"; // Blastcone Fae: 2 energy + 1 mind — eligible (exactly [rainbow])
const SERGEANT = "ogn-219-298"; // Vanguard Sergeant: 4 energy — too much energy
const KRAKEN = "ogn-150-298"; // Kraken Hunter: 3 energy + 2 body — too much power
const CLEAVE = "ogn-004-298"; // a spell — not a unit

function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { order: 2 } })
    .battlefield("bf1", { controller: P1 })
    .trash(P1, SKULKER, "skulker")
    .trash(P1, FAE, "fae")
    .trash(P1, SERGEANT, "sarge")
    .trash(P1, KRAKEN, "kraken")
    .trash(P1, CLEAVE, "cleave")
    .trash(P2, SKULKER, "theirSkulker")
    .hand(P1, CARD, "sm");
}

describe("Spectral Matron (ogn-226-298)", () => {
  test("costs 4 energy + 2 order power; a 4-Might unit; the optional play trigger goes on the chain", async () => {
    const game = await board().build();
    await game.p1.play("sm", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.zoneOf("sm")).toBe("base");
    expect(game.state("sm").might).toBe(4);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sm", controller: P1, triggered: true })]);
    const onePower = await scenario().resources(P1, { energy: 4, power: { order: 1 } }).hand(P1, CARD, "sm").build();
    expect(onePower.p1.can("play", "sm")).toBe(false);
    const lowEnergy = await scenario().resources(P1, { energy: 3, power: { order: 2 } }).hand(P1, CARD, "sm").build();
    expect(lowEnergy.p1.can("play", "sm")).toBe(false);
  });

  test("'you may': the controller is asked; declining leaves the trash untouched and the Matron where she was played", async () => {
    const game = await board().build();
    await game.p1.play("sm", { to: "bf1" });
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    await game.settle();
    expect(game.decision()?.kind).toBe("action");
    expect(game.zoneOf("sm")).toBe("battlefield-bf1");
    for (const c of ["skulker", "fae", "sarge", "kraken", "cleave"]) {
      expect(game.zoneOf(c)).toBe("trash");
    }
  });

  test("accepting offers exactly the units in YOUR trash with Energy ≤ 3 and Power ≤ 1", async () => {
    // Expected: pick prompt listing skulker + fae only (sarge costs 4, kraken needs 2 power, cleave is
    // a spell, theirSkulker is in the opponent's trash). Actual: no prompt — the effect re-"plays" the
    // Matron herself into base and the trash is never consulted.
    const game = await board().build();
    await game.p1.play("sm", { to: "bf1" });
    await game.settle();
    await game.p1.yes();
    await game.settle(); // rule 402: the "you may" is answered at finalization; the trash pick waits for resolution
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" && d.options.map((o) => o.card).sort()).toEqual(["fae", "skulker"]);
  });

  test("the chosen unit is played from trash for free — it enters the board exhausted; the Matron stays where she was", async () => {
    // Expected: skulker leaves the trash and is on the board (base or a battlefield P1 controls),
    // exhausted, with P1's empty pool untouched; Matron still at bf1. Actual: skulker stays in the
    // trash and the Matron herself is moved to base.
    const game = await board().build();
    await game.p1.play("sm", { to: "bf1" });
    await game.settle();
    await game.p1.yes();
    await game.settle(); // rule 402 (finalization)
    await game.p1.pick("skulker"); // rule 383.3.b — the trash target is named at FINALIZATION
    await game.settle(); // …then the item resolves and the played unit picks its location
    const dest = game.decision();
    if (dest?.kind === "pick" && dest.seat === P1) {
      await game.p1.pick(dest.options[0]?.key as string); // choose a location if asked
    }
    await game.settle();
    expect(game.zoneOf("skulker")).not.toBe("trash");
    expect(["base", "bf1"]).toContain(game.locationOf("skulker") as string);
    expect(game.state("skulker").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.zoneOf("sm")).toBe("battlefield-bf1");
    expect(game.zoneOf("fae")).toBe("trash");
  });
});
