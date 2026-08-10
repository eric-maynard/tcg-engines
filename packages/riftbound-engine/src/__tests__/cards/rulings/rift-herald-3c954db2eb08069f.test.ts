/**
 * Ruling 3c954db2eb08069f — Rift Herald (UNL-179 → unl-179-219) · 7 Might "[Deathknell] Play a unit from your hand to
 *     your base, ignoring its Energy cost. (You must still pay its Power cost.)"
 *   × Elder Dragon (UNL-118 → unl-118-219) · 12 + 4×[body] · 10 Might "Any amount of your damage is enough to kill enemy
 *     units. When you play me, choose up to one enemy unit at each location. Deal 1 to them."
 *   × Star-Crossed (UNL-128 → unl-128-219) · Reaction · 3 + [chaos] "Return a friendly unit and an enemy unit to their
 *     owners' hands."   ("Irelia" is not identified by the ruling — a plain 5-Might attacker named Irelia stands in.)
 *
 * Q: I attack 2 Rift Heralds with Irelia and kill both (here: an Action spell in the showdown). Deathknell #1 plays
 *    Elder Dragon; I Star-Cross it. Can he play it again off Deathknell #2? And if Irelia dies to the Dragon's play
 *    ability, does she still conquer?
 * A: (1) Yes — the two Deathknells are independent chain items; after Star-Crossed bounces the Dragon, the second one
 *    still resolves and lets him play a unit from hand (the Dragon is back in hand). (2) No — control/conquer is only
 *    established by the player whose units REMAIN when the showdown/combat concludes; a dead Irelia conquers nothing.
 * Rules: 383 / 326 (independent triggered items, LIFO), 348.2.a (only remaining units establish control), 808.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIFT_HERALD = "unl-179-219";
const ELDER_DRAGON = "unl-118-219";
const STAR_CROSSED = "unl-128-219";
/** [Action] "Deal 3 to all enemy units at a battlefield." (Firestorm's text with Action timing so it is playable in the showdown.) */
const FLASH_FIRE = {
  abilities: [
    {
      effect: { amount: 3, target: { controller: "enemy", location: "battlefield", quantity: "all", type: "unit" }, type: "damage" },
      timing: "action",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "fury",
  energyCost: 6,
  name: "Flash Fire",
  timing: "action",
};
const SQUIRE = { cardType: "unit", energyCost: 2, might: 2, name: "Squire" };

/**
 * P1's turn. P2 holds bf1 with two Rift Heralds already carrying 4 damage each. P1: Irelia (5) and a 1-Might Ally in
 * base, Flash Fire (6) + Star-Crossed (3 + [chaos]) in hand with exactly 9 energy + 1 chaos. P2: Elder Dragon and a
 * Squire in hand, 0 energy and exactly 8 body power (two Dragon Power costs).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 9, power: { chaos: 1 } })
    .resources(P2, { energy: 0, power: { body: 8 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", RIFT_HERALD, "heraldA", { damage: 4 })
    .unit(P2, "bf1", RIFT_HERALD, "heraldB", { damage: 4 })
    .unit(P1, "base", { might: 5, name: "Irelia" }, "irelia")
    .unit(P1, "base", { might: 1, name: "Ally" }, "ally")
    .hand(P2, ELDER_DRAGON, "dragon")
    .hand(P2, SQUIRE, "squire")
    .hand(P1, FLASH_FIRE, "flash")
    .hand(P1, STAR_CROSSED, "starx");
}

const keysOf = (d: Decision | null) => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []);

/** Pass chain priority for whoever holds it while `top` is the topmost chain item (i.e. until it resolves). */
async function passUntilResolved(game: Game, top: string): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain" || game.chain().at(-1)?.cardId !== top) return;
    await game.seat(d.seat).passPriority();
  }
}

/** Answer Elder Dragon's "up to one enemy unit at each location" picks (P2's choices), preferring Irelia. */
async function dragonPicks(game: Game): Promise<void> {
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind !== "pick" || d.seat !== P2) return;
    const keys = keysOf(d);
    if (keys.includes("irelia")) await game.p2.pick("irelia");
    else if (d.allowDecline) await game.p2.decline();
    else await game.p2.pick(keys[0] as string);
  }
}

