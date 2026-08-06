/**
 * Solari Chief — ogn-225-298 · Unit · Order · 5 energy + [order] · 4 Might
 *
 *   When you play me, choose an enemy unit. If it is stunned, kill it. Otherwise, stun it.
 *   (It doesn't deal combat damage this turn.)
 *
 * Rules: 423 (Stun is a binary status; 423.1.a.1 a stunned unit can't be stunned again),
 * 355.5 (choosing "an enemy unit" is a choice made by the controller — any location).
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-225-298";

function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Fresh" }, "fresh")
    .unit(P2, "base", { might: 5, name: "Dazed" }, "dazed", { stunned: true })
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .hand(P1, CARD, "chief");
}

/** Play the Chief and answer the "choose an enemy unit" prompt with `target`. */
async function playChoosing(game: Game, target: string): Promise<void> {
  await game.p1.play("chief");
  for (let i = 0; i < 8 && (game.chain().length > 0 || game.decision()?.kind === "pick"); i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick(target);
    } else {
      await game.acting().passPriority();
    }
  }
  await game.settle();
}

describe("Solari Chief (ogn-225-298)", () => {
  test("costs 5 energy + 1 order; 4 Might; unaffordable without the order power or with 4 energy", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { order: 1 } }).hand(P1, CARD, "chief").build();
    await game.p1.play("chief");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("chief")).toBe("base");
    expect(game.state("chief").might).toBe(4);
    const noOrder = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "chief").build();
    expect(noOrder.p1.can("play", "chief")).toBe(false);
    const low = await scenario().resources(P1, { energy: 4, power: { order: 1 } }).hand(P1, CARD, "chief").build();
    expect(low.p1.can("play", "chief")).toBe(false);
  });

  test("'choose an enemy unit' — the controller is prompted to pick among ENEMY units (any location, stunned or not)", async () => {
    // Expected: a pick for P1 offering exactly fresh + dazed (not the friendly ally).
    // Actual: no choice is ever presented; the hand-authored conditional auto-selects a target.
    const game = await board().build();
    await game.p1.play("chief");
    let d = game.decision();
    for (let i = 0; i < 6 && game.chain().length > 0 && !(d?.kind === "pick" && d.seat === P1); i++) {
      await game.acting().passPriority();
      d = game.decision();
    }
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const keys = d?.kind === "pick" ? d.options.map((o) => o.key).sort() : [];
    expect(keys).toEqual(["dazed", "fresh"]);
  });

  test("'Otherwise, stun it' — choosing the non-stunned enemy stuns it and leaves the already-stunned one alive", async () => {
    // Expected: fresh becomes stunned; dazed (not chosen) is untouched.
    // Actual: with any stunned enemy on the board the engine kills that one instead and stuns nothing.
    const game = await board().build();
    await playChoosing(game, "fresh");
    expect(game.state("fresh").isStunned).toBe(true);
    expect(game.zoneOf("fresh")).toBe("battlefield-bf1");
    expect(game.zoneOf("dazed")).toBe("base"); // not the chosen unit → not killed
    expect(game.zoneOf("chief")).toBe("base");
  });

  test("'If it is stunned, kill it': choosing an already-stunned enemy kills it", async () => {
    const game = await board().build();
    await playChoosing(game, "dazed");
    expect(game.zoneOf("dazed")).toBe("trash");
    expect(game.state("fresh").isStunned).toBe(false);
    expect(game.zoneOf("fresh")).toBe("battlefield-bf1");
  });

  test("with a single non-stunned enemy it is simply stunned, not killed", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { order: 1 } })
      .unit(P2, "base", { might: 3, name: "Solo" }, "solo")
      .hand(P1, CARD, "chief")
      .build();
    await playChoosing(game, "solo");
    expect(game.zoneOf("solo")).toBe("base");
    expect(game.state("solo").isStunned).toBe(true);
  });

  test("with no enemy units the Chief still resolves and nothing else happens", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { order: 1 } }).unit(P1, "base", { might: 2 }, "ally").hand(P1, CARD, "chief").build();
    await game.p1.play("chief");
    await game.settle();
    expect(game.zoneOf("chief")).toBe("base");
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.state("ally").isStunned).toBe(false);
    expect(game.decision()?.kind).toBe("action");
  });
});
