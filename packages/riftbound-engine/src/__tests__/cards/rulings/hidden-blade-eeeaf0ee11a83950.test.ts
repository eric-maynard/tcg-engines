/**
 * Ruling eeeaf0ee11a83950 — Hidden Blade (OGN-213 → ogn-213-298) · [2]+[order] · [Hidden] [Action]
 *     "Kill a unit at a battlefield. Its controller draws 2."
 *   × Retreat (OGN-104 → ogn-104-298) · [1] [Reaction] "Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × (Fight or Flight OGN-168 named as a mover; Resonating Strike ven-034-166 is used here as the Reaction-speed
 *      battlefield-to-battlefield move the ruling's "moves to a different battlefield" nuance needs.)
 *
 * Q: If Hidden Blade's target is retreated off the battlefield before resolution, does its controller still draw 2?
 * A: No — the target must still be legal ("a unit at a battlefield") at resolution; off the battlefield ⇒ illegal ⇒ no
 *    controller can be read ⇒ no draw. But if the target stays LEGAL and merely doesn't die (Zhonya's replaces the death)
 *    the controller still draws. Played from HAND, a unit that moved to a DIFFERENT battlefield is still legal (killed,
 *    draw); played from HIDDEN (targets must be "here"), the moved unit is illegal ⇒ no kill, no draw.
 * Rules: 359.3.e.5–6 (illegal target ⇒ skip + null references), 371 (death replacement), 811.1.d.2 (from-Hidden "here" lock).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const RETREAT = "ogn-104-298";
const ZHONYAS = "ogn-077-298";
const RESONATING_STRIKE = "ven-034-166"; // [Reaction] "Choose a battlefield you control and a unit you control at a different location. Move that unit to that battlefield and give it +2 [Might] this turn."

/** P1's turn, [2]+[order] + Hidden Blade in hand. P2 controls bf1 (X 2-Might + Guard) and bf2 (Guard 2). */
function fromHandBoard() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .resources(P2, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "X" }, "x")
    .unit(P2, "bf1", { might: 4, name: "Guard One" }, "g1")
    .unit(P2, "bf2", { might: 4, name: "Guard Two" }, "g2")
    .hand(P1, HIDDEN_BLADE, "blade");
}

/** P1 casts Hidden Blade from hand at X and passes → P2's Reaction window. */
async function bladeAtX(game: Game): Promise<void> {
  await game.p1.cast("blade", { targets: "x" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", controller: P1, targets: ["x"] })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
}

describe("Ruling eeeaf0ee11a83950 — Hidden Blade's 'its controller draws 2' needs a target that is still LEGAL, not one that died", () => {
  test("Retreat in response takes X off the battlefield (to hand): Hidden Blade resolves against an illegal target — no kill, and P2 does NOT draw 2", async () => {
    const game = await fromHandBoard().hand(P2, RETREAT, "retreat").build();
    await bladeAtX(game);
    await game.p2.cast("retreat", { targets: "x" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Retreat resolves
    expect(game.zoneOf("x")).toBe("hand");
    const p2Hand = game.p2.hand().length; // includes X
    await game.settle(); // Blade resolves
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand); // no draw
    expect(game.p1.hand()).toEqual([]);
    expect(game.zoneOf("g1")).toBe("battlefield-bf1"); // never re-aimed
  });

  test("Zhonya's Hourglass replaces the death: X is healed, exhausted and recalled instead (Zhonya's dies) — the target stayed legal throughout, so P2 STILL draws 2", async () => {
    const game = await fromHandBoard().gear(P2, ZHONYAS, "zhonyas").build();
    await bladeAtX(game);
    const p2Hand = game.p2.hand().length;
    await game.p2.passPriority(); // Blade resolves
    await game.settle();
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.zoneOf("x")).toBe("base");
    expect(game.state("x")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("played from HAND and X is moved to a DIFFERENT battlefield in response (Resonating Strike → bf2): X is still 'a unit at a battlefield' ⇒ legal — it is killed there and P2 draws 2", async () => {
    const game = await fromHandBoard().hand(P2, RESONATING_STRIKE, "strike").build();
    await bladeAtX(game);
    await game.p2.cast("strike", { targets: "x" });
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("bf2");
    }
    await game.p2.passPriority();
    await game.p1.passPriority(); // Strike resolves
    expect(game.locationOf("x")).toBe("bf2");
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade"]);
    const p2Hand = game.p2.hand().length;
    await game.settle();
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
  });

  test("played from HIDDEN at bf1 and X is moved to bf2 in response: a from-Hidden Blade may only affect a unit 'here' ⇒ X is now illegal — no kill and no draw", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .resources(P2, { energy: 2, power: { calm: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 5, name: "Holder" }, "holder")
      .facedown(P1, "bf1", HIDDEN_BLADE, "blade") // hidden on an earlier turn
      .unit(P2, "base", { might: 2, name: "X" }, "x")
      .unit(P2, "bf2", { might: 4, name: "Guard Two" }, "g2")
      .hand(P2, RESONATING_STRIKE, "strike")
      .build();
    await game.p2.move("x", "bf1"); // X attacks into bf1 — now "here" for the facedown Blade
    await game.p2.pass();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("reveal", "blade")).toBe(true);
    await game.p1.reveal("blade", { answers: ["x"] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", controller: P1, targets: ["x"] })]);
    expect(game.p1.energy()).toBe(0); // played from facedown for [0]
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    await game.p2.cast("strike", { targets: "x" });
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("bf2");
    }
    await game.p2.passPriority();
    await game.p1.passPriority(); // Strike resolves: X → bf2
    expect(game.locationOf("x")).toBe("bf2");
    const p2Hand = game.p2.hand().length;
    await game.settle(); // Blade resolves — X is no longer "here"
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("x")).toBe("battlefield-bf2"); // not killed
    expect(game.p2.hand()).toHaveLength(p2Hand); // no draw
    expect(game.zoneOf("holder")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });
});
