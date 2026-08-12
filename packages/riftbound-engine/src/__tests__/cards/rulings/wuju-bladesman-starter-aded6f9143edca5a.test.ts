/**
 * Ruling aded6f9143edca5a — Wuju Bladesman - Starter (OGS-019 → ogs-019-024) · Legend (Yi)
 *   "While a friendly unit defends alone, it gets +2 [Might]."
 *
 * Q: Is Yi's Legend ability (which uses "while" language) a trigger or a passive?
 * A: A passive. "While …" abilities are continuous: the bonus applies exactly whenever the condition is
 *    true and stops the instant it stops being true. Nothing goes on the chain, and a second friendly unit
 *    in the showdown makes the lone defender no longer alone, so the +2 is gone.
 * Rules: 364.1/364.3 (Static abilities apply continuously, no chain item), 383.1 (triggers use the chain).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const WUJU_BLADESMAN = "ogs-019-024";

/** P1's turn. P2 defends bf1 with `defenders` units and has Yi as their Legend. */
function board(extraDefender: boolean) {
  const b = scenario()
    .battlefield("bf1", { controller: P2 })
    .legend(P2, WUJU_BLADESMAN, "yi")
    .unit(P2, "bf1", { might: 3, name: "Lone Blade" }, "blade")
    .unit(P1, "base", { might: 2, name: "Raider" }, "raider");
  return extraDefender ? b.unit(P2, "bf1", { might: 3, name: "Second Blade" }, "blade2") : b;
}

describe("Ruling aded6f9143edca5a — Yi's 'while' ability is a passive, re-read continuously", () => {
  test("out of combat the condition is false: the defender is a plain 3 Might and no chain item exists", async () => {
    const game = await board(false).build();
    expect(game.state("blade").might).toBe(3);
    expect(game.chain()).toEqual([]);
  });

  test("ruling: the instant it defends alone the +2 is simply there — nothing was put on the chain", async () => {
    const game = await board(false).build();
    await game.p1.move("raider", "bf1");
    expect(game.state("blade").combatRole).toBe("defender");
    expect(game.state("blade").might).toBe(5);
    expect(game.chain()).toEqual([]); // a passive, not a trigger
  });

  test("nuance: with TWO units on Yi's side in the showdown neither defends alone, so nobody gets +2", async () => {
    const game = await board(true).build();
    await game.p1.move("raider", "bf1");
    expect(game.state("blade").combatRole).toBe("defender");
    expect(game.state("blade2").combatRole).toBe("defender");
    expect(game.state("blade").might).toBe(3);
    expect(game.state("blade2").might).toBe(3);
  });

  test("ruling: because it is passive and not a locked-in trigger, the bonus APPEARS mid-showdown as soon as the second defender is gone", async () => {
    const game = await board(true)
      // A Reaction that removes the second defender while the showdown is running.
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .hand(P1, "ogn-169-298", "gust") // Gust: return a unit at a battlefield with 3 Might or less to hand
      .build();
    await game.p1.move("raider", "bf1");
    expect(game.state("blade").might).toBe(3);

    await game.p1.cast("gust", { targets: "blade2" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Gust resolves; blade is now the only defender

    expect(game.zoneOf("blade2")).toBe("hand");
    expect(game.state("blade").might).toBe(5); // the passive re-read the board
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("ruling: and it DISAPPEARS again the moment the condition stops holding (combat ends, no more defending)", async () => {
    const game = await board(false).build();
    await game.p1.move("raider", "bf1");
    expect(game.state("blade").might).toBe(5);
    await game.settle(); // combat resolves: Raider (2) dies to the 5-Might lone defender
    expect(game.state("blade").combatRole).not.toBe("defender");
    expect(game.state("blade").might).toBe(3);
  });
});
