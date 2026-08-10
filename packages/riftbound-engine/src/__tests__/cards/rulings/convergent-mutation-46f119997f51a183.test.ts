/**
 * Ruling 46f119997f51a183 — Convergent Mutation (OGN-108 → ogn-108-298) · Spell · Mind · 2+[mind] · [Reaction]
 *     "Choose a friendly unit. This turn, increase its Might to the Might of another friendly unit."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · Spell · Chaos · 2+[chaos] · [Action] "Move a friendly unit and ready it."
 *
 * Q: Must both units be declared when Convergent Mutation goes on the chain, or is the second chosen on resolution?
 * A: Both are chosen when casting — a spell cannot be finalized without all its choices. Same for Ride the Wind: the
 *    unit AND its destination are declared at finalization.
 * Rules: 355.5 (all targets/choices made while finalizing), 355.7, 359.2 (resolution uses the recorded choices).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CONVERGENT_MUTATION = "ogn-108-298";
const RIDE_THE_WIND = "ogn-173-298";

function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { chaos: 1, mind: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "base", { might: 2, name: "Small" }, "small")
    .unit(P1, "bf1", { might: 5, name: "Big" }, "big", { exhausted: true })
    .unit(P2, "base", { might: 9, name: "Enemy Giant" }, "giant")
    .hand(P1, CONVERGENT_MUTATION, "cm")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

describe("Ruling 46f119997f51a183 — every choice of a spell is locked in as it is put on the chain", () => {
  test("Convergent Mutation is offered as a two-role choice ([chosen unit, reference unit]) over FRIENDLY units only; a bare cast is refused as ambiguous rather than deferred to resolution", async () => {
    const game = await board().build();
    const field = game.p1.option("cast", "cm")?.fields.find((f) => f.arg === "targets" || f.name === "targets");
    expect(field?.required).toBe(true);
    const tuples = (field?.options ?? []) as unknown[];
    expect(tuples.length).toBeGreaterThan(0);
    expect(tuples.every((t) => Array.isArray(t) && t.length === 2)).toBe(true);
    const mentioned = new Set(tuples.flat() as string[]);
    expect(mentioned).toEqual(new Set(["small", "big"])); // the enemy Giant is never a choice
    const r = await game.p1.try((p) => p.cast("cm"));
    expect(r.ok).toBe(false);
    expect(game.chain()).toEqual([]); // nothing half-cast is left on the chain
    expect(game.zoneOf("cm")).toBe("hand");
  });

  test("cast with both units named: the chain item records BOTH targets immediately, no further pick is pending, and on resolution Small's Might becomes Big's 5", async () => {
    const game = await board().build();
    await game.p1.cast("cm", { targets: ["small", "big"] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cm", controller: P1, targets: ["small", "big"] })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // straight to priority
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 1, mind: 0 } });
    await game.settle();
    expect(game.decision()?.kind).toBe("action"); // no resolution-time "choose another unit" prompt appeared
    expect(game.zoneOf("cm")).toBe("trash");
    expect(game.state("small").might).toBe(5);
    expect(game.state("big").might).toBe(5);
  });

  test("Ride the Wind likewise: the unit is named on the cast and its destination is demanded at finalization (timing FIN) BEFORE anyone gets priority; the chain item then carries the unit, and resolution moves + readies it", async () => {
    const game = await board().build();
    await game.p1.cast("rtw", { targets: "big" });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    const dests = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
    expect(dests).toContain("battlefield-bf2");
    await game.p1.pick("battlefield-bf2");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rtw", controller: P1, targets: ["big"] })]);
    expect(game.locationOf("big")).toBe("bf1"); // nothing moved yet
    await game.p1.passPriority();
    if (game.decision()?.seat === P2 && game.chain().length > 0) {
      await game.p2.passPriority();
    }
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.locationOf("big")).toBe("bf2");
    expect(game.state("big").isReady).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
