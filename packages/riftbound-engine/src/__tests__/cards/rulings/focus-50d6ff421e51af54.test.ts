/**
 * Ruling 50d6ff421e51af54 — (no specific card) who holds Focus after a chain resolves in a showdown.
 *
 * Q: I'm the attacker and play a spell on my Focus. After it resolves and I pass, do I get Focus again
 *    because I played a card on my first Focus?
 * A: No. After a NON-INITIAL chain empties, Focus moves automatically to the next player — you do not
 *    pass it, and you do not keep it. Only the Initial Chain (the "When I attack"/"When I defend"
 *    triggers) hands Focus back to the attacker.
 * Rules: 346 (chain empties in a showdown ⇒ Focus passes), 347 / 355.2.a (an Action spell needs Focus),
 *        464.2.d / 465.1 (the Initial Chain of a combat, then the attacker gets Focus).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

/** [Action] "Give a unit +2 [Might] this turn." */
const RALLY = {
  abilities: [
    { effect: { amount: 2, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "action", type: "spell" },
  ],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Rally",
  rulesText: "[Action] Give a unit +2 [Might] this turn.",
  timing: "action",
} as const;

const YASUO = "ogn-076-298"; // "When I attack, deal damage equal to my Might to an enemy unit here."

describe("Ruling 50d6ff421e51af54 — a resolved non-initial chain hands Focus to the other player, not back to its caster", () => {
  test("attacker casts an Action on their Focus; when that chain empties Focus is the DEFENDER's and the attacker cannot start another chain", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
      .unit(P1, "base", { might: 2, name: "Raider" }, "raider")
      .hand(P1, RALLY, "r1")
      .hand(P1, RALLY, "r2")
      .build();
    await game.p1.move("raider", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 }); // attacker has Focus first
    await game.p1.cast("r1", { targets: "raider" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // chain resolves and empties
    expect(game.state("raider").might).toBe(4);
    expect(game.chain()).toEqual([]);
    // The attacker never gets to "pass" Focus here — it has already moved.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p1.can("cast", "r2")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("…and it keeps alternating: P2 passing Focus back lets P1 act again, one chain at a time", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
      .unit(P1, "base", { might: 2, name: "Raider" }, "raider")
      .hand(P1, RALLY, "r1")
      .hand(P1, RALLY, "r2")
      .build();
    await game.p1.move("raider", "bf1");
    await game.p1.cast("r1", { targets: "raider" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "r2")).toBe(true);
  });

  test("the exception: the INITIAL chain (the \"When I attack\" trigger) resolves and Focus lands on the ATTACKER", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
      .unit(P1, "base", YASUO, "yasuo")
      .build();
    await game.p1.move("yasuo", "bf1");
    expect(game.chain().map((i) => i.cardId)).toEqual(["yasuo"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // the initial chain resolves
    expect(game.chain()).toEqual([]);
    expect(game.state("wall").damage).toBe(6);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });
});
