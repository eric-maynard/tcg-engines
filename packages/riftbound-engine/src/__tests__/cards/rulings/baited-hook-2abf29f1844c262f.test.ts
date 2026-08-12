/**
 * Ruling 2abf29f1844c262f — Baited Hook (OGN-242 → ogn-242-298) · Order gear · [3]
 *   "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 cards of your Main Deck. You may banish a
 *    unit from among them that has Might up to 1 more than the killed unit and play it, ignoring its cost.
 *    Then recycle the rest."
 *
 * Q: If I Hook my LAST unit at a battlefield, can I still play the found unit to that battlefield?
 * A: Yes. A battlefield only becomes uncontrolled when it is empty during an Open State, and the game is in a
 *    Closed State for the whole resolution of the ability, so control is locked while the battlefield is
 *    momentarily empty. The replacement unit lands there and you keep control.
 * Rules: 187.4.c / 323.6 (control lapses only at an Open-State cleanup), 401.1 (resolution is a Closed State).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BAITED_HOOK = "ogn-242-298";

const unitDef = (might: number, name: string) => ({ cardType: "unit", energyCost: might, might, name });

/** P1's turn with [1][order] and a ready Baited Hook. P1's ONLY unit is a 3-Might Pawn holding bf1. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, "bf1", unitDef(3, "Pawn"), "pawn")
    .deck(P1, [unitDef(3, "Recruit"), unitDef(9, "Giant"), unitDef(9, "Titan"), unitDef(9, "Colossus"), unitDef(9, "Wyrm")], [
      "recruit",
      "giant",
      "titan",
      "colossus",
      "wyrm",
    ]);
}

const options = (d: Decision | null) => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : ["<not a pick>"]);

/** Activate the Hook; the Pawn is the only friendly unit, so it is killed and the look prompt opens. */
async function hook(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.units("bf1")).toEqual(["pawn"]);
  await game.p1.activate("hook", 0);
  await game.settle();
  expect(game.zoneOf("pawn")).toBe("trash");
  expect(game.p1.units("bf1")).toEqual([]); // bf1 is momentarily empty …
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // … but control is locked (Closed State)
  return game;
}

describe("Ruling 2abf29f1844c262f — Baited Hook's own kill cannot cost you the battlefield mid-resolution", () => {
  test("the look prompt offers the 3-Might Recruit and the just-emptied bf1 is still P1's", async () => {
    const game = await hook();
    expect(options(game.decision())).toContain("recruit");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("ruling: the Recruit can be played straight to the emptied battlefield, and P1 keeps control there", async () => {
    const game = await hook();
    await game.p1.pick("recruit");
    const dest = game.decision();
    expect(dest).toMatchObject({ kind: "pick", seat: P1 });
    expect(options(dest)).toContain("battlefield-bf1"); // "a battlefield you control" — still true
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    expect(game.zoneOf("recruit")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } }); // played ignoring its cost
    expect(game.violations()).toEqual([]);
  });

  test("contrast: declining the pick leaves bf1 empty, and control still was not lost while the ability resolved", async () => {
    const game = await hook();
    await game.p1.decline();
    await game.settle();
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // control was never lost during the resolution
    expect(game.violations()).toEqual([]);
  });

  test("the base is offered as a destination too — the ruling permits the battlefield, it does not force it", async () => {
    const game = await hook();
    await game.p1.pick("recruit");
    expect(options(game.decision())).toContain("base");
    await game.p1.pick("base");
    await game.settle();
    expect(game.zoneOf("recruit")).toBe("base");
    expect(game.p1.units("bf1")).toEqual([]);
  });
});