/** Irelia attacks bf1; in the showdown P1's Flash Fire kills both Heralds at once → two P2 Deathknells on the chain. */
async function bothHeraldsDie(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("irelia", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 }); // attacker has Focus
  await game.p1.cast("flash", { targets: "bf1" });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("heraldA")).toBe("trash");
  expect(game.zoneOf("heraldB")).toBe("trash");
  return game;
}

/** Deathknell #1 resolves: P2 plays Elder Dragon (Power paid, Energy waived); P1 answers its play trigger with Star-Crossed. */
async function dragonPlayedThenStarCrossed(game: Game): Promise<void> {
  await passUntilResolved(game, "heraldB");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
  expect(keysOf(game.decision()).toSorted()).toEqual(["dragon", "squire"]);
  await game.p2.pick("dragon");
  expect(game.zoneOf("dragon")).toBe("base");
  expect(game.p2.resources()).toEqual({ energy: 0, power: { body: 4 } }); // 4×[body] paid, [12] energy ignored
  await dragonPicks(game); // its "When you play me" chooses targets and waits on the chain
  expect(game.chain().map((c) => c.cardId)).toEqual(["heraldA", "dragon"]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  await game.p1.cast("starx", { targets: ["ally", "dragon"] });
  expect(game.chain().map((c) => c.cardId)).toEqual(["heraldA", "dragon", "starx"]);
  await game.p1.passPriority();
  await game.p2.passPriority(); // Star-Crossed resolves first (LIFO)
  expect(game.zoneOf("dragon")).toBe("hand");
  expect(game.zoneOf("ally")).toBe("hand");
  await passUntilResolved(game, "dragon"); // the Dragon's orphaned play trigger resolves (Dragon off-board: 1 damage is not lethal)
  await dragonPicks(game);
  expect(game.zoneOf("irelia")).toBe("battlefield-bf1");
}

describe("Ruling 3c954db2eb08069f — two Rift Herald Deathknells, Elder Dragon, Star-Crossed, and Irelia's conquer", () => {
  test("both Heralds die together → exactly two independent Deathknell items for P2 go on the chain", async () => {
    const game = await bothHeraldsDie();
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "heraldA", controller: P2, triggered: true }),
      expect.objectContaining({ cardId: "heraldB", controller: P2, triggered: true }),
    ]);
  });

  test("Part 1: after Star-Crossed bounces the Dragon played by Deathknell #1, Deathknell #2 still resolves and offers P2 a play from hand — the Elder Dragon (back in hand) included", async () => {
    const game = await bothHeraldsDie();
    await dragonPlayedThenStarCrossed(game);
    // Deathknell #2 (heraldA) is still its own pending item …
    expect(game.chain().map((c) => c.cardId)).toEqual(["heraldA"]);
    await passUntilResolved(game, "heraldA");
    // … and resolving it asks P2 again.
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
    expect(keysOf(game.decision()).toSorted()).toEqual(["dragon", "squire"]);
    await game.p2.pick("squire");
    expect(game.zoneOf("squire")).toBe("base");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { body: 4 } }); // Squire has no Power cost; Energy ignored
  });

  test("Part 2: P2 replays Elder Dragon off Deathknell #2 and its play ability deals 1 to Irelia — lethal ('any amount') — so no P1 unit remains: P1 does NOT conquer bf1 and scores nothing", async () => {
    const game = await bothHeraldsDie();
    await dragonPlayedThenStarCrossed(game);
    await passUntilResolved(game, "heraldA");
    await game.p2.pick("dragon");
    expect(game.zoneOf("dragon")).toBe("base");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await dragonPicks(game); // P2 chooses Irelia at bf1
    await game.settle(); // trigger resolves, showdown closes, combat/cleanup runs
    expect(game.zoneOf("irelia")).toBe("trash");
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("Part 2 control: if P2 plays the harmless Squire instead, Irelia survives as the only unit at bf1 and conquers it (1 point)", async () => {
    const game = await bothHeraldsDie();
    await dragonPlayedThenStarCrossed(game);
    await passUntilResolved(game, "heraldA");
    await game.p2.pick("squire");
    await game.settle();
    expect(game.zoneOf("irelia")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});
