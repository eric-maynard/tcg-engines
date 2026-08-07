/**
 * Thrill of the Hunt — unl-184-219 · Spell · Fury/Body · 2 energy
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Banish a friendly unit, then its owner plays it to any battlefield,
 *   ignoring its cost.
 *
 * Head-judge notes:
 *  - "to any battlefield" (rule 355.2.b) is an effect-granted destination: it
 *    overrides the normal play-location legality. EVERY battlefield is legal —
 *    including one the caster does not control and one that is empty — and the
 *    base is NOT a legal destination.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "unl-184-219";

function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { body: 1, fury: 1, rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "base", { might: 3, name: "Hunter" }, "hunter")
    .hand(P1, CARD, "thrill");
}

describe("Thrill of the Hunt (unl-184-219)", () => {
  test("the destination choice offers every battlefield (even uncontrolled ones) and never the base (rule 355.2.b)", async () => {
    const game = await board().build();
    await game.p1.cast("thrill", { targets: "hunter" });
    await game.settle();
    const decision = game.decision();
    expect(decision).toMatchObject({ kind: "pick", seat: P1, source: { pendingChoiceType: "choose-destination" } });
    const options = ((decision as unknown as { options?: { key: string }[] }).options ?? []).map((o) => o.key);
    expect(options).toEqual(expect.arrayContaining(["battlefield-bf1", "battlefield-bf2"]));
    expect(options).not.toContain("base");
  });

  test("the banished unit comes back to the chosen battlefield", async () => {
    const game = await board().build();
    await game.p1.cast("thrill", { targets: "hunter" });
    await game.settle();
    await game.p1.pick("battlefield-bf2");
    await game.settle();
    expect(game.locationOf("hunter")).toBe("bf2");
    expect(game.zoneOf("thrill")).toBe("trash");
  });
});
