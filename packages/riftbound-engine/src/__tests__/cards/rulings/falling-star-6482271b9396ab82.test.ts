/**
 * Ruling 6482271b9396ab82 — Falling Star (OGN-029 → ogn-029-298) · [2]+[fury][fury] "Deal 3 to a unit. Deal 3 to a unit."
 *   × Counter Strike (SFD-194 → sfd-194-221) · [Reaction] "Choose a unit. The next time that unit would be dealt damage this
 *     turn, prevent it. Draw 1."
 *
 * Q: Can you react BETWEEN Falling Star's two damage instances?
 * A: No. It is one chain item; once everyone passes it resolves top to bottom — 3, then immediately 3 — with no window
 *    in between. Reactions (e.g. Counter Strike) go in BEFORE it resolves; several such replacement effects set up in
 *    advance are all live during resolution and can each prevent one instance as it happens.
 * Rules: 340.1 (an item resolves in its entirety), 339 (priority only between items), 367 (replacement "next time").
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FALLING_STAR = "ogn-029-298";
const COUNTER_STRIKE = "sfd-194-221";

/** P1's turn: Falling Star, exactly [2]+2 fury. P2: Titan (7) at bf1, two Counter Strikes, exactly [4]+2 rainbow, 3 known deck cards. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 2 } })
    .resources(P2, { energy: 4, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 7, name: "Titan" }, "titan")
    .hand(P1, FALLING_STAR, "star")
    .hand(P2, COUNTER_STRIKE, "cs1")
    .hand(P2, COUNTER_STRIKE, "cs2")
    .deck(P2, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

async function starBothAtTitan(game: Game): Promise<void> {
  await game.p1.cast("star", { targets: ["titan", "titan"] });
  expect(game.chain().map((c) => c.cardId)).toEqual(["star"]); // ONE chain item for both instructions
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
}

describe("Ruling 6482271b9396ab82 — Falling Star's two 3s resolve back-to-back; replacement shields must be set up beforehand", () => {
  test("no window between the instances: before P2's final pass Titan has 0 damage; right after it, 6 — the chain is empty and play is open again", async () => {
    const game = await board().build();
    await starBothAtTitan(game);
    expect(game.state("titan").damage).toBe(0);
    await game.p2.passPriority(); // all passed → resolves in its entirety
    expect(game.state("titan").damage).toBe(6);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("star")).toBe("trash");
    // Nobody was offered anything at "3 damage": the very next decision is P1's open main phase.
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.hand().sort()).toEqual(["cs1", "cs2"]); // the Reactions were never castable mid-resolution
  });

  test("ONE Counter Strike played before resolution prevents only the NEXT instance: Titan takes 3 (and P2 drew 1)", async () => {
    const game = await board().build();
    await starBothAtTitan(game);
    await game.p2.cast("cs1", { targets: "titan" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["star", "cs1"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("titan").damage).toBe(3);
    expect(game.p2.hand().sort()).toEqual(["cs2", "d1"]);
    expect(game.violations()).toEqual([]);
  });

  // Two Counter Strikes set up in advance are both live during resolution; the first prevention is used up by the first
  // 3, the second by the second 3 → Titan takes 0.
  test("ruling 6482271b9396ab82 — each 'next time' prevention stops one instance; both of Falling Star's 3s are prevented", async () => {
    const game = await board().build();
    await starBothAtTitan(game);
    await game.p2.cast("cs1", { targets: "titan" });
    await game.p2.cast("cs2", { targets: "titan" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["star", "cs1", "cs2"]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("titan").damage).toBe(0);
    expect(game.zoneOf("titan")).toBe("battlefield-bf1");
    expect(game.p2.hand().sort()).toEqual(["d1", "d2"]);
    expect(game.violations()).toEqual([]);
  });
});
