/**
 * Ruling 482496ae2f7432b0 — Iron Ballista (OGN-017 → ogn-017-298, "[Exhaust]: Deal 2 to a unit at a
 *   battlefield") × LeBlanc, Fragmented (UNL-172 → unl-172-219, "[Deathknell][>] Draw 1…").
 *
 * Q: What is an "activated ability", and how does it differ from a triggered one?
 * A: An activated ability is written [Cost]: [Effect]; YOU choose when to use it, by default only in
 *    your own Main Phase in an Open State, and it goes on the chain like a spell (Closed State, priority
 *    window). A triggered ability is written "When…/At…/The Nth time…"; nobody chooses it — the game
 *    puts it on the chain the moment its condition is met, on any turn, in any state, and it is
 *    mandatory unless the card says "you may".
 * Rules: 376–378 / 381 (activated abilities: format, who decides, default timing), 382–383 (triggered
 *        abilities fire on their condition), 333 / 337 / 340 (chain + priority).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BALLISTA = "ogn-017-298";
const LEBLANC = "unl-172-219"; // 3 Might · [Deathknell] Draw 1

/** [Action] "Deal 3 to a unit." — P2's removal. */
const BOLT3 = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Bolt 3",
  rulesText: "[Action] Deal 3 to a unit.",
  timing: "action",
} as const;

describe("Ruling 482496ae2f7432b0 — activated abilities are chosen and timed; triggered abilities are automatic", () => {
  test("ACTIVATED: it is an option on P1's own menu, the cost is paid on activation, and it opens a priority window", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Guard" }, "guard")
      .gear(P1, BALLISTA, "ballista")
      .build();
    expect(game.p1.can("activate", "ballista")).toBe(true);
    await game.p1.activate("ballista");
    expect(game.state("ballista").isExhausted).toBe(true); // [Exhaust] was the cost
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ballista", triggered: false })]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("ACTIVATED timing: on the OPPONENT's turn the same ability is not available, even with a legal target on the board", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Guard" }, "guard")
      .gear(P1, BALLISTA, "ballista")
      .build();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.can("activate", "ballista")).toBe(false);
    const refused = await game.p1.try((p) => p.activate("ballista"));
    expect(refused.ok).toBe(false);
    expect(game.state("ballista").isExhausted).toBe(false);
  });

  test("TRIGGERED: nobody activates it — LeBlanc's [Deathknell] is never an option on any menu", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .unit(P1, "base", LEBLANC, "lb")
      .hand(P2, BOLT3, "bolt")
      .build();
    expect(game.p1.can("activate", "lb")).toBe(false);
    expect(game.p1.legal().some((o) => o.card === "lb")).toBe(false);
  });

  test("TRIGGERED: it fires by itself on the OPPONENT's turn, in a Closed State, with no \"you may\" to answer", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .unit(P1, "base", LEBLANC, "lb")
      .hand(P2, BOLT3, "bolt")
      .build();
    const handBefore = game.p1.hand().length;
    await game.p2.cast("bolt", { targets: "lb" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // the Bolt resolves, LeBlanc dies
    expect(game.zoneOf("lb")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lb", controller: P1, triggered: true })]);
    expect(game.decision()?.kind).not.toBe("yes-no"); // mandatory: nothing is asked
    await game.settle();
    expect(game.p1.hand()).toHaveLength(handBefore + 1); // the draw happened on P2's turn
    expect(game.violations()).toEqual([]);
  });
});
