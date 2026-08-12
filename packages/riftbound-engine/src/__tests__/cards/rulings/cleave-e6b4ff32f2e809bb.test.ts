/**
 * Ruling e6b4ff32f2e809bb — Cleave (OGN-004 → ogn-004-298) · [Action] spell · [1]
 *   "Give a unit [Assault 3] this turn."
 *
 * Q: Are the targets of spells that already RESOLVED this turn public knowledge an opponent must disclose?
 * A: No. Play choices are public only while the spell is on the Chain. Once it resolves, only what is still
 *    visible in the game state (the granted keyword on the unit) is public; the resolved card itself carries no
 *    record of what it chose, so nothing in the position discloses the target after the effect is gone.
 * Rules: 355.10 (choices declared on play), 342 (Chain items and their choices are public), 120 (public vs private info).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, SPECTATOR, scenario } from "../../../harness";

const CLEAVE = "ogn-004-298";

/** P1's turn: two identical friendly units in base, Cleave in hand, [1] available. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 2, name: "Twin" }, "twinA")
    .unit(P1, "base", { might: 2, name: "Twin" }, "twinB")
    .hand(P1, CLEAVE, "cleave")
    .resources(P1, { energy: 1 });
}

async function onChain(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("cleave", { targets: "twinA" });
  return game;
}

describe("Ruling e6b4ff32f2e809bb — a spell's target is public on the Chain and only its visible effect stays public afterwards", () => {
  test("while Cleave is on the Chain its chosen target is public — the OPPONENT's own view names it", async () => {
    const game = await onChain();
    expect(game.view(P2).chain).toEqual([expect.objectContaining({ cardId: "cleave", controller: P1, targets: ["twinA"] })]);
    expect(game.view(P1).chain[0]?.targets).toEqual(["twinA"]);
    expect(game.view(SPECTATOR).chain[0]?.targets).toEqual(["twinA"]);
  });

  test("after it resolves the Chain is empty for everyone — the play choice is no longer carried anywhere public", async () => {
    const game = await onChain();
    await game.settle();
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.view(P2).chain).toEqual([]);
    expect(game.view(P1).chain).toEqual([]);
    // The resolved card in the trash records no target: nothing to disclose from the card itself.
    const meta = game.state("cleave").meta;
    expect(JSON.stringify(meta)).not.toContain("twinA");
  });

  test("what IS still public is the ongoing effect in the game state: the buffed twin shows [Assault 3] to the opponent", async () => {
    const game = await onChain();
    await game.settle();
    expect(game.state("twinA").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    expect(game.state("twinB").grantedKeywords).toEqual([]);
    const seenByOpponent = game.view(P2).zones["base"]?.filter((c) => "id" in c && (c.id === "twinA" || c.id === "twinB"));
    expect(seenByOpponent).toHaveLength(2);
    expect(seenByOpponent?.map((c) => ("keywords" in c ? c.keywords.includes("Assault") : false))).toEqual([true, false]);
  });

  test("once the effect is gone nothing in the position points back at the target: next turn both twins look identical", async () => {
    const game = await onChain();
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("twinA").grantedKeywords).toEqual([]);
    expect(game.state("twinB").grantedKeywords).toEqual([]);
    expect(game.state("twinA").might).toBe(game.state("twinB").might);
    expect(game.zoneOf("cleave")).toBe("trash"); // the fact that Cleave was played (and from where) stays public
    expect(game.violations()).toEqual([]);
  });
});
