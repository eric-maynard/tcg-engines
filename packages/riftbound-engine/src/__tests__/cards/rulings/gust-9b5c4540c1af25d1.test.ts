/**
 * Ruling 9b5c4540c1af25d1 — Gust (OGN-169 → ogn-169-298) · Spell · Chaos · [1] · Reaction
 *     "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   × Mask of Foresight (OGN-060 → ogn-060-298) · Gear · Calm · [2]
 *     "When a friendly unit attacks or defends alone, give it +1 [Might] this turn."
 *
 * Q: A 3-Might unit attacks alone with Mask of Foresight out. Can the defender Gust it back to hand?
 * A: Yes. Mask's trigger goes on the (initial) chain when the unit attacks; before it resolves the defender may
 *    react with Gust — the unit is still 3 Might at that point and is returned to hand before Mask resolves.
 *    (Gust has to be played in response to the Mask trigger specifically; once it resolves the unit is 4.)
 * Rules: 383.4.e (attack triggers → initial chain), 347/348 (Reaction window while an item is pending),
 *        355.8 (Gust's ≤3 requirement checked when chosen), 383 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const MASK_OF_FORESIGHT = "ogn-060-298";

/** P1's turn. P1: Mask in base + a 3-Might Scout in base. P2 holds bf1 with a 2-Might Lookout, Gust in hand and exactly [1]. */
function board() {
  return scenario()
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .gear(P1, MASK_OF_FORESIGHT, "mask")
    .unit(P1, "base", { might: 3, name: "Scout" }, "scout")
    .unit(P2, "bf1", { might: 2, name: "Lookout" }, "lookout")
    .hand(P2, GUST, "gust");
}

async function scoutAttacksAlone(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("scout", "bf1");
  await game.acceptTriggerOrder();
  return game;
}

const gustTargets = (game: Game) =>
  (game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets")?.options ?? []).flat() as string[];

describe("Ruling 9b5c4540c1af25d1 — Gust answers the Mask of Foresight trigger before it resolves", () => {
  test("the lone attack puts Mask's trigger on the initial chain; the Scout is the attacker and still 3 Might while it is pending", async () => {
    const game = await scoutAttacksAlone();
    expect(game.state("scout").combatRole).toBe("attacker");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mask", controller: P1, triggered: true })]);
    expect(game.state("scout").might).toBe(3);
    expect(game.state("scout").mightModifier).toBe(0);
  });

  test("P1 passes priority on that chain → P2 may react: Gust is legal and offers the 3-Might attacking Scout (and P2's own Lookout)", async () => {
    const game = await scoutAttacksAlone();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.chain().map((c) => c.cardId)).toEqual(["mask"]); // still pending
    expect(game.p2.can("cast", "gust")).toBe(true);
    expect(gustTargets(game).toSorted()).toEqual(["lookout", "scout"]);
  });

  test("Gust resolves first (LIFO): the Scout returns to P1's hand BEFORE Mask resolves; Mask then resolves onto nothing; combat is over and P2 keeps bf1", async () => {
    const game = await scoutAttacksAlone();
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "scout" });
    expect(game.p2.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["mask", "gust"]);
    // Both pass → Gust resolves; Mask is still on the chain at that moment.
    for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "gust"); i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.p1.hand()).toContain("scout");
    // Now let Mask resolve (its unit is gone — nothing to pump) and the empty combat wind down.
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.zoneOf("lookout")).toBe("battlefield-bf1");
    expect(game.state("lookout").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("nuance — too late after the trigger: if P2 lets Mask resolve first, the Scout is 4 Might and Gust no longer offers it (355.8)", async () => {
    const game = await scoutAttacksAlone();
    // Drain the initial chain (both pass) without casting anything.
    while (game.chain().length > 0 && game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    expect(game.state("scout")).toMatchObject({ combatRole: "attacker", might: 4, mightModifier: 1 });
    // P1 (attacker) has Focus first; pass it to P2.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(gustTargets(game)).toEqual(["lookout"]);
    const r = await game.p2.try((p) => p.cast("gust", { targets: "scout" }));
    expect(r.ok).toBe(false);
    expect(game.locationOf("scout")).toBe("bf1");
  });
});
