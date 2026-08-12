/**
 * Ruling 2d9a3160545b052b — Gust (OGN-169 → ogn-169-298) · Reaction · [1]
 *     "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   × Fiora, Peerless (SFD-110 → sfd-110-221) · 3 Might · "When I attack or defend one on one, double my
 *     Might this combat."
 *   × a continuous "+2 [Might] to my other units" source — Baron Nashor (unl-147-219) stands in for the
 *     ruling's Yi: the point is a static +2 that is already applied when the response window opens.
 *
 * Q: Can Fiora's attack/defend trigger be answered with Gust, and does it change when she has the +2?
 * A: The trigger does use the chain, so Reactions like Gust may be played while it sits there. But a static
 *    +2 is not a trigger — it is already applied — so with it Fiora is a 5-Might unit the moment the window
 *    opens and Gust (3 or less) cannot choose her at all.
 * Rules: 383.1/336 (a triggered ability goes on the chain and can be responded to), 365 (statics apply
 *        continuously, never on the chain), 355.8 (a spell with no legal choice cannot be played).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const FIORA = "sfd-110-221";
const BARON = "unl-147-219";

/** P2's turn: a 4-Might Raider attacks Fiora, who defends P1's bf1 alone. P2 holds Gust with exactly [1]. */
function board(withStatic: boolean) {
  const b = scenario()
    .active(P2)
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", FIORA, "fiora")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P2, GUST, "gust");
  return withStatic ? b.unit(P1, "base", BARON, "baron") : b;
}

describe("Ruling 2d9a3160545b052b — Fiora's trigger can be answered with Gust, unless a static +2 has already put her out of range", () => {
  test("without the static: her 'when I defend one on one' trigger sits on the chain at 3 Might and P2 may Gust her away — the trigger then fizzles", async () => {
    const game = await board(false).build();
    expect(game.state("fiora").might).toBe(3);
    await game.p2.move("raider", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fiora", controller: P1, triggered: true })]);
    expect(game.state("fiora")).toMatchObject({ combatRole: "defender", might: 3 }); // not doubled yet
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "fiora" });
    await game.settle();
    expect(game.zoneOf("fiora")).toBe("hand");
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.locationOf("raider")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("with the static +2 Fiora is a 5 before anything is put on the chain — Gust has no legal choice and cannot be played", async () => {
    const game = await board(true).build();
    expect(game.state("fiora").might).toBe(5);
    await game.p2.move("raider", "bf1");
    expect(game.chain().map((c) => c.cardId)).toEqual(["fiora"]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.state("fiora").might).toBe(5);
    expect(game.p2.can("cast", "gust")).toBe(false);
    expect((await game.p2.try((p) => p.cast("gust", { targets: "fiora" }))).ok).toBe(false);
    expect(game.p2.energy()).toBe(1);
  });

  test("and once the trigger has RESOLVED she is far out of reach either way (3 → 6 doubled), so she wins the fight against the 4-Might Raider", async () => {
    const game = await board(false).build();
    await game.p2.move("raider", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority(); // the trigger resolves
    expect(game.chain()).toEqual([]);
    expect(game.state("fiora").might).toBe(6);
    expect(game.p2.can("cast", "gust")).toBe(false);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("fiora")).toBe("battlefield-bf1");
    expect(game.state("fiora").might).toBe(3); // "this combat" is over
  });
});
