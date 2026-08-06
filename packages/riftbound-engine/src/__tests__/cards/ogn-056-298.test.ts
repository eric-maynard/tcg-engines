/**
 * Adaptatron — ogn-056-298 · Unit · Calm · 4 energy · 3 Might
 *
 *   When I conquer, you may kill a gear. If you do, buff me.
 *   (If I don't have a buff, I get a +1 [Might] buff.)
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-056-298";
const SEAL_OF_FOCUS = "ogn-081-298"; // an enemy gear to kill

/** Adaptatron in P1's base, an empty P2-held battlefield to walk into, one gear on each side. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", CARD, "ada")
    .gear(P2, SEAL_OF_FOCUS, "seal")
    .gear(P1, { cardType: "gear", name: "Trinket" }, "trinket");
}

/** Move in, let the (empty) showdown close → P1 conquers bf1 and the trigger asks yes/no. */
async function conquer() {
  const game = await board().build();
  await game.p1.move("ada", "bf1");
  await game.settle();
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.p1.points()).toBe(1);
  return game;
}

describe("Adaptatron (ogn-056-298)", () => {
  test("When I conquer: an optional (yes/no) trigger is offered to the controller", async () => {
    const game = await conquer();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "ada", pendingChoiceType: "opt-in" } });
  });

  test("accepting lets you kill a gear — any gear, friendly or enemy, is a legal choice", async () => {
    const game = await conquer();
    await game.p1.yes();
    await game.settle();
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    const keys = d?.kind === "pick" ? d.options.map((o) => o.key).sort() : [];
    expect(keys).toEqual(["seal", "trinket"]);
    await game.p1.pick("seal");
    await game.settle();
    expect(game.zoneOf("seal")).toBe("trash");
    expect(game.zoneOf("trinket")).toBe("base");
  });

  test.failing("BUG: 'If you do, buff me' — killing the gear buffs Adaptatron (+1 Might buff)", async () => {
    // Expected: after the chosen gear dies Adaptatron becomes buffed (3 → 4 Might).
    // Actual: the follow-up was parsed as `condition: paid-additional-cost`, which is never
    // true for a conquer trigger, so the gear dies but no buff is applied.
    const game = await conquer();
    await game.p1.yes();
    await game.settle();
    await game.p1.pick("seal");
    await game.settle();
    expect(game.zoneOf("seal")).toBe("trash");
    expect(game.state("ada").isBuffed).toBe(true);
    expect(game.state("ada").might).toBe(4);
  });

  test("declining kills nothing and gives no buff", async () => {
    const game = await conquer();
    await game.p1.no();
    await game.settle();
    expect(game.decision()?.kind).toBe("action");
    expect(game.zoneOf("seal")).toBe("base");
    expect(game.zoneOf("trinket")).toBe("base");
    expect(game.state("ada").isBuffed).toBe(false);
    expect(game.state("ada").might).toBe(3);
  });

  test("only on conquer: simply being played (4 energy) triggers nothing", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).gear(P2, SEAL_OF_FOCUS, "seal").hand(P1, CARD, "ada").build();
    await game.p1.play("ada");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.decision()?.kind).toBe("action");
    expect(game.zoneOf("ada")).toBe("base");
    expect(game.zoneOf("seal")).toBe("base");
    const poor = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "ada").build();
    expect(poor.p1.can("play", "ada")).toBe(false);
  });
});
