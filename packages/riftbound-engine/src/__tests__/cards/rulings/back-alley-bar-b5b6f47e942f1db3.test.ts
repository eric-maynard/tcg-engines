/**
 * Ruling b5b6f47e942f1db3 — Back-Alley Bar (OGN-277 → ogn-277-298) · Battlefield
 *   "When a unit moves from here, give it +1 [Might] this turn."
 *   × "Flight or Fight" — not in this card pool; modelled inline as a [Reaction] "Move a friendly unit to
 *     your base." (the ruling only needs a spell that pulls an attacker home).
 *
 * Q: A 4-Might attacker with [Assault 1] (so 5 in combat) is marked with 4 damage and is then returned to
 *    base. Does it die from losing [Assault] before Back-Alley Bar's +1 can save it?
 * A: Yes, it dies. The spell resolves; in the first Cleanup the Bar's ability is FINALIZED (put on the chain,
 *    not yet resolved) at the same time as the unit loses its attacker designation — and losing that
 *    designation loops into a second Cleanup, where the unit is a plain 4 Might carrying 4 damage and dies.
 *    The Bar's +1 arrives too late.
 * Rules: 318/323 (Cleanups; a change during one loops into another), 465.2.c.4 ([Assault] raises the lethal
 *        threshold only while the unit is an attacker), 383.3 (a trigger is finalized before it resolves).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BACK_ALLEY_BAR = "ogn-277-298";

/** [Reaction] "Move a friendly unit to your base." — the stand-in for Flight or Fight. */
const FLIGHT_OR_FIGHT = {
  abilities: [
    { effect: { target: { controller: "friendly", type: "unit" }, to: "base", type: "move" }, timing: "reaction", type: "spell" },
  ],
  cardType: "spell",
  energyCost: 1,
  name: "Flight or Fight",
  rulesText: "[Reaction] Move a friendly unit to your base.",
  timing: "reaction",
} as const;

/** [Reaction] "Deal 4 to a unit." — how the attacker picks up its 4 marked damage. */
const BOLT4 = {
  abilities: [{ effect: { amount: 4, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  energyCost: 1,
  name: "Test Bolt (deal 4)",
  timing: "reaction",
} as const;

/** [Reaction] "Deal 3 to a unit." — the survivable version of the same hit. */
const BOLT3 = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  energyCost: 1,
  name: "Test Bolt (deal 3)",
  timing: "reaction",
} as const;

const CHAMP = {
  abilities: [{ keyword: "Assault", type: "keyword", value: 1 }],
  cardType: "unit",
  energyCost: 4,
  might: 4,
  name: "Champ",
} as const;

/** P1's turn: the 4-Might [Assault 1] Champ attacks the Back-Alley Bar, held by P2's 9-Might Bouncer. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 1 })
    .battlefield("bar", { controller: P2, def: BACK_ALLEY_BAR, inert: false })
    .unit(P2, "bar", { might: 9, name: "Bouncer" }, "bouncer")
    .unit(P1, "base", CHAMP, "champ")
    .hand(P1, FLIGHT_OR_FIGHT, "fof")
    .hand(P2, BOLT4, "bolt");
}

async function drain(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    await game.acting().pass();
  }
}

/** Attack, take 4 damage while [Assault 1] keeps the Champ alive, and stop with P1 holding Focus. */
async function attackAndMark(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("champ", "bar");
  expect(game.state("champ").combatRole).toBe("attacker");
  await game.p1.passFocus();
  await game.p2.cast("bolt", { targets: "champ" });
  await drain(game);
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || (d.seat === P1 && game.p1.can("cast", "fof"))) {
      break;
    }
    await game.seat(d.seat).pass();
  }
  return game;
}

describe("Ruling b5b6f47e942f1db3 — pulled out of the attack, the Champ loses [Assault] and dies before the Bar's +1", () => {
  test("premise: while attacking, [Assault 1] makes it a 5 — 4 marked damage is not lethal", async () => {
    const game = await attackAndMark();
    expect(game.zoneOf("champ")).toBe("battlefield-bar");
    expect(game.state("champ")).toMatchObject({ combatRole: "attacker", damage: 4, might: 5 });
  });

  test("ruling: Flight or Fight resolves and the Champ dies — losing the attacker designation drops it to 4 Might with 4 damage", async () => {
    const game = await attackAndMark();
    await game.p1.cast("fof", { targets: "champ" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Flight or Fight resolves
    expect(game.zoneOf("champ")).toBe("trash");
  });

  test("ruling: the Bar's 'when a unit moves from here' ability DID trigger — but it is still on the chain, unresolved, when the unit dies", async () => {
    const game = await attackAndMark();
    await game.p1.cast("fof", { targets: "champ" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain().map((c) => c.cardId)).toEqual(["bar"]);
    expect(game.chain()[0]).toMatchObject({ triggered: true });
    expect(game.zoneOf("champ")).toBe("trash"); // already dead in the Cleanup before that trigger resolves
  });

  test("ruling: the +1 never lands — the Champ ends the sequence in the trash with no Might modifier", async () => {
    const game = await attackAndMark();
    await game.p1.cast("fof", { targets: "champ" });
    await drain(game);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("champ")).toBe("trash");
    expect(game.state("champ").mightModifier).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: with only 3 marked damage the same rescue works — 3 < 4 Might, and the Bar's +1 does land", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .resources(P2, { energy: 1 })
      .battlefield("bar", { controller: P2, def: BACK_ALLEY_BAR, inert: false })
      .unit(P2, "bar", { might: 9, name: "Bouncer" }, "bouncer")
      .unit(P1, "base", CHAMP, "champ")
      .hand(P1, FLIGHT_OR_FIGHT, "fof")
      .hand(P2, BOLT3, "bolt")
      .build();
    await game.p1.move("champ", "bar");
    await game.p1.passFocus();
    await game.p2.cast("bolt", { targets: "champ" });
    await drain(game);
    expect(game.state("champ").damage).toBe(3);
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (!d || d.kind !== "action" || (d.seat === P1 && game.p1.can("cast", "fof"))) {
        break;
      }
      await game.seat(d.seat).pass();
    }
    await game.p1.cast("fof", { targets: "champ" });
    await drain(game);
    expect(game.zoneOf("champ")).toBe("base");
    expect(game.state("champ").mightModifier).toBe(1); // the Bar's +1 reached a unit that was still alive
  });
});
