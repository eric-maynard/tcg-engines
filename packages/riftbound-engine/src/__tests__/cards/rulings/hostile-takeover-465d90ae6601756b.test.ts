/**
 * Ruling 465d90ae6601756b — Hostile Takeover (SFD-202 → sfd-202-221) · Spell · [5][rainbow][rainbow] · [Hidden]
 *   "Take control of an enemy unit at a battlefield. Ready it. … Lose control of that unit and recall it at end of turn."
 *   × Retreat (OGN-104 → ogn-104-298) · [Reaction] · [1] "Return a friendly unit to its owner's hand. Its owner
 *     channels 1 rune exhausted."
 *
 * Q: When a unit taken with Hostile Takeover is Retreated, who exhausts the rune and where does the unit go?
 * A: The OWNER — the player whose deck the unit came from, not the current controller and not the caster. The
 *    unit goes to its owner's hand and that owner channels the exhausted rune.
 * Rules: 106 (owner vs. controller; ownership never changes), 428 ("to its owner's hand"), 623 (channel).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HOSTILE_TAKEOVER = "sfd-202-221";
const RETREAT = "ogn-104-298";

/** P1's turn. P2 holds bf1 with a lone Thrall; P1 has Hostile Takeover + Retreat and [6][rainbow][rainbow]. */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 3, name: "Thrall" }, "thrall")
    .hand(P1, HOSTILE_TAKEOVER, "takeover")
    .hand(P1, RETREAT, "retreat");
}

/** P1 seizes the Thrall with Hostile Takeover. */
async function seized(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("takeover", { targets: "thrall" });
  await game.settle();
  expect(game.state("thrall")).toMatchObject({ controller: P1, isReady: true, owner: P2 });
  return game;
}

describe("Ruling 465d90ae6601756b — Retreating a Hostile-Takeover'd unit sends it to its OWNER's hand and its OWNER channels", () => {
  test("setup: control moved to P1 but ownership stayed with P2", async () => {
    const game = await seized();
    expect(game.state("thrall").owner).toBe(P2);
    expect(game.state("thrall").controller).toBe(P1);
  });

  test("ruling: Retreat (cast by the new controller) puts the unit into its OWNER's hand, not the caster's", async () => {
    const game = await seized();
    await game.p1.cast("retreat", { targets: "thrall" });
    await game.settle();
    expect(game.zoneOf("thrall")).toBe("hand");
    expect(game.p2.hand()).toContain("thrall");
    expect(game.p1.hand()).not.toContain("thrall");
    expect(game.violations()).toEqual([]);
  });

  test("ruling: the OWNER channels the exhausted rune — P2 gains it, P1 gains nothing", async () => {
    const game = await seized();
    const p1Runes = game.p1.runes().length;
    const p2Runes = game.p2.runes().length;
    const p2Ready = game.p2.runes({ ready: true }).length;
    await game.p1.cast("retreat", { targets: "thrall" });
    await game.settle();
    expect(game.p2.runes().length).toBe(p2Runes + 1);
    expect(game.p2.runes({ ready: true }).length).toBe(p2Ready); // the new rune came in exhausted
    expect(game.p1.runes().length).toBe(p1Runes);
    expect(game.violations()).toEqual([]);
  });

  test("baseline: Retreating a unit P1 actually owns puts it in P1's hand and P1 channels", async () => {
    const game = await board().unit(P1, "base", { might: 2, name: "Squire" }, "squire").build();
    const p1Runes = game.p1.runes().length;
    const p2Runes = game.p2.runes().length;
    await game.p1.cast("retreat", { targets: "squire" });
    await game.settle();
    expect(game.p1.hand()).toContain("squire");
    expect(game.p1.runes().length).toBe(p1Runes + 1);
    expect(game.p2.runes().length).toBe(p2Runes);
    expect(game.violations()).toEqual([]);
  });
});
