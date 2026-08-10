/**
 * Ruling 48b7f4e0ca8a1f27 — Wages of Pain (SFD-070 → sfd-070-221) · Spell · Mind · 3 · [Hidden][Action]
 *     "Deal 3 to a unit at a battlefield. Play a Gold gear token exhausted."
 *   × Bellows Breath (SFD-080 → sfd-080-221) · Spell · Mind · 1+[mind] · [Action][Repeat] "Deal 1 to up to three
 *     units at the same location."
 *
 * Q: The opponent moves to an empty battlefield I don't control; I have NO units at all. May I still play Action
 *    spells (Wages of Pain / Bellows Breath) on their unit in that non-combat showdown?
 * A: Yes. A Non-Combat Showdown is a Showdown: the mover gets Focus first, then it passes to you regardless of whether
 *    you have units; with Focus you may play Action spells, and their moved unit is a legal target. Each spell closes
 *    the state, so the opponent can answer only with Reactions.
 * Rules: 344.2 (non-combat showdown), 345/347 (Focus passes to each player), 806.1.b (Action timing), 336 (closed).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WAGES_OF_PAIN = "sfd-070-221";
const BELLOWS_BREATH = "sfd-080-221";
const PUNCH_FIRST = "sfd-097-221"; // P1's Action spell (1 + [body][body])
/** P1's Reaction spell (1): a vanilla "draw 1" so its legality depends only on timing. */
const TRICK = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 1,
  name: "Trick",
  timing: "reaction",
} as const;

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** P1's turn. P2 has NO units, holds Wages + Bellows with 4 energy + 1 mind. P1's Rover (4) walks onto empty bf1. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { body: 2 } })
    .resources(P2, { energy: 4, power: { mind: 1 } })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 4, name: "Rover" }, "rover")
    .hand(P1, PUNCH_FIRST, "punch")
    .hand(P1, TRICK, "trick")
    .hand(P2, WAGES_OF_PAIN, "wages")
    .hand(P2, BELLOWS_BREATH, "bellows");
}

async function roverWalksInAndP1PassesFocus(): Promise<Game> {
  const game = await board().build();
  expect(game.p2.units()).toEqual([]);
  await game.p1.move("rover", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", focusPlayer: P1, isCombatShowdown: false });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 }); // mover has Focus first
  await game.p1.passFocus();
  return game;
}

describe("Ruling 48b7f4e0ca8a1f27 — a unit-less player still gets Focus in a non-combat showdown and may play Action spells", () => {
  test("after the mover passes, Focus goes to P2 (zero units on board) and both Wages of Pain and Bellows Breath are playable, each offering the moved Rover as a target", async () => {
    const game = await roverWalksInAndP1PassesFocus();
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P2 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "wages")).toBe(true);
    expect(game.p2.can("cast", "bellows")).toBe(true);
    const targetsOf = (alias: string) =>
      new Set((game.p2.option("cast", alias)?.fields.find((f) => f.arg === "targets")?.options ?? []).flat() as string[]);
    expect(targetsOf("wages")).toContain("rover");
    expect(targetsOf("bellows")).toContain("rover");
  });

  test("Wages of Pain on Rover: while it is on the chain P1 may answer only with a Reaction (a Reaction yes, Punch First no); it resolves for 3 damage and P2 gets an exhausted Gold token", async () => {
    const game = await roverWalksInAndP1PassesFocus();
    await game.p2.cast("wages", { targets: "rover" });
    expect(game.p2.resources()).toEqual({ energy: 1, power: { mind: 1 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "wages", controller: P2, targets: ["rover"] })]);
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "trick")).toBe(true);
    expect(game.p1.can("cast", "punch")).toBe(false);
    await game.p1.passPriority();
    expect(game.zoneOf("wages")).toBe("trash");
    expect(game.state("rover").damage).toBe(3);
    const gold = game.p2.gear();
    expect(gold).toHaveLength(1);
    expect(game.state(gold[0]!)).toMatchObject({ isExhausted: true, isToken: true, name: "Gold" });
  });

  test("Bellows Breath works the same way with no friendly units: 1 damage to Rover", async () => {
    const game = await roverWalksInAndP1PassesFocus();
    await game.p2.cast("bellows", { targets: ["rover"] });
    expect(game.p2.resources()).toEqual({ energy: 3, power: { mind: 0 } });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("bellows")).toBe("trash");
    expect(game.state("rover").damage).toBe(1);
    // The showdown then closes normally once everyone passes; Rover (undamaged enough) conquers bf1.
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
