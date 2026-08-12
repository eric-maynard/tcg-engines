/**
 * Ruling c3ccf1d67484cc73 — Imperial Decree (OGN-221 → ogn-221-298) · Spell · Order · [5][order][order] · [Action]
 *   "When any unit takes damage this turn, kill it."
 *   × Teemo, Scout (ogn-197-298) — "[Hidden] … When you play me, give me +3 [Might] this turn."
 *
 * Q: With a hidden Teemo out, can the Teemo player reveal him after combat damage — in response to the
 *    Imperial Decree trigger — and keep him on the board while everything else dies?
 * A: Yes. The Decree is a delayed TRIGGER, so it uses the chain and can be answered: reveal Teemo in
 *    response, the Decree resolves and kills the units that took damage, and Teemo — who took none —
 *    survives. Note also that the Decree is NOT considered when combat damage is assigned: you must still
 *    assign lethal damage normally, so you cannot spread 1 damage over several units and let the Decree
 *    finish them.
 * Rules: 390.2/383 (a delayed triggered ability uses the chain and may be responded to),
 *        465.2.c.3/465.2.c.4 (combat damage assignment must be lethal before moving on),
 *        811.6 (revealing a hidden card is a play made in a reaction window).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const IMPERIAL_DECREE = "ogn-221-298";
const VOID_SEEKER = "ogn-024-298"; // "Deal 4 to a unit at a battlefield."
const TEEMO_SCOUT = "ogn-197-298";

/** P1's turn. P2 holds bf1 with a 9-Might Titan and a facedown Teemo. */
function board() {
  return scenario()
    .resources(P1, { energy: 9, power: { fury: 1, order: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 9, name: "Titan" }, "titan")
    .facedown(P2, "bf1", TEEMO_SCOUT, "teemo")
    .hand(P1, IMPERIAL_DECREE, "decree")
    .hand(P1, VOID_SEEKER, "seeker");
}

describe("Ruling c3ccf1d67484cc73 — Imperial Decree's kill is a trigger you can answer", () => {
  test("ruling: after damage is dealt, the Decree goes on the chain as a triggered ability (it is not a replacement)", async () => {
    const game = await board().build();
    await game.p1.cast("decree");
    await game.settle();
    expect(game.zoneOf("decree")).toBe("trash"); // the spell itself resolved and left

    await game.p1.cast("seeker", { targets: "titan" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Void Seeker resolves: 4 damage on a 9-Might unit

    expect(game.state("titan").damage).toBe(4);
    expect(game.zoneOf("titan")).toBe("battlefield-bf1"); // not lethal by itself
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "decree", triggered: true })]);
  });

  test("ruling: P2 may react to that trigger by revealing hidden Teemo — Teemo comes down and the damaged unit dies", async () => {
    const game = await board().build();
    await game.p1.cast("decree");
    await game.settle();
    await game.p1.cast("seeker", { targets: "titan" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.passPriority(); // P1 has nothing more; P2 gets the window

    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("reveal", "teemo")).toBe(true);
    await game.p2.reveal("teemo");
    expect(game.locationOf("teemo")).toBe("bf1");

    await game.settle();
    expect(game.zoneOf("titan")).toBe("trash"); // killed by the Decree
    expect(game.zoneOf("teemo")).toBe("battlefield-bf1"); // took no damage ⇒ survives
    expect(game.state("teemo").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("nuance: the Decree is ignored when combat damage is assigned — 2 damage cannot be spread 1-and-1 to let it finish two 4-Might defenders", async () => {
    const game = await scenario()
      .resources(P1, { energy: 9, power: { order: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Guard A" }, "ga", { stunned: true })
      .unit(P2, "bf1", { might: 4, name: "Guard B" }, "gb", { stunned: true })
      .unit(P1, "base", { might: 2, name: "Raider" }, "raider")
      .hand(P1, IMPERIAL_DECREE, "decree")
      .build();
    await game.p1.cast("decree");
    await game.settle();

    await game.p1.move("raider", "bf1");
    await game.settle();

    // All 2 damage had to go to ONE defender; the Decree then killed that one only.
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.zoneOf("gb")).toBe("battlefield-bf1");
    expect(game.state("gb").damage).toBe(0);
    expect(game.locationOf("raider")).toBe("base"); // a defender remained ⇒ recalled
  });
});
