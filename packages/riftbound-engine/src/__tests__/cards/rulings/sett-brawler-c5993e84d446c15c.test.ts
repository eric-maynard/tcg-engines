/**
 * Ruling c5993e84d446c15c — Sett, Brawler (OGN-164 → ogn-164-298) · Unit · Body · [5][body] · 4 Might
 *   "When I'm played and when I conquer, buff me. / Spend my buff: Give me +4 [Might] this turn."
 *   × Call to Glory (OGN-207 → ogn-207-298) · Reaction · [3]
 *   "As you play this, you may spend a buff as an additional cost. If you do, ignore this spell's cost.
 *    Give a unit +3 [Might] this turn."
 *
 * Q: If another effect (e.g. Call to Glory's additional cost) spends Sett's buff, does Sett get his +4?
 * A: No. "+4 Might" is the effect of Sett's ACTIVATED ability whose cost is spending his buff; another card
 *    spending the buff pays that card's cost, not Sett's, so no +4 happens.
 * Rules: 419 (activated abilities: cost → effect), 356/357 (additional costs), buffs (spend = remove).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const SETT_BRAWLER = "ogn-164-298";
const CALL_TO_GLORY = "ogn-207-298";

/** P1's turn, empty pool. Sett (4, buffed → 5) and a vanilla Ally (2) in base; Call to Glory in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 0 })
    .battlefield("bf1")
    .unit(P1, "base", SETT_BRAWLER, "sett", { buffed: true })
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .hand(P1, CALL_TO_GLORY, "ctg");
}

describe("Ruling c5993e84d446c15c — a buff spent by another card does not fire Sett, Brawler's '+4 Might'", () => {
  test("baseline: Sett spending his OWN buff via his activated ability gives him +4 this turn (5 → 4 + 4 = 8)", async () => {
    const game = await board().build();
    expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 5 });
    expect(game.p1.can("activate", "sett")).toBe(true);
    await game.p1.activate("sett");
    expect(game.state("sett").isBuffed).toBe(false); // cost paid
    await game.settle();
    expect(game.state("sett")).toMatchObject({ isBuffed: false, might: 8 });
  });

  test("Call to Glory paid by spending Sett's buff (on the Ally): Sett just loses the buff (5 → 4) — no +4; the Ally gets +3; no energy paid", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "ctg")).toBe(true); // only affordable via the spend-a-buff alternative
    await game.p1.cast("ctg", { payOptional: true, targets: "ally" });
    expect(game.p1.energy()).toBe(0);
    expect(game.state("sett").isBuffed).toBe(false); // Sett's buff was the one spent (the only buff around)
    await game.settle();
    expect(game.zoneOf("ctg")).toBe("trash");
    expect(game.state("ally").might).toBe(5);
    expect(game.state("sett")).toMatchObject({ isBuffed: false, might: 4, mightModifier: 0 });
    expect(game.chain()).toEqual([]);
    // And with the buff gone Sett can no longer activate his ability this turn.
    expect(game.p1.can("activate", "sett")).toBe(false);
  });

  test("Call to Glory paid with Sett's buff and aimed AT Sett: he ends at 4 + 3 = 7, not 4 + 3 + 4 = 11", async () => {
    const game = await board().build();
    await game.p1.cast("ctg", { payOptional: true, targets: "sett" });
    await game.settle();
    expect(game.state("sett")).toMatchObject({ isBuffed: false, might: 7 });
    expect(game.p1.energy()).toBe(0);
  });
});
