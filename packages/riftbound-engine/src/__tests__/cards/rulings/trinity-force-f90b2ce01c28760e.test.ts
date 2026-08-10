/**
 * Ruling f90b2ce01c28760e — Trinity Force (SFD-115 → sfd-115-221) · Equipment "[Equip] [body]. When I hold, score 1 point."
 *   × Skyfall of Areion (SFD-030 → sfd-030-221) · Equipment "[Equip] [1][fury]. My hold effects are also conquer effects, and vice versa."
 *
 * Q: I'm at 6 points (victory 8) and conquer a battlefield with a unit wearing Trinity Force + Skyfall. Do I win?
 * A: Yes. The conquer scores 6 → 7 (the "last point from a conquer needs every battlefield" restriction does not bite at 6).
 *    Skyfall makes Trinity Force's hold trigger a conquer trigger too, so it goes on the chain; when it resolves you score
 *    7 → 8 and win — points from a triggered ability are not subject to the final-point conquer restriction.
 * Rules: 466.1.b.2 (final-point conquer restriction applies only to the conquer's own point), 441–446 (scoring), 719/136.2.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const TRINITY_FORCE = "sfd-115-221";
const SKYFALL = "sfd-030-221";

/** P1 at 6 of 8. Two battlefields (so a plain conquer could NOT give the 8th point). "Lucian" (2) wears Trinity Force + Skyfall in base. */
function board() {
  return scenario()
    .victoryScore(8)
    .points(P1, 6)
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 3, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 2, name: "Lucian" }, "lucian", { equippedWith: ["tf", "sky"] })
    .card("tf", { def: TRINITY_FORCE, meta: { attachedTo: "lucian" }, owner: P1, zone: "base" })
    .card("sky", { def: SKYFALL, meta: { attachedTo: "lucian" }, owner: P1, zone: "base" })
    .unit(P2, "base", { might: 1, name: "Bystander" }, "bystander");
}

describe("Ruling f90b2ce01c28760e — at 6, conquering with Trinity Force + Skyfall wins (7 from the conquer, 8 from the trigger)", () => {
  test("step 1 — the conquer itself scores 6 → 7 and puts Trinity Force's (now-conquer) trigger on the chain; the game is not over yet", async () => {
    const game = await board().build();
    expect(game.state("lucian")).toMatchObject({ attachments: expect.arrayContaining(["tf", "sky"]), might: 6 });
    await game.p1.move("lucian", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.chain()).toEqual([expect.objectContaining({ controller: P1, triggered: true })]);
  });

  test("step 2 — the trigger resolves: 7 → 8 and P1 WINS (a triggered ability's point bypasses the final-point conquer restriction, 466.1.b.2)", async () => {
    const game = await board().build();
    await game.p1.move("lucian", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — the restriction is real for the conquer's OWN point: at 7 with bf2 unscored, the same conquer scores nothing itself; only the Trinity Force trigger takes P1 to 8", async () => {
    const game = await board().points(P1, 7).build();
    await game.p1.move("lucian", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(7); // conquer point withheld (not every battlefield scored this turn)
    expect(game.isOver()).toBe(false);
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.winner()).toBe(P1);
  });
});
