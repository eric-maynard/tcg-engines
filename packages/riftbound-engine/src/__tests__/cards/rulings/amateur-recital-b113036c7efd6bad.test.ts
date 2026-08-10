/**
 * Ruling b113036c7efd6bad — Amateur Recital (UNL-207 → unl-207-219, Battlefield)
 *   "When you hold here, you may move a unit at a battlefield to its base."
 *   × Baron Nashor (UNL-147 → unl-147-219) "…I can't be chosen by enemy spells and abilities. Other friendly units have +2."
 *   × Baron Pit (UNL-T01 → unl-t01, token battlefield) "Units can move here from anywhere."
 *
 * Q: Can the Amateur Recital hold trigger move an (enemy) Baron Nashor sitting at the Baron Pit back to base?
 * A: No. Selecting the unit to move is "choosing" it; Baron "can't be chosen by enemy spells and abilities", so he
 *    is not a legal choice for the opponent's Recital trigger.
 * Rules: 355 (choosing = targeting), 355.9.b / 757 (Untargetable — "can't be chosen by enemy spells or abilities").
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AMATEUR_RECITAL = "unl-207-219";
const BARON_NASHOR = "unl-147-219";
const BARON_PIT = "unl-t01";

/**
 * End of P1's turn 2. P2 controls the live Amateur Recital with a Holder (3) → P2 HOLDS it at the start of their turn.
 * P1's Baron Nashor stands at the (live) Baron Pit; P1 also has a plain Scout (2) at bf3 so the trigger has SOME enemy option.
 */
function board() {
  return scenario()
    .battlefield("recital", { controller: P2, def: AMATEUR_RECITAL, inert: false, owner: P2 })
    .battlefield("pit", { controller: P1, def: BARON_PIT, inert: false, owner: P1 })
    .battlefield("bf3", { controller: P1 })
    .unit(P2, "recital", { might: 3, name: "Holder" }, "holder")
    .unit(P1, "pit", BARON_NASHOR, "baron")
    .unit(P1, "bf3", { might: 2, name: "Scout" }, "scout");
}

async function p2HoldsRecitalAndOptsIn(): Promise<Game> {
  const game = await board().build();
  expect(game.state("baron").keywords).toContain("Untargetable");
  await game.p1.endTurn();
  expect(game.turnPlayer()).toBe(P2);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
  expect(game.decision()?.prompt).toMatch(/Amateur Recital/);
  await game.p2.yes();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
  return game;
}

describe("Ruling b113036c7efd6bad — an enemy Amateur Recital cannot choose Baron Nashor", () => {
  test("P2's hold trigger offers 'a unit at a battlefield' from either side — Holder and P1's Scout — but NOT P1's Baron Nashor (can't be chosen by enemy abilities)", async () => {
    const game = await p2HoldsRecitalAndOptsIn();
    const pick = game.decision() as PickDecision;
    const offered = pick.options.map((o) => o.card ?? o.key).toSorted();
    expect(offered).toContain("holder");
    expect(offered).toContain("scout");
    expect(offered).not.toContain("baron");
    expect((await game.p2.try((p) => p.pick("baron"))).ok).toBe(false);
    expect(game.zoneOf("baron")).toBe("battlefield-pit");
  });

  test("picking the legal Scout instead works normally: it is moved to P1's base; Baron never leaves the Pit", async () => {
    const game = await p2HoldsRecitalAndOptsIn();
    await game.p2.pick("scout");
    await game.settle();
    expect(game.zoneOf("scout")).toBe("base");
    expect(game.zoneOf("baron")).toBe("battlefield-pit");
    expect(game.p2.points()).toBe(1); // the hold itself scored
    expect(game.turnPlayer()).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: the restriction is ENEMY-only — when P1 (Baron's controller) holds their own Amateur Recital, Baron at the Pit IS a legal choice and goes home", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("recital", { controller: P1, def: AMATEUR_RECITAL, inert: false, owner: P1 })
      .battlefield("pit", { controller: P1, def: BARON_PIT, inert: false, owner: P1 })
      .unit(P1, "recital", { might: 3, name: "Holder" }, "holder")
      .unit(P1, "pit", BARON_NASHOR, "baron")
      .unit(P2, "base", { might: 2, name: "Bystander" }, "by")
      .build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    const pick = game.decision() as PickDecision;
    expect(pick).toMatchObject({ kind: "pick", seat: P1 });
    expect(pick.options.map((o) => o.card ?? o.key)).toContain("baron");
    await game.p1.pick("baron");
    await game.settle();
    expect(game.zoneOf("baron")).toBe("base");
  });
});
