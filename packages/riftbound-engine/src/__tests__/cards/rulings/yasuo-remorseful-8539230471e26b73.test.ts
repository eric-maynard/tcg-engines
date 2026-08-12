/**
 * Ruling 8539230471e26b73 — a "when I attack / when I defend" trigger on a unit that JOINS a combat
 *   already in progress.
 *   Cards: Yasuo, Remorseful (OGN-076 → ogn-076-298) · 6 [Might] "When I attack, deal damage equal to
 *     my Might to an enemy unit here."
 *   × inline [Reaction] "Move a friendly unit to a battlefield" for each side, plus an inline
 *     "When I defend, draw 1" unit for the defending half.
 *
 * Q: If such a unit is moved into a combat after the combat has started, does the trigger fire?
 * A: Yes. "When I attack / defend" fires the first time the unit gains the Attacker / Defender
 *    designation in that combat, whenever it joins.
 * Rules: 464.2.c.3 (designations are stamped as a unit joins a combat), 383.4.e.2.a (an attack
 *    trigger fires once per combat, on gaining the designation).
 */
import { describe, expect, test } from "bun:test";
import type { Game, InlineCardDef } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const YASUO_REMORSEFUL = "ogn-076-298";

const march = (name: string): InlineCardDef => ({
  abilities: [
    {
      effect: { target: { controller: "friendly", type: "unit" }, to: { battlefield: "any" }, type: "move" },
      timing: "reaction",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "calm",
  energyCost: 0,
  keywords: ["Reaction"],
  name,
  rulesText: "[Reaction] Move a friendly unit to a battlefield.",
  timing: "reaction",
});

/** "When I defend, draw 1." */
const WATCHDOG: InlineCardDef = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "defend", on: "self" }, type: "triggered" }],
  cardType: "unit",
  energyCost: 0,
  might: 3,
  name: "Filler Watchdog",
  rulesText: "When I defend, draw 1.",
};

/** P2 holds bf1 with a big picket; P1 opens the combat with a small raider and holds Yasuo in base. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 9, name: "Picket" }, "picket")
    .unit(P1, "base", { might: 1, name: "Raider" }, "raider")
    .unit(P1, "base", YASUO_REMORSEFUL, "yasuo")
    .unit(P2, "base", WATCHDOG, "dog")
    .hand(P1, march("Filler March P1"), "march1")
    .hand(P2, march("Filler March P2"), "march2")
    .deck(P2, ["ogn-175-298", "ogn-175-298"], ["e1", "e2"]);
}

/** P1 attacks with the raider only; Yasuo is still in base, so nothing of his has triggered. */
async function combatStarted(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("raider", "bf1");
  expect(game.state("raider").combatRole).toBe("attacker");
  expect(game.state("yasuo").combatRole).toBe(null);
  expect(game.state("picket").damage).toBe(0);
  return game;
}

describe("Ruling 8539230471e26b73 — joining a combat late still fires the attack/defend trigger", () => {
  test("before Yasuo joins, his 'when I attack' has not fired", async () => {
    const game = await combatStarted();
    expect(game.chain()).toEqual([]);
    expect(game.state("picket").damage).toBe(0);
  });

  test("marching Yasuo into the running combat makes him an ATTACKER and puts his trigger on the chain", async () => {
    const game = await combatStarted();
    await game.p1.cast("march1", { answers: ["battlefield-bf1"], targets: "yasuo" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // the march resolves — Yasuo arrives
    expect(game.locationOf("yasuo")).toBe("bf1");
    expect(game.state("yasuo").combatRole).toBe("attacker");
    expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo"]);
    expect(game.chain()[0]).toMatchObject({ controller: P1, triggered: true });
  });

  test("the trigger resolves for real: 6 damage (his Might) onto the enemy unit here", async () => {
    const game = await combatStarted();
    await game.p1.cast("march1", { answers: ["battlefield-bf1"], targets: "yasuo" });
    while (game.chain().length > 0) {
      await game.acting().passPriority();
    }
    expect(game.state("picket").damage).toBe(6);
    expect(game.chain()).toEqual([]);
  });

  test("it fires only ONCE per combat — no second Yasuo item appears, and the combat then plays out normally", async () => {
    const game = await combatStarted();
    await game.p1.cast("march1", { answers: ["battlefield-bf1"], targets: "yasuo" });
    while (game.chain().length > 0) {
      await game.acting().passPriority();
    }
    expect(game.state("yasuo").combatRole).toBe("attacker");
    expect(game.chain().filter((c) => c.cardId === "yasuo")).toEqual([]);
    await game.settle();
    // 6 from the trigger + 7 combat damage kills the 9-Might picket; its own 9 damage kills both
    // attackers, so nobody is left standing and bf1 ends Uncontrolled (466.5.b).
    expect(game.zoneOf("picket")).toBe("trash");
    expect(game.zoneOf("yasuo")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBe(null);
  });

  test("the DEFENDING half works the same: a unit brought in mid-combat gains Defender and its trigger fires", async () => {
    const game = await combatStarted();
    await game.p1.cast("march1", { answers: ["battlefield-bf1"], targets: "yasuo" }); // gives P2 a window
    await game.p1.passPriority();
    const handBefore = game.p2.hand().length;
    await game.p2.cast("march2", { answers: ["battlefield-bf1"], targets: "dog" });
    await game.settle();
    expect(game.locationOf("dog")).toBe("bf1");
    expect(game.state("dog").combatRole).toBe("defender");
    expect(game.p2.hand().length).toBe(handBefore - 1 + 1); // spell spent, "when I defend" drew 1
    expect(game.violations()).toEqual([]);
  });
});
