/**
 * Ruling e0e8a0c78bbabb33 — Deathgrip (SFD-163 → sfd-163-221) · [Reaction] [2] spell
 *   "Kill a friendly unit. If you do, give +[Might] equal to its Might to another friendly unit this turn. Draw 1."
 *
 * Q: Can Deathgrip be used to kill a (unit) card sitting in my hand?
 * A: No. "Kill" (rule 428.1) is a permanent moving from the BOARD to the trash, and Deathgrip chooses a
 *    "friendly unit" — a card in hand is not a unit on the board, so it is never a legal choice. The target
 *    must be a friendly unit on the board, named when Deathgrip is put on the chain.
 * Rules: 428.1 (Kill = board → trash), 355 (targets chosen on play), RiftJudge FAQ #9295 / #9315.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DEATHGRIP = "sfd-163-221";

/** P1's turn. P1 has two units on the board, an enemy unit, and a UNIT CARD still in hand alongside Deathgrip. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 2 } })
    .unit(P1, "base", { might: 3, name: "Sacrifice" }, "sac")
    .unit(P1, "base", { might: 2, name: "Beneficiary" }, "buddy")
    .unit(P2, "base", { might: 4, name: "Foe" }, "foe")
    .hand(P1, DEATHGRIP, "grip")
    .hand(P1, { cardType: "unit", energyCost: 2, might: 5, name: "Reserve" }, "reserve");
}

describe("Ruling e0e8a0c78bbabb33 — Deathgrip only kills a friendly unit ON THE BOARD, never a card in hand", () => {
  test("premise: the Reserve really is a unit card sitting in P1's hand", async () => {
    const game = await board().build();
    expect(game.zoneOf("reserve")).toBe("hand");
    expect(game.state("reserve")).toMatchObject({ cardType: "unit", controller: P1 });
  });

  test("the kill choice offered on play is exactly the friendly BOARD units — the hand card and the enemy unit are absent", async () => {
    const game = await board().build();
    const field = game.p1.option("cast", "grip")?.fields.find((f) => f.arg === "targets");
    const offered = (field?.options ?? []).flat() as string[];
    expect(offered).toContain("sac");
    expect(offered).toContain("buddy");
    expect(offered).not.toContain("reserve"); // in hand — not a unit on the board (428.1)
    expect(offered).not.toContain("foe"); // not friendly
  });

  test("forcing the hand card as the target is rejected and nothing is spent", async () => {
    const game = await board().build();
    const r = await game.p1.try((p) => p.cast("grip", { targets: "reserve" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("reserve")).toBe("hand");
    expect(game.zoneOf("grip")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { order: 2 } });
    expect(game.chain()).toEqual([]);
  });

  test("a legal friendly BOARD unit works: Sacrifice is killed, Beneficiary gets +3 Might this turn, P1 draws 1", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    await game.p1.cast("grip", { targets: "sac" });
    await game.settle();
    // The +Might recipient is chosen as Deathgrip resolves ("another friendly unit").
    if (game.decision()?.kind === "pick") await game.p1.pick("buddy");
    await game.settle();
    expect(game.zoneOf("sac")).toBe("trash");
    expect(game.state("buddy").might).toBe(5); // 2 + the killed unit's 3
    expect(game.p1.hand()).toHaveLength(handBefore - 1 + 1); // Deathgrip left hand, then Draw 1
    expect(game.zoneOf("grip")).toBe("trash");
    expect(game.zoneOf("reserve")).toBe("hand"); // untouched
    expect(game.violations()).toEqual([]);
  });

  test("the +Might is only 'this turn' — it is gone next turn, and the hand card was never involved", async () => {
    const game = await board().build();
    await game.p1.cast("grip", { targets: "sac" });
    await game.settle();
    if (game.decision()?.kind === "pick") await game.p1.pick("buddy");
    await game.settle();
    expect(game.state("buddy").might).toBe(5);
    await game.advanceTurn();
    expect(game.state("buddy").might).toBe(2);
    expect(game.zoneOf("reserve")).toBe("hand");
  });
});
