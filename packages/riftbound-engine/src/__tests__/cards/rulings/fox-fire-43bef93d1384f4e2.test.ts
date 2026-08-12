/**
 * Ruling 43bef93d1384f4e2 — Fox-Fire (OGN-256 → ogn-256-298) · Spell · Calm/Mind · [3] · [Hidden] [Action]
 *   "Kill any number of units at a battlefield with total Might 4 or less."
 *
 * Q: Does Fox-Fire target the units when it is cast, or the battlefield (with the units chosen on resolution)?
 * A: The UNITS, chosen as the spell goes on the chain. You must name a legal set (total Might ≤ 4) up front.
 *    A unit that appears afterwards can never be hit. If the named targets gain Might in response, on
 *    resolution you pick a still-legal SUBSET of the original targets — you never re-aim at new ones.
 * Rules: 355.10/355.12 (targets are chosen as the item is put on the chain), 355.13/355.14 (multi-target
 *        "any number" sets), 355.11.b (illegal-on-resolution ⇒ choose a legal subset of the ORIGINAL targets).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FOX_FIRE = "ogn-256-298";
const SIPHON_POWER = "ogn-266-298"; // [Reaction] — friendly units at a battlefield +1 Might this turn
const unit = (might: number, name: string) => ({ cardType: "unit", energyCost: 1, might, name }) as const;

/** bf1 (P2's) holds two 2-Might units and one 3-Might unit; P2 also keeps a 1-Might unit at base. */
async function board(): Promise<Game> {
  return await scenario()
    .resources(P1, { energy: 9 })
    .resources(P2, { energy: 9, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", unit(2, "Alpha"), "a")
    .unit(P2, "bf1", unit(2, "Beta"), "b")
    .unit(P2, "bf1", unit(3, "Gamma"), "c")
    .unit(P2, "base", unit(1, "Homebody"), "home")
    .hand(P1, FOX_FIRE, "fox")
    .hand(P2, SIPHON_POWER, "siphon")
    .build();
}

describe("Ruling 43bef93d1384f4e2 — Fox-Fire targets a set of UNITS as it is cast", () => {
  test("the cast offers unit SETS whose total Might is ≤ 4 — not a battlefield", async () => {
    const game = await board();
    const field = game.p1.option("cast", "fox")?.fields.find((f) => f.name === "targets");

    expect(field?.kind).toBe("cards");
    // Alpha+Beta = 4 is offered; anything reaching 5 (e.g. Alpha+Gamma) is not; the base unit is out of scope.
    expect(field?.options).toEqual([[], ["a"], ["a", "b"], ["b"], ["c"]]);
  });

  test("a set totalling 5 is refused outright", async () => {
    const game = await board();

    const attempt = await game.p1.try((p) => p.cast("fox", { targets: ["a", "c"] }));

    expect(attempt.ok).toBe(false);
  });

  test("the chosen set is locked onto the chain item and exactly those units die", async () => {
    const game = await board();

    await game.p1.cast("fox", { targets: ["a", "b"] });
    expect(game.chain()).toMatchObject([{ cardId: "fox", targets: ["a", "b"] }]);

    await game.settle();
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.zoneOf("c")).toBe("battlefield-bf1"); // never a target
    expect(game.violations()).toEqual([]);
  });

  test("targets pumped in response → on resolution the caster picks a legal SUBSET of the original targets", async () => {
    const game = await board();

    await game.p1.cast("fox", { targets: ["a", "b"] }); // total 4 at cast time
    await game.p1.passPriority();
    await game.p2.cast("siphon", { targets: "bf1" }); // Alpha and Beta become 3 each — the set is now 6
    await game.settle();

    const decision = game.decision();
    expect(decision).toMatchObject({ kind: "pick", max: 2, min: 0, seat: P1, semantics: "subset" });
    // only the ORIGINAL targets are on offer — Gamma, pumped or not, was never chosen
    expect((decision as { options: { key: string }[] }).options.map((o) => o.key)).toEqual(["a", "b"]);

    await game.p1.pick("a"); // Alpha alone is 3 ≤ 4
    await game.settle();

    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("b")).toBe("battlefield-bf1"); // dropped from the set, survives
    expect(game.zoneOf("c")).toBe("battlefield-bf1");
  });
});
