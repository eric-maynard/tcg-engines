/**
 * Ruling 38aab822026b8d2a — Showstopper (OGN-270 → ogn-270-298)
 *   "Buff a friendly unit in your base, then move it to a battlefield."
 *   × Sett, Brawler (ogn-164-298) · 4 Might · "When I'm played and when I conquer, buff me.
 *     Spend my buff: Give me +4 [Might] this turn."
 *
 * Q: When Showstopper buffs Sett, can I spend that buff before Sett moves to the battlefield?
 * A: No. The buff and the move are one resolution — there is no window between them — and once Sett is
 *    at the battlefield the game is in a showdown, where his base-speed activated ability cannot be used.
 * Rules: 359.3 (an instruction sequence resolves without a priority window), 151.2 / 310 (base-speed
 *        abilities need a Neutral Open State).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SHOWSTOPPER = "ogn-270-298";
const SETT_BRAWLER = "ogn-164-298";

function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", SETT_BRAWLER, "sett")
    .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
    .hand(P1, SHOWSTOPPER, "show");
}

describe("Ruling 38aab822026b8d2a — Showstopper's buff cannot be spent before (or during) the move", () => {
  test("there is no window between the buff and the move: while Showstopper is on the Chain, Sett is still unbuffed in base", async () => {
    const game = await board().build();
    expect(game.state("sett").isBuffed).toBe(false);
    expect(game.p1.can("activate", "sett")).toBe(false); // no buff to spend yet

    await game.p1.cast("show", { targets: ["sett"] });
    // Priority windows exist here — but nothing has been buffed or moved.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.state("sett").isBuffed).toBe(false);
    expect(game.locationOf("sett")).toBe("base");
    expect(game.p1.can("activate", "sett")).toBe(false);

    await game.p1.passPriority();
    expect(game.state("sett").isBuffed).toBe(false);
    expect(game.p1.can("activate", "sett")).toBe(false);
  });

  test("after the spell resolves Sett is buffed AND already at the battlefield, in a showdown — the base-speed ability is unavailable", async () => {
    const game = await board().build();
    await game.p1.cast("show", { targets: ["sett"] });
    await game.p1.passPriority();
    await game.p2.passPriority();

    expect(game.state("sett").isBuffed).toBe(true);
    expect(game.locationOf("sett")).toBe("bf1"); // buffed and moved in one go
    expect(game.state("sett").might).toBe(5); // 4 + the +1 buff
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });

    // Sett holds Focus and a buff, yet "Spend my buff" is not offered: it is base speed.
    expect(game.p1.can("activate", "sett")).toBe(false);
    expect(game.p1.legal().map((o) => o.verb)).not.toContain("activate");
    const refused = await game.p1.try((p) => p.activate("sett"));
    expect(refused.ok).toBe(false);
    expect(game.state("sett").might).toBe(5); // still no +4
  });

  test("once the showdown is over and it is a Neutral Open State again, the same ability IS usable", async () => {
    const game = await board().build();
    await game.p1.cast("show", { targets: ["sett"] });
    await game.settle();

    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("sett").isBuffed).toBe(true);
    expect(game.p1.can("activate", "sett")).toBe(true);

    await game.p1.activate("sett");
    await game.settle();
    expect(game.state("sett").isBuffed).toBe(false); // the buff was spent
    expect(game.state("sett").might).toBe(8); // 4 base + 4 this turn
    expect(game.violations()).toEqual([]);
  });
});
