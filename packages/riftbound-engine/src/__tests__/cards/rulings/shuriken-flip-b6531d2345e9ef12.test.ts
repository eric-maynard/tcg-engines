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
  test("ruling: the 'up to one' enemy target is named when the spell is played (and zero is a legal choice)", async () => {
    const game = await board().build();
    const field = game.p1.option("cast", "flip")?.fields?.find((f) => f.name === "targets");
    expect(field).toMatchObject({ kind: "cards", max: 1, min: 0 });
    expect(JSON.stringify(field?.options)).toContain("foe");
    expect(field?.options).toContainEqual([]); // "up to one" ⇒ none is allowed

    await game.p1.cast("flip", { targets: ["foe"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["flip"]);
  });

  test.failing(
    "BUG: ruling b6531d2345e9ef12 — the friendly mover should be chosen at play; the engine leaves it to resolution (pendingChoice at timing RES)",
    async () => {
      const game = await board().build();
      await game.p1.cast("flip", { targets: ["foe"] });
      // Everything the spell chooses is settled before anyone gets Priority (355.4/355.10).
      expect(game.decision()).toMatchObject({ kind: "action", seat: P1 });
      const stop = await game.settle();
      expect(stop.reason).toBe("open"); // engine: stops "unanswered" on a RES pick of the mover
    },
  );

  test.failing(
    "BUG: ruling b6531d2345e9ef12 — the destination should be locked in at play; the engine asks for it during resolution",
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
      await game.p1.cast("flip", { targets: ["foe"] });
      const stop = await game.settle();
      // The ruling's model: the destination was locked in at play, so nothing is asked while resolving.
      expect(game.decision()?.source?.pendingChoiceType).not.toBe("choose-destination");
      expect(stop.reason).toBe("open");
    },
  );

  test.failing(
    "BUG: ruling b6531d2345e9ef12 — with no friendly unit to move the spell should be unplayable (the mover is a target); the engine still offers it",
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
    await game.p1.cast("flip", { targets: ["foe"] });
    await game.settle();
    await game.p1.pick("ally"); // the mover
    const dest = game.decision();
    expect(dest).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    const keys = dest?.options?.map((o) => String(o.key));
    expect(keys).toContain("base"); // not the damaged unit's battlefield
    expect(keys).toContain("battlefield-bf1");
  });

  test("the damage and the move both happen: Foe takes 2 and the chosen ally lands where P1 sent it", async () => {
    const game = await board().build();
    await game.p1.cast("flip", { targets: ["foe"] });
    await game.settle();
    await game.p1.pick("ally");
    await game.p1.pick("base");
    await game.settle();
    expect(game.state("foe").damage).toBe(2);
    expect(game.locationOf("ally")).toBe("base");
    expect(game.zoneOf("flip")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
