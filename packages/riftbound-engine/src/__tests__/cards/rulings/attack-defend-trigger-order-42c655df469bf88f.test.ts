/**
 * Ruling 42c655df469bf88f — (no specific card) do attack triggers or defend triggers go first?
 *   Exercised with inline units "When I attack, deal 1 to a unit" / "When I defend, deal 1 to a unit".
 *
 * Q: During a combat showdown, does my defend trigger or my attack trigger go first?
 * A: The ATTACKER's triggers are put on the initial chain first, the DEFENDER's last. The chain is
 *    LIFO, so the defender's triggers RESOLVE first. Because the defender controls the newest item,
 *    the defender also gets priority first. Several triggers of one player are ordered by that player.
 * Rules: 459.2.d.1 (attacker first, defender last), 340.1 (LIFO), 312.2.c (priority), 383.3.d (own order).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

/** "When I attack, deal 1 to a unit." */
const RAIDER = {
  abilities: [
    {
      effect: { amount: 1, target: { type: "unit" }, type: "damage" },
      trigger: { event: "attack", on: "self" },
      type: "triggered",
    },
  ],
  cardType: "unit",
  might: 4,
  name: "Test Raider",
  rulesText: "When I attack, deal 1 to a unit.",
} as const;

/** "When I defend, deal 1 to a unit." */
const SENTINEL = {
  abilities: [
    {
      effect: { amount: 1, target: { type: "unit" }, type: "damage" },
      trigger: { event: "defend", on: "self" },
      type: "triggered",
    },
  ],
  cardType: "unit",
  might: 6,
  name: "Test Sentinel",
  rulesText: "When I defend, deal 1 to a unit.",
} as const;

describe("Ruling 42c655df469bf88f — attack triggers are placed first, defend triggers last, so DEFEND resolves first", () => {
  test("the initial combat chain is [attacker's trigger, defender's trigger] and the defender holds priority", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", SENTINEL, "sentinel")
      .unit(P1, "base", RAIDER, "raider")
      .unit(P1, "base", { might: 9, name: "Dummy P1" }, "dummy1")
      .unit(P2, "base", { might: 9, name: "Dummy P2" }, "dummy2")
      .build();
    await game.p1.move("raider", "bf1");
    // Both triggers are finalized (their targets named by their own controllers) before anyone
    // gets priority — P1 aims at P2's dummy, P2 at P1's dummy, so the two are told apart later.
    for (let guard = 0; guard < 4 && game.decision()?.timing === "FIN"; guard += 1) {
      const d = game.decision();
      if (!d) break;
      await game.seat(d.seat).pick(d.seat === P1 ? "dummy2" : "dummy1");
    }
    // Bottom of the chain first: the attacker's trigger was added before the defender's.
    expect(game.chain().map((i) => ({ by: i.controller, card: i.cardId }))).toEqual([
      { by: P1, card: "raider" },
      { by: P2, card: "sentinel" },
    ]);
    // Newest item = the defender's ⇒ its controller gets priority first (312.2.c).
    expect(game.decision()).toMatchObject({ kind: "action", seat: P2 });

    // Both pass → only the TOP (defend) item resolves; the attack trigger is still waiting.
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain().map((i) => i.cardId)).toEqual(["raider"]);
    expect(game.state("dummy1").damage).toBe(1); // the DEFEND trigger has landed
    expect(game.state("dummy2").damage).toBe(0); // …the attack trigger has not

    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("dummy2").damage).toBe(1); // now the attack trigger resolved, second
    expect(game.violations()).toEqual([]);
  });

  test("with no defend trigger the attacker's trigger is the only (and newest) item, so the ATTACKER gets priority", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 6, name: "Wall" }, "wall")
      .unit(P1, "base", RAIDER, "raider")
      .unit(P2, "base", { might: 9, name: "Dummy P2" }, "dummy2")
      .build();
    await game.p1.move("raider", "bf1");
    if (game.decision()?.timing === "FIN") {
      await game.p1.pick("dummy2");
    }
    expect(game.chain().map((i) => i.cardId)).toEqual(["raider"]);
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1 });
  });
});
