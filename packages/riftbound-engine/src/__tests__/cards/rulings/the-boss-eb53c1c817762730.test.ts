/**
 * Ruling eb53c1c817762730 — The Boss (OGN-269 → ogn-269-298) · Legend · Sett
 *     "If a buffed unit you control would die, you may pay [rainbow], exhaust me, and spend its buff to heal it,
 *      exhaust it, and recall it instead. · When you conquer, ready me."
 *
 * Q: Does Sett, the Boss ready after conquering a battlefield when I used his save during the very showdown that
 *    produced the conquer?
 * A: Yes. The replaced death happens first (in the combat damage step), the Conquer is determined afterwards, and
 *    the conquer trigger then readies the legend that the save had just exhausted.
 * Rules: 371.2/372 (a die-replacement is applied instead of the death), 466.1-466.5 (Combat Cleanup → result →
 *        Establish Control/Conquer, in that order), 383.4 ("when you conquer" triggers on that conquer).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const THE_BOSS = "ogn-269-298";

/**
 * P1's turn with one [rainbow]-payable power. P2 holds bf1 with a 6-Might Titan.
 * P1 attacks with a BUFFED Pawn (2 → 3) and a Bruiser (6); The Boss is P1's ready legend.
 */
function board() {
  return scenario()
    .legend(P1, THE_BOSS, "boss")
    .resources(P1, { power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 6, name: "Titan" }, "titan")
    .unit(P1, "base", { might: 2, name: "Pawn" }, "pawn", { buffed: true })
    .unit(P1, "base", { might: 6, name: "Bruiser" }, "bruiser");
}

/** Both attack; P2 splits the Titan's 6 as 3 onto the Pawn (lethal) and 3 onto the Bruiser. */
async function attack(game: Game): Promise<void> {
  game.script(P2, [
    (d) => (d.kind === "distribute" ? { allocation: { bruiser: 3, pawn: 3 }, kind: "distribute" } : undefined),
  ]);
  await game.p1.move(["pawn", "bruiser"], "bf1");
  expect(game.state("pawn").might).toBe(3); // 2 + its buff
  await game.p1.passFocus();
  await game.p2.passFocus();
}

describe("Ruling eb53c1c817762730 — The Boss's save exhausts him, then the conquer he enabled readies him again", () => {
  test("the save is offered when the buffed Pawn would die to combat damage", async () => {
    const game = await board().build();
    await attack(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "boss" } });
    expect(game.state("boss").isReady).toBe(true); // not yet paid
  });

  test("accepting pays [rainbow], exhausts the legend and spends the buff — the Pawn is healed, exhausted and recalled instead of dying", async () => {
    const game = await board().build();
    await attack(game);
    await game.p1.yes();
    expect(game.p1.power("fury")).toBe(0);
    expect(game.state("boss").isReady).toBe(false); // exhausted as part of the cost
    expect(game.zoneOf("pawn")).not.toBe("trash");
    expect(game.locationOf("pawn")).toBe("base");
    expect(game.state("pawn")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true });
  });

  test("ruling: the replaced death comes first, the conquer after — and the conquer readies the legend the save had exhausted", async () => {
    const game = await board().build();
    await attack(game);
    await game.p1.yes();
    expect(game.state("boss").isReady).toBe(false);
    await game.settle();
    expect(game.zoneOf("titan")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("boss").isReady).toBe(true); // "When you conquer, ready me"
    expect(game.violations()).toEqual([]);
  });

  test("declining the save is the other branch: the Pawn dies, and the Bruiser still conquers (and still readies the untouched legend)", async () => {
    const game = await board().build();
    await attack(game);
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.p1.power("fury")).toBe(1); // nothing paid
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("boss").isReady).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
