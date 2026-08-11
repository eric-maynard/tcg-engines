/**
 * Ruling 15a975d96549f059 — Rebuke (OGN-172 → ogn-172-298) · Spell · Chaos · [2][chaos][chaos] · [Action]
 *   "Return a unit at a battlefield to its owner's hand."
 *   × Anivia, Primal (OGN-148 → ogn-148-298) · Unit · 8 Might · "When I attack, deal 3 to all enemy units here."
 *
 * Q: Can I Rebuke a unit my opponent is moving into an open (unoccupied, uncontrolled) battlefield?
 * A: Yes — provided you get the opportunity. The move makes the battlefield Contested, which opens a showdown
 *    even with no defenders there; [Action] lets you cast Rebuke in a showdown on any player's turn. You need
 *    focus and an empty chain: while a move-triggered ability is still on the chain the state is Closed and
 *    only [Reaction] cards may be played.
 * Rules: 806.1.b/c.1 ([Action] = playable in showdowns on any turn), 190.3.a.1 (moving in applies Contested),
 *        344.2 / 323.8 (a Contested battlefield opens a showdown), 309.1/309.1.a (Closed State ⇒ Reaction only).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REBUKE = "ogn-172-298";
const ANIVIA = "ogn-148-298";

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/**
 * P2's turn. P1 holds bf1 with a 5-Might Guard and has Rebuke plus exactly [2][chaos][chaos].
 * bf2 is OPEN: no controller, no units. P2 has a 3-Might Scout and Anivia, Primal in base.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2, power: { chaos: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 5, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 3, name: "Scout" }, "scout")
    .unit(P2, "base", ANIVIA, "anivia")
    .hand(P1, REBUKE, "rebuke");
}

describe("Ruling 15a975d96549f059 — Rebuke can answer a unit moving into an open battlefield", () => {
  test("premise: Rebuke is an [Action] spell — on the opponent's turn with no showdown running, P1 may not cast it at all", async () => {
    const game = await board().build();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.p1.can("cast", "rebuke")).toBe(false);
    expect((await game.p1.try((p) => p.cast("rebuke", { targets: "guard" }))).ok).toBe(false);
  });

  test("the move into the OPEN bf2 makes it Contested and opens a (non-combat) showdown there — that is the window", async () => {
    const game = await board().build();
    await game.p2.move("scout", "bf2");
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, contestedBy: P2, controller: null });
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf2", isCombatShowdown: false });
  });

  test("focus matters: while the mover still holds focus P1 cannot act; once P2 passes focus, Rebuke is legal and the just-moved Scout is among its targets", async () => {
    const game = await board().build();
    await game.p2.move("scout", "bf2");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p1.can("cast", "rebuke")).toBe(false); // no focus yet
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "rebuke")).toBe(true);
    const targets = game.p1.option("cast", "rebuke")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(targets.flat().map(String)).toContain("scout");
  });

  test("ruling 15a975d96549f059 — P1 Rebukes the Scout mid-showdown: it goes back to P2's hand, so nobody ends up holding bf2", async () => {
    const game = await board().build();
    await game.p2.move("scout", "bf2");
    await game.p2.passFocus();
    await game.p1.cast("rebuke", { targets: "scout" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rebuke", controller: P1, targets: ["scout"] })]);
    await game.settle();
    expect(game.zoneOf("rebuke")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.p2.hand()).toContain("scout");
    expect(game.cardsAt("bf2")).toEqual([]);
    expect(game.gameState.battlefields.bf2?.controller).toBeNull();
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("the same window exists at a battlefield P1 already holds: the Scout moving into bf1 opens a combat showdown and Rebuke bounces the attacker before any damage", async () => {
    const game = await board().build();
    await game.p2.move("scout", "bf1");
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
    await game.p2.passFocus();
    await game.p1.cast("rebuke", { targets: "scout" });
    await game.settle();
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.state("guard")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("but not while the chain is busy: Anivia's attack trigger puts the turn in a Closed State, where the [Action] Rebuke is unplayable — it becomes legal again only once the chain empties", async () => {
    const game = await board().build();
    await game.p2.move("anivia", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "anivia", controller: P2, triggered: true })]);
    expect(game.p1.can("cast", "rebuke")).toBe(false); // 309.1.a — Reaction only
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "rebuke")).toBe(false); // P1 has priority, but the chain is not empty
    await game.p1.passPriority(); // Anivia's trigger resolves
    expect(game.chain()).toEqual([]);
    expect(game.state("guard").damage).toBe(3);
    // Open showdown state again — and whoever holds focus may now cast the Action spell.
    const d = game.decision();
    expect(d).toMatchObject({ context: "showdown", kind: "action" });
    if (d?.seat === P2) {
      await game.p2.passFocus();
    }
    expect(game.decision()).toMatchObject({ seat: P1 });
    expect(game.p1.can("cast", "rebuke")).toBe(true);
    await game.p1.cast("rebuke", { targets: "anivia" });
    await game.settle();
    expect(game.zoneOf("anivia")).toBe("hand");
    expect(game.zoneOf("guard")).toBe("battlefield-bf1"); // 3 damage on a 5-Might Guard is survivable
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
