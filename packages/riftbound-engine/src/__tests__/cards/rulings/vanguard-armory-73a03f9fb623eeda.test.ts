/**
 * Ruling 73a03f9fb623eeda — Vanguard Armory (SFD-168 → sfd-168-221) · Gear · Order · [7][order]
 *   "[Exhaust]: Play three 1 [Might] Recruit unit tokens. (You may play them to different locations.)"
 *   × Consult the Past (ogn-083-298, [Reaction] [4] "Draw 2.") — the would-be response
 *
 * Q: If a player plays Vanguard Armory and taps it, can I react to either of those?
 * A: Not to the PLAY of the gear — a permanent resolves immediately when finalized, no priority passes. Yes to the
 *    ACTIVATION — the ability goes on the chain and the opponent gets priority to play a Reaction before it resolves.
 * Rules: 337.2 (a finalized Gear resolves immediately), 377.3 (activated abilities use the chain), 337.4/338 (priority).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VANGUARD_ARMORY = "sfd-168-221";
const CONSULT_THE_PAST = "ogn-083-298";

/** P1's turn with the Armory in HAND and exactly [7][order]; P2 holds Consult the Past + [4]. */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { order: 1 } })
    .resources(P2, { energy: 4 })
    .hand(P1, VANGUARD_ARMORY, "armory")
    .hand(P2, CONSULT_THE_PAST, "consult");
}

describe("Ruling 73a03f9fb623eeda — no reaction to PLAYING the Armory, but a reaction window on ACTIVATING it", () => {
  test("1. playing the gear: it is paid for and lands in P1's base at once — the chain is empty and P2 never received priority (it is still P1's open main phase)", async () => {
    const game = await board().build();
    await game.p1.play("armory");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.zoneOf("armory")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.can("cast", "consult")).toBe(false); // no window: P2 is not being asked anything
    expect(game.state("armory").isReady).toBe(true);
  });

  test("2. activating (exhausting) it: the ability is a chain item; the state closes and, after P1 passes, P2 holds priority and may play a Reaction", async () => {
    const game = await board().build();
    await game.p1.play("armory");
    await game.p1.activate("armory");
    expect(game.state("armory").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "armory", controller: P1, type: "ability" })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "consult")).toBe(true);
    await game.p2.cast("consult");
    expect(game.chain().map((c) => c.cardId)).toEqual(["armory", "consult"]);
  });

  test("3. the sequence completes: the Reaction resolves first, then the Armory ability makes its three Recruit tokens", async () => {
    const game = await board().build();
    await game.p1.play("armory");
    await game.p1.activate("armory");
    await game.p1.passPriority();
    await game.p2.cast("consult");
    const hand = game.p2.hand().length;
    await game.settle();
    expect(game.p2.hand()).toHaveLength(hand + 2);
    const toks = game.p1.units("base").filter((id) => game.state(id).name === "Recruit");
    expect(toks).toHaveLength(3);
    expect(game.violations()).toEqual([]);
  });
});
