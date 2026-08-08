/**
 * Reluctant Leader — ven-121-166 · Unit · Order · 4 energy + [order] · 3 Might
 *
 *   When you play another unit, give me +2 [Might] this turn.
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  1. "another": his own arrival never counts (383.4.a.4 — this is not a Play Effect). With two Leaders,
 *     playing Leader B pumps Leader A (+2) but B itself stays 3.
 *  2. "you play": only units his CONTROLLER plays — an opponent's unit play does nothing; a spell or gear
 *     play does nothing; and he must be on the board (a Leader still in hand has no trigger).
 *  3. Tokens are played too (179): Faithful Manufactor = one trigger for the Manufactor and a second one
 *     when its Recruit token is played → 3 + 2 + 2 = 7. Each play is its own chain item, so the +2s stack.
 *  4. It is a triggered ability on the chain: right after the unit is played the Leader is still 3 and the
 *     opponent holds a priority window; the +2 lands only on resolution.
 *  5. "this turn" — everything is gone after the turn ends. Played on the OPPONENT's turn via [Ambush]
 *     (Soulspinner, same domain) while he defends: the +2 applies to THAT combat (3 → 5 turns a lost
 *     battlefield into a held one) and expires with the opponent's turn.
 *  6. Cost: 4 energy + [order]; unaffordable at 3 energy or without the order pip.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-121-166";
const MANUFACTOR = "ogn-211-298"; // Order unit · 3 · "When you play me, play a 1 [Might] Recruit unit token here."
const SOULSPINNER = "ven-123-166"; // Order unit · 3 · 3 Might · [Ambush]
const CHEAP = { energyCost: 1, might: 1, name: "Cheap Recruit" };

function board() {
  return scenario().resources(P1, { energy: 2 }).unit(P1, "base", CARD, "rl").hand(P1, CHEAP, "u1").hand(P1, CHEAP, "u2");
}

describe("Reluctant Leader (ven-121-166)", () => {
  test("cost: 4 energy + [order] for a 3-Might unit that enters base exhausted; his own play does not pump him; short energy / no order pip → unplayable", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { order: 1 } }).hand(P1, CARD, "rl").build();
    await game.p1.play("rl");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.chain()).toHaveLength(0); // "another unit" — no trigger for himself
    await game.settle();
    expect(game.zoneOf("rl")).toBe("base");
    expect(game.state("rl")).toMatchObject({ isExhausted: true, might: 3, mightModifier: 0 });
    expect((await scenario().resources(P1, { energy: 3, power: { order: 2 } }).hand(P1, CARD, "rl").build()).p1.can("play", "rl")).toBe(false);
    expect((await scenario().resources(P1, { energy: 4, power: { chaos: 1 } }).hand(P1, CARD, "rl").build()).p1.can("play", "rl")).toBe(false);
  });

  test("playing another unit puts his trigger on the chain (still 3 while it waits, opponent has a window), then +2 → 5", async () => {
    const game = await board().build();
    await game.p1.play("u1");
    expect(game.zoneOf("u1")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rl", controller: P1, triggered: true })]);
    expect(game.state("rl").might).toBe(3);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect((game.decision() as ActionDecision).context).toBe("chain");
    await game.settle();
    expect(game.state("rl")).toMatchObject({ might: 5, mightModifier: 2 });
    expect(game.state("u1").might).toBe(1); // only "me"
    expect(game.violations()).toEqual([]);
  });

  test("stacks: two unit plays in one turn → 3 + 2 + 2 = 7; 'this turn' → back to 3 once the turn ends", async () => {
    const game = await board().build();
    await game.p1.play("u1");
    await game.settle();
    await game.p1.play("u2");
    await game.settle();
    expect(game.state("rl").might).toBe(7);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("rl")).toMatchObject({ might: 3, mightModifier: 0 });
  });

  test("tokens are played too (179): Faithful Manufactor + its Recruit token = two triggers → 7 Might", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).unit(P1, "base", CARD, "rl").hand(P1, MANUFACTOR, "mf").build();
    await game.p1.play("mf");
    expect(game.chain().map((c) => [c.name, c.triggered])).toEqual([
      ["Faithful Manufactor", true],
      ["Reluctant Leader", true],
    ]);
    await game.acceptTriggerOrder(); // 383.3.d: the two P1 triggers may be ordered — keep the listed order
    for (let i = 0; i < 10 && game.decision()?.kind === "action" && (game.decision() as ActionDecision).context !== "main"; i++) {
      await game.settle();
    }
    expect(game.p1.units("base")).toHaveLength(3); // rl, mf, recruit token
    expect(game.state("rl").might).toBe(7);
  });

  test("two Leaders: playing Leader B pumps Leader A only (A → 5, B stays 3)", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { order: 1 } }).unit(P1, "base", CARD, "a").hand(P1, CARD, "b").build();
    await game.p1.play("b");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "a", triggered: true })]);
    await game.settle();
    expect(game.state("a").might).toBe(5);
    expect(game.state("b").might).toBe(3);
  });

  test("negative space: an opponent playing a unit does not pump my Leader", async () => {
    const game = await scenario().active(P2).resources(P2, { energy: 1 }).unit(P1, "base", CARD, "rl").hand(P2, CHEAP, "theirs").build();
    await game.p2.play("theirs");
    expect(game.chain()).toHaveLength(0);
    await game.settle();
    expect(game.zoneOf("theirs")).toBe("base");
    expect(game.state("rl").might).toBe(3);
  });

  test("negative space: playing a gear or a spell is not 'a unit'", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .unit(P1, "base", CARD, "rl")
      .unit(P2, "base", { might: 2, name: "Dummy" }, "dummy")
      .hand(P1, { cardType: "gear", energyCost: 0, name: "Trinket" }, "gear")
      .hand(P1, { abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, type: "spell" }], cardType: "spell", energyCost: 0, name: "Ping" }, "ping")
      .build();
    await game.p1.play("gear");
    await game.settle();
    expect(game.zoneOf("gear")).toBe("base");
    await game.p1.cast("ping", { targets: "dummy" });
    await game.settle();
    expect(game.state("dummy").damage).toBe(1);
    expect(game.state("rl").might).toBe(3);
  });

  test("negative space: a Leader still in HAND has no trigger — playing a unit while holding him changes nothing and opens no chain item for him", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "rl").hand(P1, CHEAP, "u1").build();
    await game.p1.play("u1");
    expect(game.chain().some((c) => c.cardId === "rl")).toBe(false);
    await game.settle();
    expect(game.zoneOf("rl")).toBe("hand");
    expect(game.state("rl").mightModifier).toBe(0);
  });

  test("[Ambush] on the opponent's turn: Soulspinner played into his showdown while he defends → +2 for THAT combat (4-Might attacker dies, bf1 held), gone when the opponent's turn ends", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "rl")
      .unit(P2, "base", { might: 4, name: "Attacker" }, "atk")
      .hand(P1, SOULSPINNER, "ss")
      .build();
    await game.p2.move("atk", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.p1.can("play", "ss")).toBe(false); // attacker holds Focus first
    await game.p2.pass();
    expect(game.actingSeat()).toBe(P1);
    await game.p1.play("ss", { to: "bf1" });
    expect(game.locationOf("ss")).toBe("bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rl", triggered: true })]);
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.zoneOf("rl")).toBe("battlefield-bf1");
    expect(game.state("rl").might).toBe(5); // still P2's turn
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    await game.advanceTurn(); // P2's turn ends → the +2 expires
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("rl").might).toBe(3);
  });

  test("negative space for the Ambush line: WITHOUT the Soulspinner play the lone 3-Might Leader dies to the 4-Might attacker and bf1 falls", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "rl")
      .unit(P2, "base", { might: 4, name: "Attacker" }, "atk")
      .build();
    await game.p2.move("atk", "bf1");
    await game.settle();
    expect(game.zoneOf("rl")).toBe("trash");
    expect(game.zoneOf("atk")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("parsed abilities: one triggered ability — on a friendly non-self unit play, +2 Might to self for the turn", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "order", energyCost: 4, might: 3, name: "Reluctant Leader", powerCost: ["order"] });
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { amount: 2, duration: "turn", target: "self", type: "modify-might" },
      trigger: { event: "play-unit", on: { controller: "friendly", excludeSelf: true, type: "unit" } },
      type: "triggered",
    });
  });
});
