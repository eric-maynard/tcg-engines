/**
 * Overt Operation — ogn-153-298 · Spell · Body · 5 energy + [body][body] · Action
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   For each friendly unit, you may spend its buff to ready it. Then buff all friendly units.
 *   (Each one that doesn't have a buff gets a +1 [Might] buff.)
 *
 * Rules: 702.2.b (spending a buff removes the counter), 426.1.b (buff = one counter, +1 Might),
 * Action timing (Neutral Open on your turn, or Showdown Open on any turn).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-153-298";
// Inline 0-cost "Buff a unit." spell so the buff goes through the real effect pipeline.
const BUFF = {
  abilities: [{ effect: { target: { type: "unit" }, type: "buff" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Buff",
  timing: "action",
};

/** P1: "bt" buffed+exhausted, "pt" plain+exhausted (both played this turn); P2: "foe" in base. */
async function board() {
  const game = await scenario()
    .resources(P1, { energy: 5, power: { body: 2 } })
    .unit(P2, "base", { might: 2, name: "Enemy" }, "foe")
    .hand(P1, { energyCost: 0, might: 2, name: "Buffed Tired" }, "bt")
    .hand(P1, { energyCost: 0, might: 2, name: "Plain Tired" }, "pt")
    .hand(P1, BUFF, "buff")
    .hand(P1, CARD, "oo")
    .build();
  await game.p1.play("bt");
  await game.settle();
  await game.p1.play("pt");
  await game.settle();
  await game.p1.cast("buff", { targets: "bt" });
  await game.settle();
  expect(game.state("bt")).toMatchObject({ isBuffed: true, isExhausted: true, might: 3 });
  expect(game.state("pt")).toMatchObject({ isBuffed: false, isExhausted: true, might: 2 });
  return game;
}

describe("Overt Operation (ogn-153-298)", () => {
  test("cost: 5 energy + 2 body; goes to trash; unaffordable with 1 body or 4 energy", async () => {
    const game = await board();
    await game.p1.cast("oo");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    game.script(P1, ["no", "decline", "no", "decline"]);
    await game.settle();
    expect(game.zoneOf("oo")).toBe("trash");
    const lowPower = await scenario().resources(P1, { energy: 5, power: { body: 1 } }).unit(P1, "base", { might: 1 }).hand(P1, CARD, "oo").build();
    expect(lowPower.p1.can("cast", "oo")).toBe(false);
    const lowEnergy = await scenario().resources(P1, { energy: 4, power: { body: 2 } }).unit(P1, "base", { might: 1 }).hand(P1, CARD, "oo").build();
    expect(lowEnergy.p1.can("cast", "oo")).toBe(false);
  });

  test("Then buff all friendly units: every friendly unit ends up with exactly one buff; enemies get none", async () => {
    const game = await board();
    await game.p1.cast("oo");
    game.script(P1, ["bt"]);
    await game.settle();
    expect(game.state("pt").isBuffed).toBe(true);
    expect(game.state("pt").might).toBe(3);
    expect(game.state("bt").isBuffed).toBe(true);
    expect(game.state("bt").might).toBe(3);
    expect(game.state("foe").isBuffed).toBe(false);
    expect(game.state("foe").might).toBe(2);
  });

  test("'you may spend its buff' must be a real choice — a prompt is expected for the buffed unit (auto-applied today)", async () => {
    // Expected: after both players pass, P1 is asked whether to spend bt's buff (yes/no or pick).
    // Actual: `optional` effects auto-apply, so the spell fully resolves with no prompt.
    const game = await board();
    await game.p1.cast("oo");
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d?.seat).toBe(P1);
    expect(d?.kind === "yes-no" || d?.kind === "pick").toBe(true);
  });

  test("accepting the spend: the buffed exhausted unit is readied and ends re-buffed; the unbuffed one stays exhausted", async () => {
    const game = await board();
    await game.p1.cast("oo");
    game.script(P1, ["bt"]);
    await game.settle();
    expect(game.state("bt").isReady).toBe(true);
    expect(game.state("bt").isBuffed).toBe(true); // spent, then re-buffed by the second sentence
    expect(game.state("pt").isExhausted).toBe(true); // had no buff to spend
    expect(game.state("foe").isReady).toBe(true); // untouched enemy (placed ready)
  });

  test("declining the spend leaves the buffed unit exhausted (the option is auto-taken today)", async () => {
    // Expected: answering "no" keeps bt exhausted and buffed. Actual: no prompt; bt is readied.
    const game = await board();
    await game.p1.cast("oo");
    game.script(P1, ["no", "decline", "no", "decline"]);
    await game.settle();
    expect(game.state("bt").isExhausted).toBe(true);
    expect(game.state("bt").isBuffed).toBe(true);
  });

  test("'For each friendly unit' is a per-unit choice — spending one of two buffs readies only that unit", async () => {
    // rule 355.13 — the offer is made once per friendly unit, so a subset is a
    // legal answer; it must not be one all-or-nothing yes/no over every buff.
    const game = await scenario()
      .resources(P1, { energy: 5, power: { body: 2 } })
      .hand(P1, { energyCost: 0, might: 2, name: "A" }, "a")
      .hand(P1, { energyCost: 0, might: 2, name: "B" }, "b")
      .hand(P1, BUFF, "buffA")
      .hand(P1, BUFF, "buffB")
      .hand(P1, CARD, "oo")
      .build();
    await game.p1.play("a");
    await game.settle();
    await game.p1.play("b");
    await game.settle();
    await game.p1.cast("buffA", { targets: "a" });
    await game.settle();
    await game.p1.cast("buffB", { targets: "b" });
    await game.settle();
    expect(game.state("a")).toMatchObject({ isBuffed: true, isExhausted: true });
    expect(game.state("b")).toMatchObject({ isBuffed: true, isExhausted: true });

    await game.p1.cast("oo");
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d?.seat).toBe(P1);
    expect(d?.kind).toBe("pick");
    game.script(P1, ["a"]);
    await game.settle();
    expect(game.state("a").isReady).toBe(true);
    expect(game.state("b").isExhausted).toBe(true);
    // "Then buff all friendly units" still runs after the pick.
    expect(game.state("a").isBuffed).toBe(true);
    expect(game.state("b").isBuffed).toBe(true);
  });

  test("Action timing: not playable on the opponent's turn outside a showdown", async () => {
    const game = await scenario().active(P2).resources(P1, { energy: 5, power: { body: 2 } }).unit(P1, "base", { might: 1 }).hand(P1, CARD, "oo").build();
    expect(game.p1.can("cast", "oo")).toBe(false);
  });

  test("Action timing: playable during a showdown on the opponent's turn", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 5, power: { body: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 5 }, "def")
      .unit(P2, "base", { might: 1 }, "atk")
      .hand(P1, CARD, "oo")
      .build();
    await game.p2.move("atk", "bf1");
    await game.p2.passFocus();
    expect(game.p1.can("cast", "oo")).toBe(true);
    await game.p1.cast("oo");
    game.script(P1, ["no", "decline"]);
    await game.settle();
    expect(game.zoneOf("oo")).toBe("trash");
    expect(game.state("def").isBuffed).toBe(true);
  });
});
