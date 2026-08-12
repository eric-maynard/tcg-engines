/**
 * Ruling ae7235b9021a892b — Mistfall (OGN-152 → ogn-152-298) · Gear · [3]
 *   "When you buff a friendly unit, you may pay [body] and exhaust this to ready it."
 *   × Stand United (OGN-053 → ogn-053-298) · Spell · [3] · [Action] · "Buff a friendly unit. …" as the buff source.
 *
 * Q: Can Mistfall be triggered by aiming a buff effect at a unit that already has a buff?
 * A: No. A unit that already carries a buff can be chosen, but no buff counter is placed, so no buffing happened and
 *    the trigger never fires — the same way "when you discard" does nothing when you have no cards to discard.
 * Rules: 383.1 (a trigger needs its event to actually occur), 705 (buff counters — one per unit unless stated),
 *        383.3.a/b (a leading "you may [cost] to …" is decided and paid at finalization).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const MISTFALL = "ogn-152-298";
const STAND_UNITED = "ogn-053-298";

/** P1's turn with Mistfall ready, [3] energy + [body], one already-buffed unit and one exhausted unbuffed unit. */
function board() {
  return scenario()
    .gear(P1, MISTFALL, "mistfall")
    .unit(P1, "base", { might: 2, name: "Fresh" }, "fresh", { exhausted: true })
    .unit(P1, "base", { might: 2, name: "Already" }, "already", { buffed: true, exhausted: true })
    .hand(P1, STAND_UNITED, "su")
    .resources(P1, { energy: 3, power: { body: 1 } });
}

describe("Ruling ae7235b9021a892b — Mistfall needs a buff to actually be placed, not merely aimed", () => {
  test("both units are legal choices for the buff spell — being buffed already does not remove you from the menu", async () => {
    const game = await board().build();
    expect(game.state("already").isBuffed).toBe(true);
    expect(game.state("fresh").isBuffed).toBe(false);
    expect(game.p1.option("cast", "su")?.fields.find((f) => f.arg === "targets")?.options).toEqual([["fresh"], ["already"]]);
  });

  test("buffing the UNBUFFED unit fires Mistfall: P1 is asked to pay [body] + exhaust, and the unit is readied", async () => {
    const game = await board().build();
    await game.p1.cast("su", { targets: "fresh" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("fresh").isBuffed).toBe(true);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "mistfall" }, timing: "FIN" });
    await game.p1.yes();
    await game.settle();
    expect(game.state("mistfall").isExhausted).toBe(true);
    expect(game.p1.power("body")).toBe(0);
    expect(game.state("fresh").isReady).toBe(true);
  });

  test("buffing the ALREADY-buffed unit fires nothing at all — no prompt, Mistfall untouched, [body] unspent", async () => {
    const game = await board().build();
    await game.p1.cast("su", { targets: "already" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("su")).toBe("trash"); // the spell resolved
    expect(game.chain()).toEqual([]); // …and queued no Mistfall trigger
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("mistfall").isExhausted).toBe(false);
    expect(game.p1.power("body")).toBe(1);
    expect(game.state("already").isReady).toBe(false); // never readied
    expect(game.violations()).toEqual([]);
  });

  test("declining the offer leaves Mistfall ready and the [body] in the pool", async () => {
    const game = await board().build();
    await game.p1.cast("su", { targets: "fresh" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.no();
    await game.settle();
    expect(game.state("mistfall").isExhausted).toBe(false);
    expect(game.p1.power("body")).toBe(1);
    expect(game.state("fresh").isReady).toBe(false);
  });
});
