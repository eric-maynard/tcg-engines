/**
 * Ruling 328e80b3107199cf — Downstage Dramatics (UNL-061 → unl-061-219) · Reaction spell · Mind · [2]
 *     "[Repeat] [2] (You may pay the additional cost to repeat this spell's effect.) Draw 1."
 *   × Jhin, Meticulous Killer (UNL-089 → unl-089-219) · Champion unit · Mind · [4] · 4 Might
 *     "[Vision] … If you've spent [4] or more to play a spell this turn, you may play me for [mind]."
 *
 * Q: If I play Downstage Dramatics paying its Repeat cost, can I then play Jhin for his alternative [mind] cost?
 * A: Yes. Base [2] + Repeat [2] = [4] spent to play one spell; that satisfies Jhin's condition for the rest of
 *    the turn regardless of how the spell resolves, so Jhin may be played for just [mind].
 * Rules: 356.1 (alternative cost), 820 (Repeat is an additional cost paid as the spell is played), 355.1 (total cost).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const DOWNSTAGE_DRAMATICS = "unl-061-219";
const JHIN = "unl-089-219";

/** P1's turn with exactly [4] + [mind]: Downstage Dramatics and Jhin in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { mind: 1 } })
    .hand(P1, DOWNSTAGE_DRAMATICS, "dd")
    .hand(P1, JHIN, "jhin");
}

describe("Ruling 328e80b3107199cf — Downstage Dramatics with Repeat ([2]+[2]=[4]) unlocks Jhin's [mind] alternative cost", () => {
  test("paying the Repeat cost spends 4 energy in total to play the spell (2 base + 2 Repeat) and it draws twice", async () => {
    const game = await board().build();
    const hand0 = game.p1.hand().length;
    await game.p1.cast("dd", { repeat: 1 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 1 } }); // all 4 spent on ONE spell
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dd", controller: P1 })]);
    await game.settle();
    expect(game.zoneOf("dd")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 2);
  });

  test("afterwards, with 0 energy and only [mind] left, Jhin is playable — via his alternative cost — and playing him spends exactly that [mind]", async () => {
    const game = await board().build();
    await game.p1.cast("dd", { repeat: 1 });
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.can("play", "jhin")).toBe(true);
    await game.p1.play("jhin");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.zoneOf("jhin")).toBe("base");
    await game.settle();
    if (game.decision()?.kind !== "action") {
      await game.p1.decline(); // Vision: may recycle the looked-at card — keep it
      await game.settle();
    }
    expect(game.zoneOf("jhin")).toBe("base");
    // The harness's generic `costPaid` invariant only knows the printed [4]; an alternative cost is expected here.
    expect(game.violations().filter((v) => v.invariant !== "costPaid")).toEqual([]);
  });

  test("contrast — Downstage Dramatics WITHOUT Repeat spends only [2]: the condition is unmet, and with [2]+[mind] left Jhin (printed [4]) cannot be played at all", async () => {
    const game = await board().build();
    await game.p1.cast("dd");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { mind: 1 } });
    await game.settle();
    expect(game.p1.can("play", "jhin")).toBe(false);
  });
});
