/**
 * Ruling f669c5eaae2538c8 — Death from Below (UNL-186 → unl-186-219) · [4][rainbow]
 *   "Kill a unit at a battlefield. Then, if it had 3 [Might] or less, you may play this from your trash for [rainbow]."
 *
 * Q: Can Death from Below be replayed more than once in a turn?
 * A: Yes — there is no per-turn cap. Each time it resolves and the killed unit had 3 Might or less, you may pay
 *    [rainbow] and play it again from the trash, as often as you can pay. The card must actually have reached the
 *    trash first, and a victim of more than 3 Might gives no replay at all.
 * Rules: 419.1.a (an ability grants its own play permission), 359.3.e (the Might is read at the kill), FAQ #10622 / #10169.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEATH_FROM_BELOW = "unl-186-219";

/** P1's turn. P2 holds bf1 with three small units and one big one; P1 has DFB and [4] plus three [rainbow]. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { rainbow: 3 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Small A" }, "smallA")
    .unit(P2, "bf1", { might: 3, name: "Small B" }, "smallB")
    .unit(P2, "bf1", { might: 3, name: "Small C" }, "smallC")
    .unit(P2, "bf1", { might: 6, name: "Big" }, "big")
    .hand(P1, DEATH_FROM_BELOW, "dfb");
}

/** Accept the "play this from your trash" offer and aim the replay at `victim`. */
async function replayOn(game: Game, victim: string): Promise<void> {
  expect(game.zoneOf("dfb")).toBe("trash"); // it must have reached the trash before it can be replayed
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  await game.p1.yes();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick(victim);
  await game.settle();
}

describe("Ruling f669c5eaae2538c8 — Death from Below has no per-turn limit", () => {
  test("a >3-Might victim gives NO replay offer: the card just sits in the trash", async () => {
    const game = await board().build();
    await game.p1.cast("dfb", { targets: "big" });
    await game.settle();
    expect(game.zoneOf("big")).toBe("trash");
    expect(game.zoneOf("dfb")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.power("rainbow")).toBe(2); // only Death from Below's own [rainbow] was spent
  });

  test("a ≤3-Might victim offers the replay, and the card is already in the trash when the offer comes", async () => {
    const game = await board().build();
    await game.p1.cast("dfb", { targets: "smallA" });
    await game.settle();
    expect(game.zoneOf("smallA")).toBe("trash");
    expect(game.zoneOf("dfb")).toBe("trash");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(game.decision()?.prompt).toContain("[rainbow]");
  });

  test("declining ends it: the card stays in the trash and P1 is back in the main phase", async () => {
    const game = await board().build();
    await game.p1.cast("dfb", { targets: "smallA" });
    await game.settle();
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("dfb")).toBe("trash");
    expect(game.p1.power("rainbow")).toBe(2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("it can be replayed AGAIN and AGAIN in the same turn while the [rainbow] holds out — three kills off one card", async () => {
    const game = await board().build();
    await game.p1.cast("dfb", { targets: "smallA" });
    await game.settle();
    await replayOn(game, "smallB");
    await replayOn(game, "smallC");
    expect(game.zoneOf("smallA")).toBe("trash");
    expect(game.zoneOf("smallB")).toBe("trash");
    expect(game.zoneOf("smallC")).toBe("trash");
    expect(game.zoneOf("big")).toBe("battlefield-bf1"); // never chosen
    expect(game.zoneOf("dfb")).toBe("trash");
    expect(game.p1.power("rainbow")).toBe(0); // 1 + 1 + 1 across the three plays
    expect(game.violations()).toEqual([]);
  });

  test("the ceiling is resources, not a per-turn cap: with the [rainbow] gone the fourth offer cannot be accepted", async () => {
    const game = await board().build();
    await game.p1.cast("dfb", { targets: "smallA" });
    await game.settle();
    await replayOn(game, "smallB");
    await replayOn(game, "smallC");
    expect(game.p1.power("rainbow")).toBe(0);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 }); // still offered…
    const r = await game.p1.try((p) => p.yes()); // …but unpayable
    expect(r.ok).toBe(false);
    expect(game.zoneOf("big")).toBe("battlefield-bf1");
  });
});
