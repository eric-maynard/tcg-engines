/**
 * Ruling c3240def91185c29 — Jhin, Meticulous Killer (unl-089-219) × Defy (ogn-045-298)
 *   Jhin — Unit · Mind · [4] · 4 Might: "[Vision] … If you've spent [4] or more to play a spell this turn, you may
 *   play me for [mind]."
 *   Defy — [Reaction] · [1][calm]: "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   (Disintegrate ogn-005-298 stands in as "a 4-cost spell".)
 *
 * Q: I pay [4] for a spell, planning to play Jhin for [mind]; the spell is Defied. Can I still play Jhin for [mind]?
 * A: Yes. Jhin's condition looks at energy SPENT to play a spell that became a finalized chain item this turn; a
 *    counter neither refunds the cost (425.1.c) nor un-spends it, even though the spell is not "played" (425.1.b).
 *    Back in the Open main phase, Jhin is playable for his alternative cost [mind].
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const JHIN = "unl-089-219";
const DEFY = "ogn-045-298";
const DISINTEGRATE = "ogn-005-298";

/** P1's turn: exactly [4] + 1 mind, hand Disintegrate + Jhin. P2 holds bf1 with X and has Defy + exactly [1][calm]. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { mind: 1 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Target X" }, "X")
    .hand(P1, DISINTEGRATE, "dis")
    .hand(P1, JHIN, "jhin")
    .hand(P2, DEFY, "defy");
}

describe("Ruling c3240def91185c29 — a Defied 4-cost spell still unlocks Jhin's [mind] alternative cost", () => {
  test("premise: with no spell played this turn, 0 energy + 1 mind is NOT enough to play Jhin (needs the printed [4])", async () => {
    const game = await scenario().resources(P1, { energy: 0, power: { mind: 1 } }).hand(P1, JHIN, "jhin").build();
    expect(game.p1.can("play", "jhin")).toBe(false);
  });

  test("P1 pays [4] for Disintegrate (finalized on the chain); P2 Defies it; it is countered to trash with no refund and no effect", async () => {
    const game = await board().build();
    await game.p1.cast("dis", { targets: "X" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 1 } }); // [4] spent at finalization
    expect(game.chain().map((c) => c.cardId)).toEqual(["dis"]);
    await game.p1.passPriority();
    expect(game.p2.can("cast", "defy")).toBe(true);
    await game.p2.cast("defy", { targets: "dis" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["dis", "defy"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("dis")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.state("X").damage).toBe(0); // countered — never dealt 3
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 1 } }); // 425.1.c — nothing refunded
  });

  test("…and back in the Open main phase Jhin is playable for just [mind]: P1 plays him to base with 0 energy, spending only the mind", async () => {
    const game = await board().build();
    await game.p1.cast("dis", { targets: "X" });
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "dis" });
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 1 } });
    expect(game.p1.can("play", "jhin")).toBe(true);
    await game.p1.play("jhin", { params: { altCost: true }, to: "base" });
    await game.settle({ policy: "first" }); // [Vision] look — any answer
    expect(game.zoneOf("jhin")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } }); // paid [mind] only
  });
});
