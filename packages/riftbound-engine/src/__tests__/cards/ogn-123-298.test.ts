/**
 * Unchecked Power — ogn-123-298 · Spell · Mind · 7 energy · [mind][mind]
 *
 *   Exhaust all friendly units, then deal 12 to ALL units at battlefields.
 *
 * No [Action]/[Reaction] in the text → rule 155: playable only in a Neutral
 * Open State on its controller's turn (not during showdowns). "ALL units at
 * battlefields" hits both sides and targets nothing (355.10.d); units in a
 * base are exhausted (if friendly) but take no damage.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-123-298";

function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { mind: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Home Ally" }, "homeAlly")
    .unit(P1, "bf1", { might: 5, name: "Field Ally" }, "fieldAlly")
    .unit(P2, "base", { might: 2, name: "Home Foe" }, "homeFoe")
    .unit(P2, "bf2", { might: 8, name: "Field Foe" }, "fieldFoe")
    .unit(P2, "bf2", { might: 13, name: "Colossus" }, "colossus")
    .hand(P1, CARD, "up");
}

describe("Unchecked Power (ogn-123-298)", () => {
  test("costs 7 energy + 2 mind; goes to trash after resolving", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "up")).toBe(true);
    await game.p1.cast("up");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.zoneOf("up")).toBe("chain");
    await game.settle();
    expect(game.zoneOf("up")).toBe("trash");
  });

  test("not affordable with 7 energy + 1 mind, or 6 energy + 2 mind", async () => {
    const lowPower = await board().resources(P1, { energy: 7, power: { mind: 1 } }).build();
    expect(lowPower.p1.can("cast", "up")).toBe(false);
    const lowEnergy = await board().resources(P1, { energy: 6, power: { mind: 2 } }).build();
    expect(lowEnergy.p1.can("cast", "up")).toBe(false);
  });

  test("exhausts ALL friendly units (base and battlefield); enemy units are not exhausted", async () => {
    const game = await board().build();
    await game.p1.cast("up");
    await game.settle();
    expect(game.state("homeAlly").isExhausted).toBe(true);
    expect(game.state("homeFoe").isExhausted).toBe(false);
    expect(game.state("colossus").isExhausted).toBe(false);
  });

  test("then deals 12 to every unit at a battlefield on both sides; base units take nothing", async () => {
    const game = await board().build();
    await game.p1.cast("up");
    await game.settle();
    expect(game.zoneOf("fieldAlly")).toBe("trash");
    expect(game.zoneOf("fieldFoe")).toBe("trash");
    // 12 on a 13-might unit is not lethal: it stays with the damage marked.
    expect(game.zoneOf("colossus")).toBe("battlefield-bf2");
    expect(game.state("colossus").damage).toBe(12);
    expect(game.zoneOf("homeAlly")).toBe("base");
    expect(game.state("homeAlly").damage).toBe(0);
    expect(game.zoneOf("homeFoe")).toBe("base");
    expect(game.state("homeFoe").damage).toBe(0);
  });

  test("castable with no units anywhere (targets nothing)", async () => {
    const game = await scenario().resources(P1, { energy: 7, power: { mind: 2 } }).hand(P1, CARD, "up").build();
    expect(game.p1.can("cast", "up")).toBe(true);
    await game.p1.cast("up");
    await game.settle();
    expect(game.zoneOf("up")).toBe("trash");
  });

  test("not playable on the opponent's turn", async () => {
    const game = await board().active(P2).build();
    expect(game.p1.can("cast", "up")).toBe(false);
  });

  test("no [Action] keyword — must NOT be castable during a showdown (rule 155)", async () => {
    // Expected: with Focus in a showdown the spell is not offered (plain spell timing).
    // Actual: the card definition carries `timing: "action"` although the rules text has no
    // [Action], so the engine offers it during showdowns.
    const game = await board().unit(P1, "base", { might: 1 }, "scout").build();
    await game.p1.move("scout", "bf2");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.p1.can("cast", "up")).toBe(false);
  });
});
