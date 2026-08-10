/**
 * Ruling 1a15cf1dc97177f6 — Rally the Troops (SFD-166 → sfd-166-221) · Spell · Order · [2] · [Action]
 *   "When a friendly unit is played this turn, buff it. Draw 1."
 *   × Forge of the Future (ogn-212-298) · Gear · "When you play this, play a 1 [Might] Recruit unit token at your base."
 *
 * Q: Does Rally the Troops buff Recruit units (tokens)?
 * A: Yes. Rally's turn-long delayed trigger applies to every friendly unit played, tokens included — a played 1-Might
 *    Recruit token gets the +1 buff. A unit can only carry one buff, so a Recruit that would be buffed twice still has one.
 * Rules: 184.1 (Recruit token = unit), 390.2 (delayed trigger), 702.3 / 426.1.b.1 (one buff per unit).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RALLY = "sfd-166-221";
const FORGE = "ogn-212-298";

/** P1's turn with plenty of energy; Rally + Forge in hand; P2 has a bystander so the board isn't empty. */
function board() {
  return scenario()
    .resources(P1, { energy: 10 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Sentinel" }, "sentinel")
    .hand(P1, RALLY, "rally")
    .hand(P1, FORGE, "forge");
}

const recruitsOf = (game: Game) => game.p1.units("base").filter((u) => game.state(u).name === "Recruit");

describe("Ruling 1a15cf1dc97177f6 — Rally the Troops buffs played Recruit tokens", () => {
  test("Rally resolves (draw 1), then Forge of the Future plays a Recruit token: Rally's delayed trigger buffs the token — 1 Might → buffed 2", async () => {
    const game = await board().build();
    const hand = game.p1.hand().length;
    await game.p1.cast("rally");
    await game.settle();
    expect(game.zoneOf("rally")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1); // Draw 1
    await game.p1.play("forge");
    await game.settle({ policy: "first" });
    const recruits = recruitsOf(game);
    expect(recruits).toHaveLength(1);
    const recruit = recruits[0] as string;
    expect(game.state(recruit)).toMatchObject({ baseMight: 1, isBuffed: true, isToken: true, might: 2 });
    expect(game.state("sentinel").isBuffed).toBe(false); // enemy / pre-existing units untouched
    expect(game.violations()).toEqual([]);
  });

  test("control — without Rally the same Recruit token enters as a plain 1-Might unit", async () => {
    const game = await board().build();
    await game.p1.play("forge");
    await game.settle({ policy: "first" });
    const recruits = recruitsOf(game);
    expect(recruits).toHaveLength(1);
    expect(game.state(recruits[0] as string)).toMatchObject({ isBuffed: false, might: 1 });
  });

  test("one buff per unit (702.3): two Rallies this turn both trigger on the Recruit, but it ends with a single buff — exactly 2 Might", async () => {
    const game = await board().hand(P1, RALLY, "rally2").build();
    await game.p1.cast("rally");
    await game.settle();
    await game.p1.cast("rally2");
    await game.settle();
    await game.p1.play("forge");
    await game.settle({ policy: "first" });
    const recruits = recruitsOf(game);
    expect(recruits).toHaveLength(1);
    expect(game.state(recruits[0] as string)).toMatchObject({ isBuffed: true, might: 2 });
  });
});
