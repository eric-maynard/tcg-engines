/**
 * Ruling ed0b0db77698a70c — Disintegrate (OGN-005 → ogn-005-298) · [Action] · [4] "Deal 3 to a unit at a battlefield. If this
 *     kills it, do this: draw 1."
 *   × Fortified Position (OGN-279 → ogn-279-298) Battlefield "When you defend here, choose a unit. It gains [Shield 2] this
 *     combat."
 *
 * Q: Does a damage spell like Disintegrate at an opponent's unit on Fortified Position start a showdown / trigger "when you
 *    defend here"?
 * A: No. Playing a spell starts no showdown; "defending" only exists in a combat, which begins when a non-controller's UNIT
 *    moves into the battlefield. The unit just takes the damage.
 * Rules: 464 (combat opens on a unit contesting a battlefield), 465 (defender designation), 340/344 (showdowns).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DISINTEGRATE = "ogn-005-298";
const FORTIFIED_POSITION = "ogn-279-298";

/** P1's turn with exactly [4]. P2 holds a LIVE Fortified Position with a 5-Might Garrison; P1 has a 2-Might Scout in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 4 })
    .battlefield("fort", { controller: P2, def: FORTIFIED_POSITION, inert: false, owner: P2 })
    .unit(P2, "fort", { might: 5, name: "Garrison" }, "gar")
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .hand(P1, DISINTEGRATE, "dis");
}

describe("Ruling ed0b0db77698a70c — a damage spell at a unit on Fortified Position is not an attack", () => {
  test("Disintegrate at the Garrison: only the spell is on the chain — no showdown, no combat roles, no Fortified Position item — and it resolves for 3 damage with no Shield ever granted", async () => {
    const game = await board().build();
    await game.p1.cast("dis", { targets: "gar" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["dis"]);
    expect(game.chain().some((c) => c.cardId === "fort")).toBe(false);
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.gameState.battlefields.fort).toMatchObject({ contested: false, controller: P2 });
    expect(game.state("gar").combatRole).toBeNull();
    // P2's response window is an ordinary chain window, not a showdown.
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.settle();
    expect(game.zoneOf("dis")).toBe("trash");
    expect(game.state("gar")).toMatchObject({ damage: 3, grantedKeywords: [], zone: "battlefield-fort" });
    expect(game.chain()).toEqual([]);
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: a UNIT moving in is what starts the showdown — the Scout attacks, the Garrison defends, and Fortified Position's trigger goes on the chain for P2 (P2 chooses the unit to Shield)", async () => {
    const game = await board().build();
    await game.p1.move("scout", "fort");
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "fort", defendingPlayer: P2 });
    expect(game.state("gar").combatRole).toBe("defender");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fort", controller: P2, triggered: true })]);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
    await game.p2.pick("gar");
    await game.settle();
    // Shield 2 "this combat" mattered only during the fight; the 2-Might Scout is dead and P2 still holds the fort.
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.gameState.battlefields.fort?.controller).toBe(P2);
  });
});
