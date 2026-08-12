/**
 * Ruling f03e8e8ad6ed283c — Darius, Executioner (OGN-243 → ogn-243-298) · Champion Unit · Order · [6][order] · 6 Might
 *     "[Legion] — When you play me, ready me. · Other friendly units have +1 [Might] here."
 *
 * Q: Darius (6) and a 1-Might unit attack a 7-Might defender. Can they win the battlefield?
 * A: Yes. Darius' aura makes the small unit 2, so 8 beats 7 and the defender dies. If the defender's 7 damage
 *    is split 6 / 1, Darius dies but the small unit survives: combat cleanup HEALS all units before lethal
 *    damage is checked again, so losing Darius' +1 afterwards leaves it at 1 Might with 0 damage — alive, and
 *    it conquers.
 * Rules: 466.1.a.1 (Combat Cleanup step 3c: heal all units), 465.2.c.3 (the damaged side assigns), 428.1
 *        (a unit dies only when marked damage ≥ its Might at a state check), 466.5 (Establish Control).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DARIUS_EXECUTIONER = "ogn-243-298";

/** P1's turn. P2 holds bf1 with a 7-Might Titan. P1's Darius (6) and Pawn (1) stand ready in base. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 7, name: "Titan" }, "titan")
    .unit(P1, "base", DARIUS_EXECUTIONER, "darius")
    .unit(P1, "base", { might: 1, name: "Pawn" }, "pawn");
}

/** Both attack together; P2 is scripted to split the Titan's 7 as 6 onto Darius and 1 onto the Pawn. */
async function attackWithSplit(game: Game): Promise<void> {
  game.script(P2, [
    (d) => (d.kind === "distribute" ? { allocation: { darius: 6, pawn: 1 }, kind: "distribute" } : undefined),
  ]);
  await game.p1.move(["darius", "pawn"], "bf1");
}

describe("Ruling f03e8e8ad6ed283c — Darius' aura wins the combat and the Pawn survives his death", () => {
  test("the aura is live at the battlefield: the Pawn is 2 Might there, Darius himself is unchanged at 6", async () => {
    const game = await board().build();
    await attackWithSplit(game);
    expect(game.state("pawn").might).toBe(2); // "OTHER friendly units have +1 here"
    expect(game.state("darius").might).toBe(6);
    expect(game.state("pawn").combatRole).toBe("attacker");
  });

  test("ruling: 6 + 2 = 8 beats the 7-Might Titan, which dies", async () => {
    const game = await board().build();
    await attackWithSplit(game);
    await game.settle();
    expect(game.zoneOf("titan")).toBe("trash");
  });

  test("ruling: the 7 split 6/1 kills Darius, but the Pawn is healed at combat cleanup before losing the aura — it lives at 1 Might with 0 damage", async () => {
    const game = await board().build();
    await attackWithSplit(game);
    await game.settle();
    expect(game.zoneOf("darius")).toBe("trash");
    expect(game.zoneOf("pawn")).toBe("battlefield-bf1");
    expect(game.state("pawn").damage).toBe(0); // healed …
    expect(game.state("pawn").might).toBe(1); // … and back to its printed Might once the aura is gone
    expect(game.violations()).toEqual([]);
  });

  test("and it conquers: P1 takes bf1 and scores, with the Pawn as the only unit left standing", async () => {
    const game = await board().build();
    await attackWithSplit(game);
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.units("bf1")).toEqual(["pawn"]);
    expect(game.violations()).toEqual([]);
  });
});
