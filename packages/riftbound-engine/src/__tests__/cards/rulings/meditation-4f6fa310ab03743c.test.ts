/**
 * Ruling 4f6fa310ab03743c — Meditation (OGN-048 → ogn-048-298) · Spell · [2] · [Reaction]
 *   "As an additional cost to play this, you may exhaust a friendly unit. If you do, draw 2. Otherwise, draw 1."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · [Action] · [2][chaos] "Move a friendly unit and ready it."
 *
 * Q: Can I cast Meditation during a showdown, as the attacker, exhausting my only attacking unit to draw 2?
 * A: Yes. A [Reaction] is playable in a showdown, and your attacker is a friendly unit you control, so it can pay
 *    the optional additional cost. Exhausting it does not take it out of combat — it stays at the battlefield,
 *    keeps the attacker designation and the showdown carries on. (It must still be READY to be exhausted: a unit
 *    that attacked with a Standard Move already paid exhaustion as that move's cost.)
 * Rules: 419.3 ([Reaction] timing), 356.2 (optional additional cost chosen on play), 144.2 (exhaustion is the
 *        Standard Move cost), 414.1.c (an exhausted object cannot be exhausted again), 340 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MEDITATION = "ogn-048-298";
const RIDE_THE_WIND = "ogn-173-298";

/** P1's turn. P2 holds bf1 with a 2-Might Sentry; P1 has a lone Ronin (5), Ride the Wind, Meditation and [4][chaos]. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Sentry" }, "sentry")
    .unit(P1, "base", { might: 5, name: "Ronin" }, "ronin")
    .hand(P1, RIDE_THE_WIND, "wind")
    .hand(P1, MEDITATION, "med")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

/** Ride the Wind sends the Ronin into bf1 AND readies him, so P1's sole attacker is ready inside the showdown. */
async function attackingReady(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("wind", { targets: "ronin" });
  await game.p1.passPriority();
  await game.p2.passPriority();
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("bf1"); // bf1 is the only legal destination here, so it is usually auto-bound
  }
  expect(game.state("ronin")).toMatchObject({ combatRole: "attacker", isReady: true, zone: "battlefield-bf1" });
  expect(game.p1.units("bf1")).toEqual(["ronin"]);
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 4f6fa310ab03743c — Meditation may exhaust your lone attacker in a showdown to draw 2", () => {
  test("ruling: the [Reaction] is playable inside the showdown and the attacking Ronin is offered as the cost", async () => {
    const game = await attackingReady();
    expect(game.p1.can("cast", "med")).toBe(true);
    const fields = game.p1.option("cast", "med")?.fields ?? [];
    expect(fields.find((f) => f.name === "paidAdditionalCost")).toBeDefined();
    expect((fields.find((f) => f.name === "targets")?.options ?? []).flat()).toContain("ronin");
  });

  test("ruling: paying the optional cost exhausts the sole attacker on play; the 2 cards arrive when it resolves", async () => {
    const game = await attackingReady();
    await game.p1.cast("med", { payOptional: true, targets: "ronin" });
    expect(game.state("ronin").isExhausted).toBe(true);
    expect(game.p1.hand()).not.toContain("d1"); // nothing drawn yet
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.hand().toSorted()).toEqual(["d1", "d2"]);
    expect(game.zoneOf("med")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("ruling: the now-exhausted unit stays at the battlefield, keeps the attacker designation, and the showdown continues", async () => {
    const game = await attackingReady();
    await game.p1.cast("med", { payOptional: true, targets: "ronin" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("ronin")).toMatchObject({ combatRole: "attacker", isExhausted: true, zone: "battlefield-bf1" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("contrast: declining the additional cost leaves the attacker ready and draws only 1", async () => {
    const game = await attackingReady();
    await game.p1.cast("med", { payOptional: false });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("ronin").isExhausted).toBe(false);
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.violations()).toEqual([]);
  });

  test("nuance (144.2 / 414.1.c): a unit that attacked with a STANDARD move is already exhausted, so it cannot pay the cost", async () => {
    const game = await board().build();
    await game.p1.move("ronin", "bf1"); // exhaustion IS the move's cost
    expect(game.state("ronin").isExhausted).toBe(true);
    const targets = (game.p1.option("cast", "med")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(targets).not.toContain("ronin");
  });

  test("epilogue: the exhausted Ronin still fights — 5 beats the 2-Might Sentry and P1 conquers bf1", async () => {
    const game = await attackingReady();
    await game.p1.cast("med", { payOptional: true, targets: "ronin" });
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
