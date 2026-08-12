/**
 * Ruling 3fc626654cfb615c — (no specific card) do "when I attack" or "when I defend" triggers go on
 * the chain first?
 *
 * Q: During a combat showdown, which of the attack/defend triggers is put on the chain first?
 * A: "When I attack" triggers go on FIRST (the attacking player, who has Focus, places their triggers
 *    first, then non-defenders in turn order, then the defending player). Because the chain is LIFO,
 *    the "when I defend" triggers therefore RESOLVE first and the attack triggers last.
 * Rules: 464.2.e.1 (attacker places triggers first, defender last), 342.1.a, 340.1 (LIFO resolution),
 *        337.4 (priority to the controller of the next item).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

/** "When I attack, draw 1." */
const HERALD = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "attack", on: "self" }, type: "triggered" }],
  cardType: "unit",
  might: 4,
  name: "Test Herald",
  rulesText: "When I attack, draw 1.",
} as const;

/** "When I defend, draw 1." */
const SENTRY = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "defend", on: "self" }, type: "triggered" }],
  cardType: "unit",
  might: 5,
  name: "Test Sentry",
  rulesText: "When I defend, draw 1.",
} as const;

/** [Reaction] "Deal 1 to a unit." */
const STING = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Sting",
  rulesText: "[Reaction] Deal 1 to a unit.",
  timing: "reaction",
} as const;

function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", SENTRY, "sentry")
    .unit(P1, "base", HERALD, "herald")
    .hand(P2, STING, "psting");
}

describe("Ruling 3fc626654cfb615c — attack triggers are placed first, defend triggers last", () => {
  test("the initial chain is [attack trigger, defend trigger] bottom-to-top: the attacker's item was appended first", async () => {
    const game = await board().build();
    await game.p1.move("herald", "bf1");
    // chain() is bottom-first, so the LAST entry is the newest / top of chain.
    expect(game.chain().map((i) => i.cardId)).toEqual(["herald", "sentry"]);
    expect(game.chain().every((i) => i.triggered)).toBe(true);
    expect(game.chain()[0]).toMatchObject({ controller: P1 });
    expect(game.chain()[1]).toMatchObject({ controller: P2 });
  });

  test("LIFO: the DEFEND trigger resolves first (P2 draws), the ATTACK trigger last (P1 draws)", async () => {
    const game = await board().build();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.p1.move("herald", "bf1");
    expect(game.p1.hand().length).toBe(p1Hand);
    expect(game.p2.hand().length).toBe(p2Hand);
    // 337.4: the controller of the newest item (the defender) has priority on the initial chain.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    await game.p1.passPriority(); // top item (the defend trigger) resolves
    expect(game.p2.hand().length).toBe(p2Hand + 1);
    expect(game.p1.hand().length).toBe(p1Hand); // attack trigger has NOT resolved yet
    expect(game.chain().map((i) => i.cardId)).toEqual(["herald"]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.hand().length).toBe(p1Hand + 1);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("both triggers sit on the SAME initial chain and can be reacted to before either resolves", async () => {
    const game = await board().build();
    await game.p1.move("herald", "bf1");
    expect(game.p2.can("cast", "psting")).toBe(true);
    await game.p2.cast("psting", { targets: "herald" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["herald", "sentry", "psting"]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.state("herald").damage).toBe(1); // the reaction resolved above BOTH triggers
    expect(game.chain().map((i) => i.cardId)).toEqual(["herald", "sentry"]);
    expect(game.violations()).toEqual([]);
  });
});
