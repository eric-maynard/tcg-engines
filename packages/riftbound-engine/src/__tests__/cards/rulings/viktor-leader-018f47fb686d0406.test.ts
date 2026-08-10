/**
 * Ruling 018f47fb686d0406 — (no card id scraped; the card is) Viktor, Leader (OGN-246 → ogn-246-298) · Unit · Order · 4 · 4 Might
 *   "When another non-Recruit unit you control dies, play a 1 [Might] Recruit unit token into your base."
 *
 * Q: Does Viktor trigger if he dies during a battle together with other units?
 * A: No. Viktor must be alive (on the board) to "see" the other units die; dying in the same combat damage step as
 *    them, his ability does not trigger — no Recruit.
 * Rules: 383.4 (a triggered ability must exist on the board when its condition is met), 465.2.d (combat damage is dealt
 *        simultaneously ⇒ simultaneous deaths).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VIKTOR_LEADER = "ogn-246-298";

/** P1's turn. P2 holds bf1 with a 7-Might Wall. P1: Viktor, Leader (4) and a 2-Might Ally ready in base. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 7, name: "Wall" }, "wall")
    .unit(P1, "base", VIKTOR_LEADER, "viktor")
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally");
}

const recruits = (game: Game) => game.findAll({ name: "Recruit", owner: P1 }).filter((id) => game.zoneOf(id) !== "gone");

describe("Ruling 018f47fb686d0406 — Viktor, Leader dying alongside other units does not trigger", () => {
  test("Viktor (4) + Ally (2) attack the 7-Might Wall: the Wall's 7 is lethal on both, they die TOGETHER — Viktor is not around to see the Ally die, so no Recruit token is played", async () => {
    const game = await board().build();
    await game.p1.move(["viktor", "ally"], "bf1");
    await game.settle();
    expect(game.zoneOf("viktor")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("battlefield-bf1"); // 6 < 7
    expect(recruits(game)).toEqual([]);
    expect(game.p1.units()).toEqual([]);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — Viktor stays home and only the Ally dies in that combat: Viktor is alive to see it and plays a 1-Might Recruit token into P1's base", async () => {
    const game = await board().build();
    await game.p1.move("ally", "bf1");
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.zoneOf("viktor")).toBe("base");
    const toks = recruits(game);
    expect(toks).toHaveLength(1);
    expect(game.state(toks[0] as string)).toMatchObject({ isToken: true, might: 1, zone: "base" });
    expect(game.violations()).toEqual([]);
  });
});
