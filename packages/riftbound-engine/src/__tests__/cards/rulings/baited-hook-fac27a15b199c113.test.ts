/**
 * Ruling fac27a15b199c113 — Baited Hook (OGN-242 → ogn-242-298) · gear · [3]
 *   "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 … banish a unit … and play it, ignoring its cost."
 *   × Kai'Sa, Survivor (OGN-039 → ogn-039-298) · [4] · 4 [Might] · "[Accelerate] (You may pay [1][fury] as an
 *     additional cost to have me enter ready.)"
 *
 * Q: When an effect plays a unit from outside my hand "ignoring its cost", may I still pay Accelerate?
 * A: Yes. "Ignoring its cost" waives only the BASE cost. The card still goes through the whole play process, which
 *    includes electing optional additional costs — so Accelerate is offered and, if paid, the unit enters ready.
 * Rules: 356.4 (optional additional costs are elected during the play), 204.1 (base cost vs additional costs).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BAITED_HOOK = "ogn-242-298";
const KAISA = "ogn-039-298";

/** P1's turn. A 3-Might Bait to feed the Hook, Kai'Sa on top of the deck, [1][fury] spare for Accelerate. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 3, name: "Bait" }, "bait")
    .gear(P1, BAITED_HOOK, "hook")
    .deck(P1, [KAISA], ["kaisa"])
    .resources(P1, { energy: 3, power: { fury: 1, order: 1 } });
}

/** Fish Kai'Sa up; the play is now asking about Accelerate. */
async function acceleratePrompt(): Promise<Game> {
  const game = await board().build();
  await game.p1.activate("hook", 0, { targets: "bait" });
  await game.acting().passPriority();
  await game.acting().passPriority();
  await game.p1.pick("kaisa");
  return game;
}

describe("Ruling fac27a15b199c113 — 'ignoring its cost' does not remove the option to pay Accelerate", () => {
  test("after the Hook's [1][order] the pool still holds [1][fury] — exactly the Accelerate cost", async () => {
    const game = await acceleratePrompt();
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.power("fury")).toBe(1);
    expect(game.p1.power("order")).toBe(0);
  });

  test("the play offers the optional Accelerate cost even though the base cost was ignored", async () => {
    const game = await acceleratePrompt();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(d?.prompt).toContain("Accelerate");
    expect((d as { canAccept?: boolean }).canAccept ?? true).toBe(true);
  });

  test("paying it charges [1][fury] and Kai'Sa enters READY — her own [4] Energy is still never paid", async () => {
    const game = await acceleratePrompt();
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("kaisa")).toBe("base");
    expect(game.state("kaisa")).toMatchObject({ isReady: true, isExhausted: false });
    expect(game.p1.energy()).toBe(1); // 2 − 1, not 2 − 4
    expect(game.p1.power("fury")).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("declining leaves the pool alone and Kai'Sa enters exhausted, as units normally do", async () => {
    const game = await acceleratePrompt();
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("kaisa")).toBe("base");
    expect(game.state("kaisa").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.power("fury")).toBe(1);
  });
});
