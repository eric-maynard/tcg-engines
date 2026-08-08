/**
 * Interaction: [Deflect] × a triggered ability whose target is picked from a PROMPT.
 *
 *   Allay, Eager Admirer (unl-041-219) — printed [Deflect].
 *   Ability source: ogn-092-298 "When you play me, deal 6 to an enemy unit at a battlefield."
 *
 * Rules:
 *   809.1.c / 809.1.c.1 — an opponent choosing a [Deflect] card with a spell OR an ability pays
 *     [Deflect value] more Power of any Domain; the cost is incurred when the target is CHOSEN.
 *   356.2.a.2 — that surcharge is a mandatory additional cost.
 *
 * The single-candidate case is charged in chain/resolve.ts; this file pins the multi-candidate
 * case, where the pick happens inside a `choose-target` prompt (pending-choice.ts).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ALLAY = "unl-041-219"; // printed [Deflect]; also grants it to your OTHER units HERE
const SNIPER = "ogn-092-298"; // 6 energy + [mind][mind]: When you play me, deal 6 to an enemy unit at a battlefield.

/**
 * P2 holds the sniper plus `spare` off-domain power. P1's Deflect unit sits at bf1 and the plain
 * candidate at bf2 — out of reach of Allay's "your other units HERE" grant, so only one of the two
 * prompt options is taxed.
 */
async function board(spare: number): Promise<Game> {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 6, power: { mind: 2, fury: spare } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", ALLAY, "guarded")
    .unit(P1, "bf2", { might: 5, name: "Plain" }, "plain")
    .hand(P2, SNIPER, "sniper")
    .build();
}

describe("Deflect surcharge on a prompted (multi-candidate) ability target pick — 809.1.c.1", () => {
  test("picking the [Deflect] unit from the prompt costs the chooser 1 extra Power", async () => {
    const game = await board(2);
    expect(game.state("guarded").keywords).toContain("Deflect");
    await game.p2.play("sniper", { to: "base" });
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
    await game.p2.pick("guarded");
    await game.settle();
    expect(game.zoneOf("guarded")).toBe("trash");
    expect(game.p2.power("fury")).toBe(1); // 2 spare − 1 Deflect
    expect(game.violations()).toEqual([]);
  });

  test("picking the plain unit from the same prompt costs nothing extra", async () => {
    const game = await board(2);
    await game.p2.play("sniper", { to: "base" });
    await game.settle();
    await game.p2.pick("plain");
    await game.settle();
    expect(game.zoneOf("plain")).toBe("trash");
    expect(game.p2.power("fury")).toBe(2);
  });
});
