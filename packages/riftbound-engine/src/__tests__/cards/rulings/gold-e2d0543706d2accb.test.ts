/**
 * Ruling e2d0543706d2accb — Gold (SFD-T03 → sfd-t03) · Gear token "[Reaction] Kill this, [Exhaust]: [Add] [rainbow]."
 *   × Legion Quartermaster (SFD-044 → sfd-044-221) · 4 Might · [3] "As an additional cost to play me, return a friendly
 *     gear to its owner's hand."
 *
 * Q: Can I return a Gold gear TOKEN to hand to pay Legion Quartermaster's additional cost?
 * A: Yes. The token is a friendly gear; it moves to hand (cost satisfied, play finalized), and only THEN ceases to exist
 *    as a token in a non-board zone. Ceasing to exist happens after — not instead of — the cost payment.
 * Rules: 356.2 (additional costs), 186.1 (a token in a non-board zone ceases to exist immediately after arriving),
 *        357.2 (a cost is paid once its action is performed).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const GOLD = "sfd-t03";
const LEGION_QUARTERMASTER = "sfd-044-221";

describe("Ruling e2d0543706d2accb — a Gold token can be bounced to pay Legion Quartermaster's cost", () => {
  test("with the Gold token as P1's only gear, it is offered as the return-a-gear cost; paying it plays the Quartermaster and the token then ceases to exist (not in hand, not anywhere)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .gear(P1, GOLD, "gold")
      .hand(P1, LEGION_QUARTERMASTER, "qm")
      .build();
    expect(game.state("gold")).toMatchObject({ cardType: "gear", isToken: true, zone: "base" });
    // The mandatory additional cost enumerates the token as a legal object.
    expect(game.p1.can("play", "qm")).toBe(true);
    const costField = game.p1.option("play", "qm")?.fields.find((f) => f.arg === "sacrifice" || /sacrifice|return/i.test(f.name));
    expect(costField?.options ?? []).toContain("gold");

    await game.p1.play("qm", { sacrifice: "gold" });
    await game.settle();
    // Cost paid, play finalized and resolved.
    expect(game.zoneOf("qm")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    // The token reached a non-board zone and ceased to exist right after (186.1): it is in no zone at all.
    expect(game.has("gold")).toBe(false);
    expect(game.zoneOf("gold")).toBe("gone");
    expect(game.p1.hand()).not.toContain("gold");
    expect(game.p1.gear()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("control: with NO friendly gear at all the Quartermaster cannot be played (the additional cost is mandatory)", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, LEGION_QUARTERMASTER, "qm").build();
    expect(game.p1.can("play", "qm")).toBe(false);
    expect((await game.p1.try((p) => p.play("qm"))).ok).toBe(false);
    expect(game.zoneOf("qm")).toBe("hand");
  });
});
