/**
 * Ruling 8b77faa8cb9e0a20 — Yasuo, Remorseful (OGN-076 → ogn-076-298) · Unit · Calm · [6][calm][calm] · 6 Might
 *     "When I attack, deal damage equal to my Might to an enemy unit here."
 *
 * Q: Does Yasuo's damage resolve before combat damage, so that a unit it kills never deals its own combat damage?
 * A: Yes. Attack/defend triggers go on the Chain when the combat showdown begins and resolve there; combat damage is
 *    only dealt once everyone has passed and the combat resolves. A unit killed by the trigger is gone by then and
 *    deals nothing.
 * Rules: 464.4 (attack/defend triggers are put on the Chain at the start of the showdown), 465.2 (combat damage is
 *        dealt in the Combat Damage step, after the showdown closes), 461.1 (Combat Cleanup).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const YASUO_REMORSEFUL = "ogn-076-298";

/** P1's turn. P2 holds bf1 with a single defender of `defenderMight`. Yasuo (6) waits in P1's base. */
function board(defenderMight: number) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: defenderMight, name: "Defender" }, "def")
    .unit(P1, "base", YASUO_REMORSEFUL, "yasuo");
}

/** Pass priority until the chain empties. */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else if (d?.kind === "pick") {
      await game.seat(d.seat).pick(d.options[0]!.key);
    } else {
      return;
    }
  }
}

describe("Ruling 8b77faa8cb9e0a20 — Yasuo's attack trigger resolves before any combat damage is exchanged", () => {
  test("the trigger is a Chain item that goes up when the showdown begins — no damage has been exchanged at that point", async () => {
    const game = await board(6).build();
    await game.p1.move("yasuo", "bf1");
    expect(game.state("yasuo").combatRole).toBe("attacker");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", controller: P1, triggered: true })]);
    expect(game.state("yasuo").damage).toBe(0);
    expect(game.state("def").damage).toBe(0);
  });

  test("ruling 8b77faa8cb9e0a20 — a 6-Might defender dies to the trigger's 6 and therefore deals NO combat damage back: Yasuo ends the combat undamaged and conquers", async () => {
    const game = await board(6).build();
    await game.p1.move("yasuo", "bf1");
    await drainChain(game);
    expect(game.zoneOf("def")).toBe("trash"); // killed by the trigger, before combat damage
    expect(game.state("yasuo").damage).toBe(0);
    await game.settle();
    expect(game.zoneOf("yasuo")).toBe("battlefield-bf1");
    expect(game.state("yasuo").damage).toBe(0);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — a 13-Might defender survives the 6 (and the 6 of combat) and DOES deal its combat damage: Yasuo takes 13 and dies", async () => {
    const game = await board(13).build();
    await game.p1.move("yasuo", "bf1");
    await drainChain(game);
    expect(game.zoneOf("def")).toBe("battlefield-bf1");
    expect(game.state("def").damage).toBe(6);
    await game.settle();
    expect(game.zoneOf("yasuo")).toBe("trash");
    expect(game.zoneOf("def")).toBe("battlefield-bf1"); // 6 + 6 < 13
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
