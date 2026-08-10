/**
 * Ruling 640af2e2627367c3 — Rek'Sai, Swarm Queen (SFD-170 → sfd-170-221) · Champion Unit · Order · [5][order] · 5 Might
 *   "When I attack, you may reveal the top 2 cards of your Main Deck. You may banish one, then play it. If it is a unit,
 *    you may play it here. Recycle the rest."
 *   × Ride the Wind (ogn-173-298, [Action] [2][chaos]) "Move a friendly unit and ready it." — how the opponent's unit arrives later
 *
 * Q: When Rek'Sai attempts to conquer an EMPTY battlefield, does her ability trigger to play a unit there?
 * A: No. Moving to an unoccupied battlefield opens a non-combat ("open") showdown: there is no combat, nobody has the
 *    Attacker designation, so "When I attack" does not trigger. If an opponent's unit later becomes present there
 *    during that showdown, it becomes a combat showdown, Rek'Sai gains Attacker THEN, and the ability triggers.
 * Rules: 383.4.e (attack triggers on gaining the Attacker designation in a combat), 344/345 (showdown at an empty
 *        battlefield), 464.1–464.2 (a combat opening in an ongoing showdown; the contester is the Attacker).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REKSAI_SWARM_QUEEN = "sfd-170-221";
const RIDE_THE_WIND = "ogn-173-298";
const SKULKER = "ogn-175-298";

/** P1's turn 3. bf1 is empty and uncontrolled. Rek'Sai ready in P1's base with a known deck of Skulkers ([3] each, P1 has [3]); P2: Guard (2) in base, Ride the Wind + [2][chaos]. */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 3 })
    .resources(P2, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 1, name: "Holder" }, "holder")
    .unit(P2, "base", { might: 2, name: "Guard" }, "guard")
    .unit(P1, "base", REKSAI_SWARM_QUEEN, "reksai")
    .hand(P2, RIDE_THE_WIND, "ride")
    .deck(P1, [SKULKER, SKULKER, SKULKER], ["d1", "d2", "d3"]);
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

describe("Ruling 640af2e2627367c3 — Rek'Sai's 'When I attack' does not trigger on a move to an empty battlefield", () => {
  test("moving Rek'Sai to the empty bf1 opens an OPEN (non-combat) showdown: no Attacker designation, nothing on the chain, no 'reveal?' question, deck untouched", async () => {
    const game = await board().build();
    await game.p1.move("reksai", "bf1");
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: false });
    expect(game.state("reksai").combatRole).toBeFalsy();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 }); // Focus, not a yes/no
    expect(game.p1.deck().slice(0, 3)).toEqual(["d1", "d2", "d3"]);
  });

  test("if nobody interferes the showdown closes and Rek'Sai simply conquers bf1 — still no trigger ever fired", async () => {
    const game = await board().build();
    await game.p1.move("reksai", "bf1");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.deck().slice(0, 3)).toEqual(["d1", "d2", "d3"]);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("but if P2 (with Focus) Rides the Guard INTO bf1 during that showdown, a combat opens: Rek'Sai gains Attacker now and her trigger goes on the chain (the 'reveal?' opt-in is asked)", async () => {
    const game = await board().build();
    await game.p1.move("reksai", "bf1");
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.cast("ride", { targets: "guard" });
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 }); // destination, chosen with the spell
    await game.p2.pick("battlefield-bf1");
    await game.p2.passPriority();
    await game.p1.passPriority(); // Ride the Wind resolves: the Guard arrives at bf1
    expect(game.locationOf("guard")).toBe("bf1");
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.state("reksai").combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "reksai" }, timing: "FIN" });
    await game.p1.yes();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "reksai", controller: P1, triggered: true })]);
  });

  test("…accepting it reveals the top 2 (a declinable pick from d1/d2); declining the pick recycles both, and Rek'Sai (5) then beats the Guard (2) to conquer", async () => {
    const game = await board().build();
    await game.p1.move("reksai", "bf1");
    await game.p1.passFocus();
    await game.p2.cast("ride", { targets: "guard" });
    await game.p2.pick("battlefield-bf1");
    await game.p2.passPriority();
    await game.p1.passPriority();
    await game.p1.yes();
    while (game.chain().length > 0 && game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["d1", "d2"]);
    await game.p1.decline();
    await game.settle();
    expect(game.p1.deck()[0]).toBe("d3");
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
