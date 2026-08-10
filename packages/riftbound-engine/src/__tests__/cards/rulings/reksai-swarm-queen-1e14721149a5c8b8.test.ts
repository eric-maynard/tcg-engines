/**
 * Ruling 1e14721149a5c8b8 — Rek'Sai, Swarm Queen (SFD-170 → sfd-170-221) · Champion Unit · Order · 5 Might
 *   "When I attack, you may reveal the top 2 cards of your Main Deck. You may banish one, then play it. If it is a unit,
 *    you may play it here. Recycle the rest."
 *
 * Q: Does Rek'Sai's "When I attack" trigger on a non-combat showdown?
 * A: No. Moving onto an empty battlefield opens a non-combat ("open") showdown: no combat, nobody is an Attacker or
 *    Defender, so the attack trigger does not fire. If an enemy unit then arrives at that battlefield during the open
 *    showdown, a combat begins, Rek'Sai gains the Attacker designation and her ability triggers at that moment.
 * Rules: 383.4.e (attack triggers need the Attacker designation), 340–348 (non-combat showdown), 464.2 (designations).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const REKSAI = "sfd-170-221";
const RIDE_THE_WIND = "ogn-173-298"; // [Action] [2][chaos]: "Move a friendly unit and ready it."
const SKULKER = "ogn-175-298";

/** P1's turn. bf1 is empty and uncontrolled; P2 holds bf2 with a Wall (7). Rek'Sai ready in P1's base; known deck top. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 7, name: "Wall" }, "wall")
    .unit(P1, "base", REKSAI, "reksai")
    .deck(P1, [SKULKER, SKULKER, SKULKER], ["d1", "d2", "d3"]);
}

describe("Ruling 1e14721149a5c8b8 — Rek'Sai's attack trigger needs a COMBAT showdown", () => {
  test("moving Rek'Sai onto the EMPTY bf1 opens a non-combat showdown: no Attacker designation, no 'you may reveal' prompt, no chain item; both pass and P1 simply conquers", async () => {
    const game = await board().build();
    await game.p1.move("reksai", "bf1");
    const d = game.decision();
    expect(d).toMatchObject({ context: "showdown", kind: "action", seat: P1 }); // straight to Focus — nothing triggered
    expect(game.chain()).toEqual([]);
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: false });
    expect(game.state("reksai").combatRole).not.toBe("attacker");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.deck().slice(0, 3)).toEqual(["d1", "d2", "d3"]); // nothing revealed / recycled
    expect(game.p1.banishment()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — moving Rek'Sai onto the enemy-held bf2 opens a COMBAT: she is the Attacker and her 'you may reveal' opt-in is asked at once", async () => {
    const game = await board().build();
    await game.p1.move("reksai", "bf2");
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ attackingPlayer: P1, defendingPlayer: P2, isCombatShowdown: true });
    expect(game.state("reksai").combatRole).toBe("attacker");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "reksai" } });
    await game.p1.no(); // decline: deck untouched, fight proceeds
    await game.settle();
    expect(game.p1.deck().slice(0, 3)).toEqual(["d1", "d2", "d3"]);
  });

  test("an enemy unit arriving at bf1 DURING the open showdown (P2 Rides the Wind with Focus) turns it into a combat: Rek'Sai becomes the Attacker and her trigger fires then", async () => {
    const game = await board()
      .resources(P2, { energy: 2, power: { chaos: 1 } })
      .unit(P2, "base", { might: 2, name: "Interloper" }, "interloper")
      .hand(P2, RIDE_THE_WIND, "ride")
      .build();
    await game.p1.move("reksai", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.chain()).toEqual([]); // still nothing from Rek'Sai
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "ride")).toBe(true);
    await game.p2.cast("ride", { targets: "interloper" });
    // Its destination is chosen at finalization (355.4): bf1. Then both pass and it resolves.
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2, semantics: "destination", timing: "FIN" });
    await game.p2.pick("battlefield-bf1");
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.locationOf("interloper")).toBe("bf1");
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ attackingPlayer: P1, battlefieldId: "bf1", defendingPlayer: P2, isCombatShowdown: true });
    expect(game.state("interloper").combatRole).toBe("defender");
    // Now it is a combat at bf1 with Rek'Sai attacking: her opt-in appears.
    expect(game.state("reksai").combatRole).toBe("attacker");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "reksai", pendingChoiceType: "opt-in" } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "reksai", controller: P1, triggered: true })]);
    expect(game.violations()).toEqual([]);
  });
});
