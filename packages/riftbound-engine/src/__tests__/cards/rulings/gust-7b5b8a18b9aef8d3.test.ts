/**
 * Ruling 7b5b8a18b9aef8d3 — Gust (OGN-169 → ogn-169-298) · Spell · [1] · Reaction
 *     "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   × Long Sword (SFD-022 → sfd-022-221) · Equipment · [2][fury] ·
 *     "[Quick-Draw] (This has [Reaction]. When you play it, attach it to a unit you control.)"
 *
 * Q: Played in reaction to Quick-Draw, does Gust resolve before the equipment attaches?
 * A: Yes. The gear itself enters at its controller's base with no chain step — you cannot react to that. What goes
 *    on the chain is Quick-Draw's TRIGGERED ability, and that gives you a window: Gust is added on top and resolves
 *    first (LIFO). With the unit gone the attach instruction has no legal object and simply whiffs — the equipment
 *    is not trashed, it just stays unattached at its controller's base.
 * Rules: 819 ([Quick-Draw] = a triggered attach ability), 383.2/340 (triggered abilities go on the chain and open
 *        priority), 341.1 (the chain resolves last-in-first-out), 359.3.e.5 (an illegal target ⇒ that instruction
 *        does nothing; the rest of the resolution still happens).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const LONG_SWORD = "sfd-022-221";

/** P2's turn with exactly [2][fury] and Long Sword in hand; P2's 2-Might Squire holds bf1. P1 has Gust + [1]. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 2, power: { fury: 1 } })
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Squire" }, "squire")
    .hand(P2, LONG_SWORD, "sword")
    .hand(P1, GUST, "gust");
}

describe("Ruling 7b5b8a18b9aef8d3 — Gust answers the Quick-Draw trigger and resolves first; the gear stays, unattached", () => {
  test("premise: the gear is already at P2's base the moment it is played — what sits on the chain is the Quick-Draw ability, with the Squire bound as its object", async () => {
    const game = await board().build();
    await game.p2.play("sword");
    expect(game.zoneOf("sword")).toBe("base");
    expect(game.state("sword").attachedTo).toBeUndefined();
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "sword", controller: P2, name: "Long Sword", targets: ["squire"], triggered: true }),
    ]);
  });

  test("ruling: that chain item is the reaction window — P1 Gusts the Squire, Gust goes ON TOP of the Quick-Draw trigger", async () => {
    const game = await board().build();
    await game.p2.play("sword");
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "gust")).toBe(true);
    await game.p1.cast("gust", { targets: "squire" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["sword", "gust"]);
  });

  test("ruling: LIFO — Gust resolves first and the Squire is in P2's hand; the attach then whiffs and the Long Sword remains at P2's base, unattached and NOT trashed", async () => {
    const game = await board().build();
    await game.p2.play("sword");
    await game.p2.passPriority();
    await game.p1.cast("gust", { targets: "squire" });
    await game.settle();
    expect(game.zoneOf("squire")).toBe("hand");
    expect(game.zoneOf("sword")).toBe("base");
    expect(game.state("sword").attachedTo).toBeUndefined();
    expect(game.p2.trash()).not.toContain("sword");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("control — undisturbed, the very same Quick-Draw trigger attaches the sword to the Squire", async () => {
    const game = await board().build();
    await game.p2.play("sword");
    await game.settle();
    expect(game.state("sword").attachedTo).toBe("squire");
    expect(game.state("squire").attachments).toContain("sword");
  });
});
