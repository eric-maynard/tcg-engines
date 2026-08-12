/**
 * Ruling ef0f1b58f290b5d5 — Red Brambleback (UNL-029 → unl-029-219) · Unit · Fury · [4][fury] · 4 Might
 *     "[Accelerate] [1][fury] · Your conquer effects for conquering here trigger an additional time.
 *      When I conquer, [Buff] a friendly unit."
 *
 * Q: Can Red Brambleback buff himself?
 * A: Yes. His trigger says "a friendly unit" with no exclusion, and he is a unit you control, so he is one of
 *    its legal choices. (Only one buff sticks: his own doubler makes the trigger happen twice, and the second
 *    buff is not placed on an already-buffed unit.)
 * Rules: 355.10 (any object matching the descriptor is choosable; "another" would be needed to exclude self),
 *        702.3/702.3.a (one Buff per unit), 383.3.d (the doubled trigger is a second, separate chain item).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RED_BRAMBLEBACK = "unl-029-219";

/** P1's turn. bf1 is open; Brambleback (4) is ready in P1's base next to a Buddy (2). */
function board() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 2, name: "Watch" }, "watch")
    .unit(P1, "base", RED_BRAMBLEBACK, "bramble")
    .unit(P1, "base", { might: 2, name: "Buddy" }, "buddy");
}

/** Walk into the empty bf1 and stop at the conquer trigger's "buff a friendly unit" pick. */
async function conquerAndStop(game: Game): Promise<void> {
  await game.p1.move("bramble", "bf1");
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (d?.kind === "pick") {
      return;
    }
    if (d?.kind === "action") {
      await game.seat(d.seat).pass();
      continue;
    }
    break;
  }
}

describe("Ruling ef0f1b58f290b5d5 — Red Brambleback is a legal choice for his own conquer buff", () => {
  test("ruling: the 'buff a friendly unit' pick offers Brambleback himself alongside the Buddy back in base", async () => {
    const game = await board().build();
    await conquerAndStop(game);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(offered).toContain("bramble");
    expect(offered).toContain("buddy");
  });

  test("choosing himself works: he ends the conquer buffed, at 5 Might, with the Buddy untouched", async () => {
    const game = await board().build();
    await conquerAndStop(game);
    game.script(P1, ["bramble", "bramble"]); // his own doubler fires the trigger a second time
    await game.p1.pick("bramble");
    await game.settle();
    expect(game.state("bramble").isBuffed).toBe(true);
    expect(game.state("bramble").might).toBe(5); // 4 + one buff — the doubled trigger adds no second buff
    expect(game.state("buddy").isBuffed).toBe(false);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("the other choice is open too: the buff can go to the Buddy in base instead", async () => {
    const game = await board().build();
    await conquerAndStop(game);
    game.script(P1, ["buddy", "buddy"]);
    await game.p1.pick("buddy");
    await game.settle();
    expect(game.state("buddy").isBuffed).toBe(true);
    expect(game.state("buddy").might).toBe(3);
    expect(game.state("bramble").isBuffed).toBe(false);
    expect(game.state("bramble").might).toBe(4);
  });

  test("the doubler is real: conquering here produces TWO buff triggers, so both units can end up buffed", async () => {
    const game = await board().build();
    await conquerAndStop(game);
    game.script(P1, ["buddy"]);
    await game.p1.pick("bramble");
    await game.settle();
    expect(game.state("bramble").isBuffed).toBe(true);
    expect(game.state("buddy").isBuffed).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
