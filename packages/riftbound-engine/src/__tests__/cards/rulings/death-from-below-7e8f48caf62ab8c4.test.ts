/**
 * Ruling 7e8f48caf62ab8c4 — Death from Below (UNL-186 → unl-186-219) · Spell · Fury/Chaos · [4][rainbow]
 *     "Kill a unit at a battlefield. Then, if it had 3 [Might] or less, you may play this from your trash for [rainbow]."
 *
 * Q: If the target is killed before Death from Below resolves, can I still use the recast effect?
 * A: No. At resolution the target is illegal, so the "kill" instruction does nothing; the follow-up then tries to read
 *    that unit's Might, which is null for an object that is no longer there, so the "3 [Might] or less" condition can't
 *    be met and the replay offer never appears.
 * Rules: 359.3.e.2 (illegal target at resolution), 359.3.e.5 (that instruction is not performed),
 *        359.3.e.12 (information about an illegal target reads as null and calculations on it are ignored).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEATH_FROM_BELOW = "unl-186-219";

/** Inline [1] reaction spell: kill a unit — P2's way of removing the target in response. */
const SNIPE = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 1,
  name: "Test Snipe",
  timing: "reaction",
};

/** P1's turn with [4][rainbow] for Death from Below plus a spare [rainbow] for the replay. P2 holds bf1 with a 2-Might Runt. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { rainbow: 2 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Runt" }, "runt")
    // rule 355.8 — the replay is itself a "Kill a unit at a battlefield" spell,
    // so it can only be offered while some unit is still standing at one.
    .unit(P2, "bf1", { might: 5, name: "Bystander" }, "bystander")
    .hand(P1, DEATH_FROM_BELOW, "dfb")
    .hand(P2, SNIPE, "snipe");
}

/** Is the "you may play this from your trash for [rainbow]" replay on offer right now (as a prompt or as a legal play)? */
function replayOffered(game: Game): boolean {
  const d = game.decision();
  if (d?.kind === "yes-no" && d.seat === P1) {
    return true;
  }
  return game.p1.legal().some((o) => o.card === "dfb" && (o.verb === "cast" || o.verb === "play"));
}

describe("Ruling 7e8f48caf62ab8c4 — a Death from Below whose target dies first offers no replay from the trash", () => {
  // The ruling's contrast case. Expected: the target survives to resolution, is killed by Death from Below and had
  // 2 [Might], so the "you may play this from your trash for [rainbow]" rider IS offered.
  // Actual: the engine never offers the replay — the conditional second clause is not executed at all.
  test("ruling 7e8f48caf62ab8c4 (contrast) — killing a 2-Might unit offers the [rainbow] replay from the trash", async () => {
    const game = await board().build();
    await game.p1.cast("dfb", { targets: "runt" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("runt")).toBe("trash");
    expect(game.zoneOf("dfb")).toBe("trash");
    expect(replayOffered(game)).toBe(true); // "it had 3 [Might] or less" was satisfied
  });

  test("ruling 7e8f48caf62ab8c4 — P2 snipes the target in response: the kill does nothing and NO replay offer is made", async () => {
    const game = await board().build();
    await game.p1.cast("dfb", { targets: "runt" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["dfb"]);
    await game.p1.passPriority();
    await game.p2.cast("snipe", { targets: "runt" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["dfb", "snipe"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("runt")).toBe("trash"); // killed by the Snipe, not by Death from Below
    expect(game.zoneOf("dfb")).toBe("trash");
    expect(replayOffered(game)).toBe(false); // the condition could not be evaluated ⇒ nothing offered
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.power("rainbow")).toBe(1); // the spare [rainbow] was never spent on a replay
    expect(game.violations()).toEqual([]);
  });

  test("the spell is not replayed by any other route either — it stays put in P1's trash", async () => {
    const game = await board().build();
    await game.p1.cast("dfb", { targets: "runt" });
    await game.p1.passPriority();
    await game.p2.cast("snipe", { targets: "runt" });
    await game.settle();
    expect(game.p1.trash()).toContain("dfb");
    expect(game.p1.hand()).not.toContain("dfb");
    expect(game.violations()).toEqual([]);
  });
});
