/**
 * Ruling c12ccec464e00a04 — Bullet Time (OGN-268 → ogn-268-298) · Action · Body/Chaos · 1
 *   "Pay any amount of [rainbow] to deal that much damage to all enemy units at a battlefield."
 *   × Miss Fortune, Captain (OGN-162 → ogn-162-298) · "…The first time I move each turn, you may ready something else
 *     that's exhausted."
 *
 * Q: Can you float Energy/Power (rune Add abilities) DURING Bullet Time's resolution to pay its Power cost?
 * A: Yes. Whenever a player is told to pay resources they may use Reaction/Add abilities first — so at Bullet Time's
 *    resolution-time payment you may tap/recycle runes and then pay. This applies only when a payment is demanded:
 *    a resolving ability that asks for no payment (Miss Fortune's move trigger) offers no such window — float before it
 *    resolves or in response to it instead.
 * Rules: 204.3.b (X Power paid on resolution), 444.2.c / 416.3 / 429.3 (Add abilities usable whenever told to pay),
 *        332 (priority in response to a chain item).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BULLET_TIME = "ogn-268-298";
const MISS_FORTUNE = "ogn-162-298";

const addVerbs = (d: Decision | null): string[] =>
  d && "actions" in d ? ((d as { actions?: { verb: string }[] }).actions ?? []).map((a) => a.verb) : [];

/** P1: exactly [1] energy and NO floating power, two ready Fury runes; P2 holds bf1 with two 2-Might Grunts. */
function bulletBoard() {
  return scenario()
    .resources(P1, { energy: 1 })
    .runes(P1, "fury", 2)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Grunt A" }, "ga")
    .unit(P2, "bf1", { might: 2, name: "Grunt B" }, "gb")
    .hand(P1, BULLET_TIME, "bt");
}

async function bulletTimeResolving(): Promise<Game> {
  const game = await bulletBoard().build();
  await game.p1.cast("bt", { targets: "bf1" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // only the [1] on cast
  await game.acting().passPriority();
  await game.acting().passPriority();
  return game;
}

describe("Ruling c12ccec464e00a04 — float resources during Bullet Time's resolution-time payment (but not mid-resolution of a no-payment ability)", () => {
  test("Bullet Time resolves with P1 holding zero power: the pay-[rainbow] prompt opens AND offers the rune Add abilities (recycle for power, tap for energy) alongside it", async () => {
    const game = await bulletTimeResolving();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "integer", seat: P1, source: { cardId: "bt" }, unit: "rainbow" });
    expect(d?.kind === "integer" ? d.max : -1).toBe(0); // nothing floated yet
    expect(addVerbs(d)).toContain("recycleRune");
    expect(addVerbs(d)).toContain("tapRune");
  });

  test("P1 recycles both runes for [rainbow][rainbow] mid-payment, the prompt's maximum rises to 2, P1 pays 2 → both Grunts take 2 and die", async () => {
    const game = await bulletTimeResolving();
    await game.p1.recycleRune();
    expect(game.decision()).toMatchObject({ kind: "integer", max: 1, seat: P1 });
    await game.p1.recycleRune();
    expect(game.p1.power()).toBe(2);
    expect(game.decision()).toMatchObject({ kind: "integer", max: 2, seat: P1 });
    await game.p1.chooseX(2);
    await game.settle();
    expect(game.p1.power()).toBe(0);
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.zoneOf("gb")).toBe("trash");
    expect(game.zoneOf("bt")).toBe("trash");
    // (the harness's generic pendingChoiceGatesMoves invariant does not know rule 444.2.c lets Add abilities through a pay-X)
    expect(game.violations().filter((v) => v.invariant !== "pendingChoiceGatesMoves")).toEqual([]);
  });

  test("nuance — Miss Fortune's move trigger demands no payment: its opt-in and its 'ready something' choice offer NO rune abilities; floating is only possible in the priority window in RESPONSE to the trigger (before it resolves)", async () => {
    const game = await scenario()
      .runes(P1, "fury", 2)
      .rune(P1, "chaos", { alias: "spent", exhausted: true })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", MISS_FORTUNE, "mf")
      .unit(P1, "base", { might: 2, name: "Sleepy" }, "sleepy", { exhausted: true })
      .build();
    await game.p1.move("mf", "bf1"); // first move this turn → trigger
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mf", controller: P1, triggered: true })]);
    // opt-in: no Add abilities offered here
    let d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "mf" } });
    expect(addVerbs(d)).not.toContain("tapRune");
    expect(addVerbs(d)).not.toContain("recycleRune");
    await game.p1.yes();
    // the ability's own choice: still no Add abilities alongside it
    d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "mf" } });
    expect(addVerbs(d)).toEqual([]);
    await game.p1.pick("sleepy");
    // …whereas in RESPONSE to the pending trigger (an ordinary priority window) tapping a rune is legal
    d = game.decision();
    expect(d).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("tapRune")).toBe(true);
    await game.p1.tapRune();
    expect(game.p1.energy()).toBe(1);
    await game.settle();
    expect(game.state("sleepy").isReady).toBe(true);
    expect(game.locationOf("mf")).toBe("bf1");
  });
});
