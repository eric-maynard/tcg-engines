/**
 * Anivia, Primal — ogn-148-298 · Champion Unit (Anivia) · Body · 7 energy + [body][body] · 8 Might
 *
 *   When I attack, deal 3 to all enemy units here.
 *
 * "When I attack" triggers when the unit gains the Attacker designation as combat opens;
 * "enemy"/"here" are read relative to Anivia (359.3.f.4). "All enemy units here" is not a
 * choice (355.5.a) — every enemy unit at her battlefield is dealt 3 before combat damage.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-148-298";

function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 6, name: "Big" }, "big")
    .unit(P2, "bf1", { might: 3, name: "Small" }, "small")
    .unit(P2, "bf2", { might: 2, name: "Elsewhere" }, "elsewhere")
    .unit(P1, "bf1", { might: 1, name: "Buddy" }, "buddy")
    .unit(P1, "base", CARD, "anivia");
}

describe("Anivia, Primal (ogn-148-298)", () => {
  test("costs 7 energy + 2 body; enters the base as an 8-Might unit; unaffordable with one body or 6 energy", async () => {
    const game = await scenario().resources(P1, { energy: 7, power: { body: 2 } }).hand(P1, CARD, "anivia").build();
    await game.p1.play("anivia");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.zoneOf("anivia")).toBe("base");
    expect(game.state("anivia").might).toBe(8);
    const short = await scenario().resources(P1, { energy: 7, power: { body: 1 } }).hand(P1, CARD, "anivia").build();
    expect(short.p1.can("play", "anivia")).toBe(false);
    const low = await scenario().resources(P1, { energy: 6, power: { body: 2 } }).hand(P1, CARD, "anivia").build();
    expect(low.p1.can("play", "anivia")).toBe(false);
  });

  test("When I attack: moving into an enemy battlefield makes her the attacker and puts her trigger on the chain", async () => {
    const game = await board().build();
    await game.p1.move("anivia", "bf1");
    expect(game.state("anivia").combatRole).toBe("attacker");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "anivia", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("the trigger resolves with no target prompt: 3 to every enemy unit HERE — not bf2, not friendly units, not herself", async () => {
    const game = await board().build();
    await game.p1.move("anivia", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()?.kind).toBe("action");
    expect((game.decision() as ActionDecision).context).toBe("showdown"); // still before combat damage
    expect(game.state("big").damage).toBe(3);
    expect(game.zoneOf("small")).toBe("trash"); // 3 ≥ 3
    expect(game.state("elsewhere").damage).toBe(0);
    expect(game.state("buddy").damage).toBe(0);
    expect(game.state("anivia").damage).toBe(0);
  });

  test("full combat: small dies to the trigger, big (6, already on 3) dies to combat damage; Anivia (8) survives and conquers", async () => {
    const game = await board().build();
    await game.p1.move("anivia", "bf1");
    await game.settle();
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.zoneOf("big")).toBe("trash");
    expect(game.locationOf("anivia")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("does not trigger when defending", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "anivia")
      .unit(P2, "base", { might: 2 }, "poke")
      .build();
    await game.p2.move("poke", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.chain()).toHaveLength(0);
    expect(game.state("poke").damage).toBe(0);
  });
});
