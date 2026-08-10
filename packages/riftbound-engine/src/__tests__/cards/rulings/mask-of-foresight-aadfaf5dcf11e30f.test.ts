/**
 * Ruling aadfaf5dcf11e30f — Mask of Foresight (OGN-060 → ogn-060-298) · Gear · Calm · [2]
 *     "When a friendly unit attacks or defends alone, give it +1 [Might] this turn."
 *   × Reaver's Row (OGN-285 → ogn-285-298) · Battlefield · "When you defend here, you may move a friendly unit here to base."
 *
 * Q: Two of my units defend Reaver's Row with Mask out. If I use the Row's trigger to send one home first, does the other —
 *    now defending alone — get Mask's +1?
 * A: No. All "when you defend" triggers are checked at the same moment, when the defenders are designated; both units were
 *    defending then, so Mask never triggers, and recalling one later is too late (Mask is a trigger, not a continuous check;
 *    ordering simultaneous triggers doesn't help — there is nothing to order). Attack/defend abilities fire only on a unit's
 *    first designation per combat. Conversely, if MY unit attacked alone (Mask triggered) and the opponent then Reaver's-Rows
 *    a defender away, my unit keeps Mask's +1 for the rest of the turn.
 * Rules: 383.4.e–f (attack/defend triggers on gaining the designation), 740.2.a (alone), 464.2.e.1 (attacker's triggers
 *        first, then defender's), 317 ("this turn").
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MASK_OF_FORESIGHT = "ogn-060-298";
const REAVERS_ROW = "ogn-285-298";

/** P2's turn. P1 holds Reaver's Row (live) with Guard A (3) + Guard B (2) and has Mask in base. P2's Raider (3) attacks from base. */
function twoDefenders() {
  return scenario()
    .active(P2)
    .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false, owner: P1 })
    .battlefield("bf2", { controller: null })
    .gear(P1, MASK_OF_FORESIGHT, "mask")
    .unit(P1, "row", { might: 3, name: "Guard A" }, "ga")
    .unit(P1, "row", { might: 2, name: "Guard B" }, "gb")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider");
}

/** Raider attacks; P1's only defend trigger is the Row's; P1 opts in and sends Guard B home; the initial chain drains. */
async function rowRecallsGuardB(): Promise<Game> {
  const game = await twoDefenders().build();
  await game.p2.move("raider", "row");
  await game.acceptTriggerOrder();
  expect(game.state("ga").combatRole).toBe("defender");
  expect(game.state("gb").combatRole).toBe("defender");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "row" } });
  await game.p1.yes();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "row" } });
  await game.p1.pick("gb");
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || !d.passKey) {
      break;
    }
    await game.seat(d.seat).pass();
  }
  return game;
}

describe("Ruling aadfaf5dcf11e30f — Reaver's Row cannot manufacture a 'defends alone' for Mask of Foresight; but an already-earned +1 sticks", () => {
  test("both Guards are designated defenders together: the ONLY defend trigger that goes pending is Reaver's Row's — Mask does not trigger (nobody is alone), so there is nothing for P1 to 'order'", async () => {
    const game = await twoDefenders().build();
    await game.p2.move("raider", "row");
    // No trigger-order offer involving the Mask; straight to the Row's opt-in.
    const d0 = game.decision();
    expect(d0?.kind === "order" ? d0.items.map((i) => i.card) : []).not.toContain("mask");
    await game.acceptTriggerOrder();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "row" } });
    expect(game.chain().some((c) => c.cardId === "mask")).toBe(false);
    expect(game.state("ga")).toMatchObject({ might: 3, mightModifier: 0 });
    expect(game.state("gb")).toMatchObject({ might: 2, mightModifier: 0 });
  });

  test("Reaver's Row resolves and Guard B goes home; Guard A is now the lone defender but was never RE-designated → Mask still does not trigger: chain empty, Guard A stays 3", async () => {
    const game = await rowRecallsGuardB();
    expect(game.locationOf("gb")).toBe("base");
    expect(game.p1.units("row")).toEqual(["ga"]);
    expect(game.state("ga").combatRole).toBe("defender");
    expect(game.chain()).toEqual([]);
    expect(game.state("ga")).toMatchObject({ might: 3, mightModifier: 0 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("outcome confirms it: Guard A (3, no bonus) and the Raider (3) trade — with Mask's +1 Guard A would have survived", async () => {
    const game = await rowRecallsGuardB();
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.locationOf("gb")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("converse nuance — MY unit attacks the opponent's Reaver's Row ALONE: Mask triggers (attacker's trigger first) and gives +1; the opponent then Rows one defender home; my attacker KEEPS the +1 for the rest of the combat/turn", async () => {
    const game = await scenario()
      .battlefield("row", { controller: P2, def: REAVERS_ROW, inert: false, owner: P2 })
      .battlefield("bf2", { controller: null })
      .gear(P1, MASK_OF_FORESIGHT, "mask")
      .unit(P1, "base", { might: 3, name: "Scout" }, "scout")
      .unit(P2, "row", { might: 3, name: "Picket" }, "picket")
      .unit(P2, "row", { might: 1, name: "Runt" }, "runt")
      .build();
    await game.p1.move("scout", "row");
    await game.acceptTriggerOrder();
    // Attacker's Mask trigger is placed first; then the defender's Row opt-in.
    expect(game.chain().find((c) => c.cardId === "mask")).toMatchObject({ controller: P1, triggered: true });
    for (let i = 0; i < 4 && game.decision()?.kind !== "yes-no"; i++) {
      const d = game.decision();
      if (d?.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "row" } });
    await game.p2.yes();
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("picket");
    }
    // Drain the initial chain: Row (top) recalls the Picket, then Mask (bottom) pumps the Scout.
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (d?.kind !== "action" || !d.passKey) {
        break;
      }
      await game.seat(d.seat).pass();
    }
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("picket")).toBe("base");
    expect(game.state("scout")).toMatchObject({ combatRole: "attacker", might: 4, mightModifier: 1 });
    // The +1 lasts through the combat: Scout (4) kills the Runt (1), survives, conquers — and is still 4 afterwards this turn.
    await game.settle();
    expect(game.zoneOf("runt")).toBe("trash");
    expect(game.locationOf("scout")).toBe("row");
    expect(game.gameState.battlefields.row?.controller).toBe(P1);
    expect(game.state("scout")).toMatchObject({ might: 4, mightModifier: 1 });
    await game.advanceTurn();
    expect(game.state("scout")).toMatchObject({ might: 3, mightModifier: 0 }); // "this turn"
  });
});
