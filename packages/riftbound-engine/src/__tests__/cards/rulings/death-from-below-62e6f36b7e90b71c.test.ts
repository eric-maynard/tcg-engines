/**
 * Ruling 62e6f36b7e90b71c — Death from Below (UNL-186 → unl-186-219) · [4][rainbow] "Kill a unit at a battlefield. Then, if
 *     it had 3 [Might] or less, you may play this from your trash for [rainbow]."
 *   × Arcane Shift (SFD-200 → sfd-200-221) · [Action] [3][rainbow] "Banish a friendly unit, then its owner plays it, ignoring
 *     its cost. Deal 3 to an enemy unit at a battlefield. Banish this."
 *
 * Q: Opponent plays Death from Below on my unit — can I Arcane Shift it away, and does that make Death from Below retarget?
 * A: No. Arcane Shift is [Action]-speed: once Death from Below is on the chain the state is Closed and only Reactions may
 *    be played. Death from Below's target is locked when it is played; nothing lets it retarget. It resolves and kills.
 * Rules: 309.1 (chain exists ⇒ Closed), 158.2.a ([Action] needs Open state / showdown), 355 (targets chosen at play).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEATH_FROM_BELOW = "unl-186-219";
const ARCANE_SHIFT = "sfd-200-221";

/**
 * P1's (the opponent's) turn. P2 holds bf1 with a 5-Might Victim and a 2-Might Bystander; P1 has a Raider at its own bf2
 * (an "enemy unit at a battlefield" for Arcane Shift's damage half). P1: Death from Below + [4][rainbow]. P2: Arcane
 * Shift + [3][rainbow].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { rainbow: 1 } })
    .resources(P2, { energy: 3, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 5, name: "Victim" }, "victim")
    .unit(P2, "bf1", { might: 2, name: "Bystander" }, "bystander")
    .unit(P1, "bf2", { might: 4, name: "Raider" }, "raider")
    .hand(P1, DEATH_FROM_BELOW, "dfb")
    .hand(P2, ARCANE_SHIFT, "shift");
}

async function dfbOnVictim(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("dfb", { targets: "victim" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dfb", controller: P1, targets: ["victim"] })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 62e6f36b7e90b71c — Arcane Shift can't answer Death from Below, and Death from Below never retargets", () => {
  test("premise: in an OPEN state on P2's own turn Arcane Shift would be castable (so the block below is about timing, not the card)", async () => {
    const game = await board().active(P2).build();
    expect(game.chain()).toEqual([]);
    expect(game.p2.can("cast", "shift")).toBe(true);
  });

  test("with Death from Below on the chain the state is Closed: P2 has priority but Arcane Shift ([Action]) is NOT playable; a forced cast is rejected", async () => {
    const game = await dfbOnVictim();
    expect(game.chain()).toHaveLength(1);
    expect(game.p2.can("cast", "shift")).toBe(false);
    const r = await game.p2.try((p) => p.cast("shift", { targets: ["victim", "raider"] }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("shift")).toBe("hand");
    expect(game.p2.resources()).toEqual({ energy: 3, power: { rainbow: 1 } });
    // Only pass / Reaction-speed things are on P2's menu.
    expect(game.p2.legal().some((o) => o.verb === "cast")).toBe(false);
  });

  test("the target stays locked on the Victim through resolution: Death from Below resolves and kills exactly the Victim (5 Might ⇒ no replay offer)", async () => {
    const game = await dfbOnVictim();
    expect(game.chain()[0]?.targets).toEqual(["victim"]);
    await game.p2.passPriority();
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.zoneOf("bystander")).toBe("battlefield-bf1");
    expect(game.zoneOf("dfb")).toBe("trash"); // had 5 Might: no "play this from your trash" offer
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
