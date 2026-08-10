/**
 * Ruling bed4fa4dd325e4df — Trifarian War Camp (OGN-294 → ogn-294-298) · Battlefield
 *   "Units here have +1 [Might]. (This includes attackers.)"
 *   × Stupefy (OGN-095 → ogn-095-298) · Reaction · 1 · "Give a unit -1 [Might] this turn, to a minimum of 1 [Might]. Draw 1."
 *
 * Q: Is the War Camp's +1 continuous, and how does it combine with a Might reduction like Stupefy?
 * A: Continuous: it always applies while the unit is there, but it does not "re-apply" after other effects — all
 *    increases and decreases are summed onto base Might. A 1-Might unit at the Camp is 2; after Stupefy it is 1
 *    (1 + 1 − 1). Might that works out below 1 elsewhere is treated as 0, and a 0-Might unit stays alive unless damaged.
 * Rules: 476–478 / 710 (Might arithmetic: increases then decreases, evaluated continuously), 522 (battlefield static),
 *        140.3 (death needs non-zero damage ≥ Might).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const WAR_CAMP = "ogn-294-298";
const STUPEFY = "ogn-095-298";

/** P1's turn with [1]. The live War Camp is P1's, holding P1's printed-1 Recruit; Stupefy in hand. A P2 bystander in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .battlefield("camp", { controller: P1, def: WAR_CAMP, inert: false })
    .battlefield("plain", { controller: null })
    .unit(P1, "camp", { might: 1, name: "Recruit" }, "recruit")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .hand(P1, STUPEFY, "stupefy");
}

describe("Ruling bed4fa4dd325e4df — War Camp's +1 is continuous but sums with reductions; it does not re-apply", () => {
  test("continuous: the printed-1 Recruit reads 2 while at the Camp (1 + 1), with no chain item ever needed", async () => {
    const game = await board().build();
    expect(game.chain()).toEqual([]);
    expect(game.state("recruit")).toMatchObject({ baseMight: 1, might: 2, staticMightBonus: 1 });
    expect(game.state("bystander").might).toBe(2); // not "here"
  });

  test("Stupefy on it: 1 (base) + 1 (Camp) − 1 = 1 — the Camp bonus was already in the sum and is not added again afterwards; P1 draws 1", async () => {
    const game = await board().build();
    const hand = game.p1.hand().length;
    await game.p1.cast("stupefy", { targets: "recruit" });
    await game.settle();
    expect(game.zoneOf("stupefy")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1);
    expect(game.locationOf("recruit")).toBe("camp");
    expect(game.state("recruit")).toMatchObject({ might: 1, mightModifier: -1, staticMightBonus: 1 });
    expect(game.zoneOf("recruit")).toBe("battlefield-camp"); // alive
  });

  test("leaving the Camp drops the continuous +1 at once: 1 − 1 = 0 Might in base — and a 0-Might unit with no damage stays alive", async () => {
    const game = await board().build();
    await game.p1.cast("stupefy", { targets: "recruit" });
    await game.settle();
    await game.p1.move("recruit", "base");
    await game.settle();
    expect(game.locationOf("recruit")).toBe("base");
    expect(game.state("recruit")).toMatchObject({ damage: 0, might: 0, staticMightBonus: 0 });
    expect(game.zoneOf("recruit")).toBe("base"); // not killed by having 0 Might
    expect(game.p1.trash()).not.toContain("recruit");
    expect(game.violations()).toEqual([]);
  });

  test("continuous the other way too: a printed-3 unit Stupefied in base (3 − 1 = 2) that then ENTERS the Camp reads 2 + 1 = 3 there — the aura is simply part of the running sum", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("camp", { controller: null, def: WAR_CAMP, inert: false })
      .unit(P1, "base", { might: 3, name: "Veteran" }, "vet")
      .hand(P1, STUPEFY, "stupefy")
      .build();
    await game.p1.cast("stupefy", { targets: "vet" });
    await game.settle();
    expect(game.state("vet")).toMatchObject({ might: 2, mightModifier: -1 });
    await game.p1.move("vet", "camp");
    await game.settle();
    await game.settle();
    expect(game.locationOf("vet")).toBe("camp");
    expect(game.state("vet")).toMatchObject({ might: 3, mightModifier: -1, staticMightBonus: 1 });
  });

  test("'this turn' only: next turn the Recruit at the Camp is 2 again", async () => {
    const game = await board().build();
    await game.p1.cast("stupefy", { targets: "recruit" });
    await game.settle();
    await game.advanceTurn();
    expect(game.state("recruit")).toMatchObject({ might: 2, mightModifier: 0 });
  });
});
