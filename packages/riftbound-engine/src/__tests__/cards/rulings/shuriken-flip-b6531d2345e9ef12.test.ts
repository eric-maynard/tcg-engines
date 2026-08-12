/**
 * Ruling b6531d2345e9ef12 — Shuriken Flip (VEN-140 → ven-140-166) · Spell · Fury/Calm · [1][rainbow]
 *   "Deal 2 to up to one enemy unit at a battlefield, then move a friendly unit."
 *
 * Q: When I play Shuriken Flip, must I choose the target and the move's destination before it resolves?
 * A: Yes — every choice is locked in as the spell is Finalized: the optional enemy target (up to one), the
 *    friendly unit to move, and that unit's destination. The destination need not be the damaged unit's
 *    battlefield; any legal location (your Base, another battlefield) is fine. And because the moved unit is
 *    itself a target, with no friendly units you cannot play the spell at all.
 * Rules: 355.4 (a move's destination is chosen when the effect is finalized), 355.10/355.13 (targets are
 *        chosen at play; "up to one" may be zero), 355.8 (no legal target ⇒ not playable).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SHURIKEN_FLIP = "ven-140-166";

/** P1's turn. P2 has a Foe at bf1; P1 has movers at bf2 (so Base is also a legal destination). */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 5, name: "Foe" }, "foe")
    .unit(P1, "bf2", { might: 3, name: "Ally" }, "ally")
    .unit(P1, "bf2", { might: 2, name: "Ally Two" }, "ally2")
    .hand(P1, SHURIKEN_FLIP, "flip");
}

describe("Ruling b6531d2345e9ef12 — Shuriken Flip's choices belong to the play, not the resolution", () => {
  test("ruling: BOTH objects are named when the spell is played — the 'up to one' enemy (zero allowed, 355.13) and the MANDATORY friendly mover (355.5)", async () => {
    const game = await board().build();
    const field = game.p1.option("cast", "flip")?.fields?.find((f) => f.name === "targets");
    expect(field).toMatchObject({ kind: "cards" });
    const tuples = (field?.options ?? []) as string[][];
    // every option ends with a mover; the damage victim is the optional prefix
    expect(tuples.every((t) => ["ally", "ally2"].includes(t.at(-1) as string))).toBe(true);
    expect(tuples).toContainEqual(["ally"]); // 355.13 — zero damage targets
    expect(tuples).toContainEqual(["foe", "ally"]);

    await game.p1.cast("flip", { targets: ["foe", "ally"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["flip"]);
  });

  test("ruling b6531d2345e9ef12 — the friendly mover is chosen AT PLAY: nothing about it is asked while the spell resolves", async () => {
    const game = await board().build();
    await game.p1.cast("flip", { targets: ["foe", "ally"] });
    // rule 355.4 — the only question left is the Move Destination, and it too is
    // a choice of PLAYING the spell, asked before anyone receives Priority.
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", timing: "FIN" });
    await game.p1.pick("base");
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1 });
    const stop = await game.settle();
    expect(stop.reason).toBe("open");
    expect(game.locationOf("ally")).toBe("base");
  });

  test(
    "ruling b6531d2345e9ef12 — the destination is locked in at play, so nothing is asked while the spell resolves",
    async () => {
      // One friendly unit, so the mover is settled without a question and only the destination is left.
      const game = await scenario()
        .resources(P1, { energy: 2, power: { rainbow: 1 } })
        .battlefield("bf1", { controller: P2 })
        .battlefield("bf2", { controller: P1 })
        .unit(P2, "bf1", { might: 5, name: "Foe" }, "foe")
        .unit(P1, "bf2", { might: 3, name: "Ally" }, "ally")
        .hand(P1, SHURIKEN_FLIP, "flip")
        .build();
      await game.p1.cast("flip", { targets: ["foe", "ally"] });
      // rule 355.4 / 402.2 — asked at FINALIZATION …
      expect(game.decision()).toMatchObject({ semantics: "destination", timing: "FIN" });
      await game.p1.pick("base");
      const stop = await game.settle();
      // … and never again while resolving (355.15).
      expect(game.decision()?.source?.pendingChoiceType).not.toBe("choose-destination");
      expect(stop.reason).toBe("open");
    },
  );

  test(
    "ruling b6531d2345e9ef12 — with no friendly unit to move, the spell is unplayable: the mover is a target and 355.8 needs a valid choice for it",
    async () => {
      const game = await scenario()
        .resources(P1, { energy: 2, power: { rainbow: 1 } })
        .battlefield("bf1", { controller: P2 })
        .unit(P2, "bf1", { might: 5, name: "Foe" }, "foe")
        .hand(P1, SHURIKEN_FLIP, "flip")
        .build();
      expect(game.p1.units().length).toBe(0);
      expect(game.p1.can("cast", "flip")).toBe(false);
    },
  );

  test("ruling: the destination does NOT have to be the damaged unit's battlefield — Base and the other battlefield are both offered", async () => {
    const game = await board().build();
    await game.p1.cast("flip", { targets: ["foe", "ally"] });
    const dest = game.decision();
    expect(dest).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    const keys = dest?.options?.map((o) => String(o.key));
    expect(keys).toContain("base"); // not the damaged unit's battlefield
    expect(keys).toContain("battlefield-bf1");
  });

  test("the damage and the move both happen: Foe takes 2 and the chosen ally lands where P1 sent it", async () => {
    const game = await board().build();
    await game.p1.cast("flip", { targets: ["foe", "ally"] });
    await game.p1.pick("base");
    await game.settle();
    expect(game.state("foe").damage).toBe(2);
    expect(game.locationOf("ally")).toBe("base");
    expect(game.zoneOf("flip")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
