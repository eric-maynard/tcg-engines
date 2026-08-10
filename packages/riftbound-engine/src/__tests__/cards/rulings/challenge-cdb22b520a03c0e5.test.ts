/**
 * Ruling cdb22b520a03c0e5 — Challenge (OGN-128 → ogn-128-298) · Spell · [Action] · Body · 2 + [body]
 *     "Choose a friendly unit and an enemy unit. They deal damage equal to their Mights to each other."
 *   × The Boss (Sett legend, ogn-269-298 — "Sett's ability") "If a buffed unit you control would die, you may pay
 *     [rainbow], exhaust me, and spend its buff to heal it, exhaust it, and recall it instead."
 *
 * Q: I Challenge with my buffed unit and an enemy unit; the opponent responds with a (Reaction) removal spell on my
 *    buffed unit; I save it with Sett's ability. Does Challenge still resolve?
 * A: Yes — the unit never left the board (its death was replaced by a recall), so it is still a legal choice and
 *    Challenge resolves.
 * Rules: 372–373 (replacement: the unit is recalled instead of dying — same object, still on the board), 359.3.e.14
 *        (an item only fizzles for targets that became illegal), 340 (LIFO: the Reaction resolves first).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHALLENGE = "ogn-128-298";
const THE_BOSS = "ogn-269-298";
/** The opponent's Reaction-speed removal: 4 damage to a unit. */
const ZAP = {
  abilities: [{ effect: { amount: 4, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 2,
  name: "Zap",
  timing: "reaction",
} as const;

/**
 * P1's turn. P1: The Boss (ready), buffed Pal (3 + 1 = 4) at bf1, Challenge in hand, exactly 2 + [body] + the [rainbow]
 * for The Boss. P2: Foe (2) in base, Zap + 2 energy.
 */
function board() {
  return scenario()
    .legend(P1, THE_BOSS, "boss")
    .resources(P1, { energy: 2, power: { body: 1, rainbow: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Pal" }, "pal", { buffed: true })
    .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
    .hand(P1, CHALLENGE, "challenge")
    .hand(P2, ZAP, "zap");
}

/** Challenge [pal, foe] → P1 passes → P2 Zaps Pal → both pass → Zap resolves (lethal) → The Boss asks P1. */
async function upToBossPrompt(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("challenge", { targets: ["pal", "foe"] });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "challenge", targets: ["pal", "foe"] })]);
  await game.p1.passPriority();
  await game.p2.cast("zap", { targets: "pal" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["challenge", "zap"]);
  await game.p2.passPriority();
  await game.p1.passPriority(); // Zap resolves first (LIFO): 4 damage to the 4-Might Pal — it would die
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "boss" } });
  return game;
}

describe("Ruling cdb22b520a03c0e5 — a unit saved by Sett's ability is still there for Challenge to resolve", () => {
  test("P1 accepts The Boss: Pal does not die — it is healed, unbuffed, exhausted and recalled to base — and Challenge is STILL on the chain naming Pal and Foe", async () => {
    const game = await upToBossPrompt();
    await game.p1.yes();
    expect(game.zoneOf("pal")).toBe("base");
    expect(game.state("pal")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true, might: 3 });
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.p1.power("rainbow")).toBe(0);
    expect(game.zoneOf("zap")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "challenge", targets: ["pal", "foe"] })]);
  });

  test("Challenge then resolves normally: Pal (now 3) and Foe (2) deal their Might to each other — Foe dies, Pal takes 2 and lives", async () => {
    const game = await upToBossPrompt();
    await game.p1.yes();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("challenge")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.zoneOf("pal")).toBe("base");
    expect(game.state("pal").damage).toBe(2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — P1 declines The Boss: Pal dies to Zap, and Challenge, its friendly choice gone, deals nothing to Foe", async () => {
    const game = await upToBossPrompt();
    await game.p1.no();
    expect(game.zoneOf("pal")).toBe("trash");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("challenge")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("base");
    expect(game.state("foe").damage).toBe(0);
  });
});
