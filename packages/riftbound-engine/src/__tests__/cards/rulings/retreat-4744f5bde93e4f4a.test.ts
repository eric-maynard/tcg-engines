/**
 * Ruling 4744f5bde93e4f4a — Retreat (OGN-104 → ogn-104-298) · Spell · [1] · [Reaction]
 *   "Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted."
 *
 * Q: If I cast Retreat on a token, do I still channel a rune even though nothing ends up in my hand?
 * A: Yes. The token is sent out of play and then ceases to exist; the second instruction is not conditional on
 *    a card actually arriving in hand, so its owner still channels 1 rune exhausted.
 * Rules: 186.1 (a token ceases to exist once it leaves the board), 359 (each instruction executes in order),
 *        428 (return to hand), 623 (channel).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RETREAT = "ogn-104-298";

/** P1's turn: a 1-Might Recruit token and a printed Grunt in P1's base, Retreat + [1] in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .unit(P1, "base", { isToken: true, might: 1, name: "Recruit" }, "tok")
    .unit(P1, "base", { might: 2, name: "Grunt" }, "grunt")
    .hand(P1, RETREAT, "retreat");
}

const runeCount = (g: Awaited<ReturnType<ReturnType<typeof board>["build"]>>) => g.p1.runes().length;

describe("Ruling 4744f5bde93e4f4a — Retreat on a token still channels the rune", () => {
  test("setup: the token is a real board object before Retreat", async () => {
    const game = await board().build();
    expect(game.state("tok")).toMatchObject({ isToken: true, location: "base", might: 1 });
    expect(game.has("tok")).toBe(true);
  });

  test("ruling: the token goes out of play and ceases to exist — it never reaches the hand", async () => {
    const game = await board().build();
    await game.p1.cast("retreat", { targets: "tok" });
    await game.settle();
    expect(game.p1.hand()).not.toContain("tok");
    expect(game.zoneOf("tok")).toBe("gone");
    expect(game.has("tok")).toBe(false);
    expect(game.p1.units("base")).toEqual(["grunt"]);
  });

  test("ruling: its owner still channels 1 rune, exhausted", async () => {
    const game = await board().build();
    const before = runeCount(game);
    const readyBefore = game.p1.runes({ ready: true }).length;
    await game.p1.cast("retreat", { targets: "tok" });
    await game.settle();
    expect(runeCount(game)).toBe(before + 1);
    expect(game.p1.runes({ ready: true }).length).toBe(readyBefore); // the new rune arrived exhausted
    expect(game.zoneOf("retreat")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("baseline: on a printed unit the same Retreat puts the card in hand AND channels the exhausted rune", async () => {
    const game = await board().build();
    const before = runeCount(game);
    const readyBefore = game.p1.runes({ ready: true }).length;
    await game.p1.cast("retreat", { targets: "grunt" });
    await game.settle();
    expect(game.zoneOf("grunt")).toBe("hand");
    expect(runeCount(game)).toBe(before + 1);
    expect(game.p1.runes({ ready: true }).length).toBe(readyBefore);
    expect(game.violations()).toEqual([]);
  });
});
