/**
 * Ruling dd0b89b08a8c8cda — Hidden Blade (OGN-213 → ogn-213-298) · [2] Order · "[Hidden] [Action] Kill a unit at a battlefield.
 *     Its controller draws 2."
 *   × Unlicensed Armory (OGN-023 → ogn-023-298) · Gear · "Discard 1, [Exhaust]: Choose a friendly unit. The next time it would die
 *     this turn, you may pay [fury] to heal it, exhaust it, and recall it instead."
 *
 * Q: Hidden Blade targets a unit that survives thanks to Unlicensed Armory — does the Blade's player still draw 2?
 * A: Yes. The draw is not conditional on the unit dying; the target was legal when the Blade resolved, so its controller draws.
 *    Nuances: if the unit is returned to hand, or killed, BEFORE the Blade resolves, there is no legal target/controller → no draw.
 * Rules: 370–372 (replacement "instead"), 356.3.e (mistargeted instruction skipped), 355 (targets locked on play).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const UNLICENSED_ARMORY = "ogn-023-298";

/** P2 reactions for the nuance cases. */
const BOUNCE = {
  abilities: [{ effect: { target: { type: "unit" }, type: "return-to-hand" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 0,
  name: "Test Bounce",
  timing: "reaction",
};
const SNIPE = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "order",
  energyCost: 0,
  name: "Test Snipe",
  timing: "reaction",
};

/** P1's turn. P1: Armory (ready), Grunt (2) at P1's bf1, a Junk card to discard, Hidden Blade in hand; [2] + order + fury. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 1, order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .gear(P1, UNLICENSED_ARMORY, "armory")
    .unit(P1, "bf1", { might: 2, name: "Grunt" }, "grunt")
    .unit(P1, "bf1", { might: 1, name: "Anchor" }, "anchor") // keeps bf1 controlled whatever happens to the Grunt
    .hand(P1, { cardType: "unit", energyCost: 5, might: 5, name: "Junk" }, "junk")
    .hand(P1, HIDDEN_BLADE, "blade")
    .hand(P2, BOUNCE, "bounce")
    .hand(P2, SNIPE, "snipe");
}

/** Activate the Armory (discard Junk) naming the Grunt, resolve it; then P1 casts Hidden Blade at its own Grunt and passes. */
async function shieldedGruntBladed(): Promise<Game> {
  const game = await board().build();
  const asksNow = game.p1.option("activate", "armory")?.fields.some((f) => f.name === "targets") === true;
  await game.p1.activate("armory", 0, asksNow ? { discard: "junk", targets: "grunt" } : { answers: ["grunt"], discard: "junk" });
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick(d.options.some((o) => (o.card ?? o.key) === "junk") ? "junk" : "grunt");
    } else {
      break;
    }
  }
  await game.settle();
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("junk")).toBe("trash");
  await game.p1.cast("blade", { targets: "grunt" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", targets: ["grunt"] })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling dd0b89b08a8c8cda — Hidden Blade still draws 2 when the Armory saves the target", () => {
  test("Blade resolves on the shielded Grunt: P1 is asked the Armory's optional [fury]; YES → Grunt healed, exhausted, recalled to base (alive) AND P1 draws 2", async () => {
    const game = await shieldedGruntBladed();
    const handBefore = game.p1.hand().length;
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(d?.source?.cardId).toBe("armory");
    await game.p1.yes();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.state("grunt")).toMatchObject({ damage: 0, isExhausted: true, location: "base", zone: "base" });
    expect(game.p1.power("fury")).toBe(0);
    expect(game.p1.hand()).toHaveLength(handBefore + 2); // the draw does not depend on the death
    expect(game.violations()).toEqual([]);
  });

  test("nuance — P2 bounces the Grunt to hand in response: when the Blade resolves its target is not at a battlefield → no kill, NO draw", async () => {
    const game = await shieldedGruntBladed();
    const handBefore = game.p1.hand().length;
    await game.p2.cast("bounce", { targets: "grunt" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("grunt")).toBe("hand");
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(handBefore + 1); // +1 is the Grunt itself; no 2-card draw
    expect(game.p1.hand()).toContain("grunt");
  });

  test("nuance — P2 kills the Grunt in response (P1 declines the Armory save there): the Grunt is gone when the Blade resolves → NO draw", async () => {
    const game = await shieldedGruntBladed();
    const handBefore = game.p1.hand().length;
    await game.p2.cast("snipe", { targets: "grunt" });
    // Snipe resolves first; the Armory shield asks P1 — decline so the Grunt really dies before the Blade.
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (!d) {
        break;
      }
      if (d.kind === "yes-no" && d.seat === P1) {
        await game.p1.no();
        break;
      }
      if (d.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
        continue;
      }
      break;
    }
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("grunt")).toBe("trash");
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(handBefore); // no draw
    expect(game.violations()).toEqual([]);
  });
});
