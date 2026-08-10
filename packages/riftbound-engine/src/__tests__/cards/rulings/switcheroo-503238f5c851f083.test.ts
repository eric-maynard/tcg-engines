/**
 * Ruling 503238f5c851f083 — Switcheroo (SFD-145 → sfd-145-221) · Action · [2][chaos][chaos] · [Hidden] "Swap the Might of two
 *   units at the same battlefield this turn."
 *   × Defy (OGN-045 → ogn-045-298) · Reaction · [1][calm] "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *
 * Q: Can a Switcheroo played from face down (for [0]) be Defied?
 * A: No. Defy checks the spell's PRINTED cost, not what was paid; Switcheroo's [chaos][chaos] is more than [rainbow], so it is
 *    never a legal Defy target — hidden or not.
 * Rules: 206 (cost = printed cost), 811 (Hidden: play later for [0] — an alternative payment, not a new cost), 355.8.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SWITCHEROO = "sfd-145-221";
const DEFY = "ogn-045-298";
const HIDDEN_BLADE = "ogn-213-298"; // [2][order] Hidden spell — printed cost within Defy's range (contrast)

/** P1's turn 3. P1 holds bf1 with Mine (2) facing P2's Theirs (6); `hidden` is face down there (from an earlier turn). P2: Defy + [1][calm]. */
function board(hidden: string) {
  return scenario()
    .turn(3)
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Mine" }, "mine")
    .unit(P2, "bf1", { might: 6, name: "Theirs" }, "theirs")
    .facedown(P1, "bf1", hidden, "fd")
    .hand(P2, DEFY, "defy");
}

describe("Ruling 503238f5c851f083 — a hidden Switcheroo cannot be Defied (Defy reads printed cost)", () => {
  test("P1 plays Switcheroo from face down for [0]; it sits on the chain [Mine ⇄ Theirs] — and P2's Defy has NO legal target: not castable, forcing it fails, Defy stays in hand", async () => {
    const game = await board(SWITCHEROO).build();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.p1.reveal("fd");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // paid nothing
    expect(game.state("fd").energyCost).toBe(2); // …but the card still COSTS [2][chaos][chaos]
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fd", controller: P1, targets: ["mine", "theirs"] })]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "defy")).toBe(false);
    const r = await game.p2.try((p) => p.cast("defy", { targets: "fd" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("defy")).toBe("hand");
    expect(game.p2.resources()).toEqual({ energy: 1, power: { calm: 1 } });
    // Switcheroo resolves: Mine 6, Theirs 2 this turn.
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("fd")).toBe("trash");
    expect(game.state("mine").might).toBe(6);
    expect(game.state("theirs").might).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: a hidden spell whose PRINTED cost is within range (Hidden Blade, [2][order]) played the same way for [0] IS a legal Defy target — so it's the printed cost that matters, not the [0] paid", async () => {
    const game = await board(HIDDEN_BLADE).build();
    await game.p1.reveal("fd", { answers: ["theirs"] });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("theirs");
    }
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fd", targets: ["theirs"] })]);
    await game.p1.passPriority();
    expect(game.p2.can("cast", "defy")).toBe(true);
    expect(game.p2.option("cast", "defy")?.fields.find((f) => f.name === "targets")?.options?.flat()).toEqual(["fd"]);
    await game.p2.cast("defy", { targets: "fd" });
    await game.settle();
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("fd")).toBe("trash");
    expect(game.zoneOf("theirs")).toBe("battlefield-bf1"); // countered: no kill
  });
});
