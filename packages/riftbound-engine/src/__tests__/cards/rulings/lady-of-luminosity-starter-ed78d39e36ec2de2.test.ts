/**
 * Ruling ed78d39e36ec2de2 — Lady of Luminosity - Starter (OGS-021 → ogs-021-024, Lux legend) · "When you play a spell that costs [5]
 *     or more, draw 1."
 *   × Sky Splitter (OGN-014 → ogn-014-298) · Action · [8][fury] · "This spell's Energy cost is reduced by the highest Might among units
 *     you control. Deal 5 to a unit at a battlefield."
 *   × Defy (OGN-045 → ogn-045-298) "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Kai'Sa, Evolutionary (ogn-112-298) "When I conquer, you may play a spell from your trash with Energy cost less than your points…"
 *   × Eager Apprentice (OGN-084 → ogn-084-298) "While I'm at a battlefield, the Energy costs for spells you play is reduced by [1]…"
 *   (Promising Future ogn-115-298 is cited only as another "play ignoring cost" example.)
 *
 * Q: How do cost reductions interact with cards that reference a spell's cost (counters, Kai'Sa's conquer, Lux legend)?
 * A: "Cost" always means the PRINTED cost. Reductions change what you pay, not the card's cost: a discounted Sky Splitter can never
 *    be Defied (printed 8 > 4); Kai'Sa can't fetch Sky Splitter from trash however cheap it would be to cast; Lux still draws for a
 *    printed-5+ spell you paid less (even 0) for.
 * Rules: 131.4 (cost = printed cost), 353.4 (reductions apply to the payment), 425 (counter legality by cost).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LUX_LEGEND = "ogs-021-024";
const SKY_SPLITTER = "ogn-014-298";
const DEFY = "ogn-045-298";
const KAISA_EVOLUTIONARY = "ogn-112-298";
const EAGER_APPRENTICE = "ogn-084-298";
const DISCIPLINE = "ogn-058-298"; // a printed-[2] spell for contrast: "Give a unit +2 [Might] this turn. Draw 1."

/**
 * P1's turn. P1 controls a 6-Might Giant (Sky Splitter: 8 − 6 = [2]) and has exactly [2]+[fury]; Sky Splitter in hand.
 * P2 holds bf1 with a 7-Might Guard and has Defy with [1]+[calm]. Optionally the Lux legend for P1.
 */
function board(opts: { lux?: boolean } = {}) {
  const s = scenario()
    .resources(P1, { energy: 2, power: { fury: 1 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 6, name: "Giant" }, "giant")
    .unit(P2, "bf1", { might: 7, name: "Guard" }, "guard")
    .hand(P1, SKY_SPLITTER, "sky")
    .hand(P2, DEFY, "defy")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
  return opts.lux ? s.legend(P1, LUX_LEGEND, "lux") : s;
}

async function castDiscountedSkySplitter(game: Game): Promise<void> {
  expect(game.state("sky").energyCost).toBe(8); // the card's cost is its printed cost
  expect(game.p1.can("cast", "sky")).toBe(true); // …yet castable with 2 energy thanks to the Giant
  await game.p1.cast("sky", { targets: "guard" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } }); // PAID 2 + fury
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sky", targets: ["guard"] })]);
}

describe("Ruling ed78d39e36ec2de2 — 'cost' means printed cost: reductions don't change what Defy / Kai'Sa / Lux see", () => {
  test("Defy: a Sky Splitter cast for [2] is still an [8] spell — with it on the chain P2's Defy has no legal target (cannot be cast at it); Sky Splitter resolves for 5", async () => {
    const game = await board().build();
    await castDiscountedSkySplitter(game);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "defy")).toBe(false);
    const r = await game.p2.try((p) => p.cast("defy", { targets: "sky" }));
    expect(r.ok).toBe(false);
    await game.settle();
    expect(game.zoneOf("sky")).toBe("trash");
    expect(game.state("guard").damage).toBe(5);
    expect(game.zoneOf("defy")).toBe("hand");
  });

  test("contrast: the same Defy CAN counter a printed-[2] spell (Discipline) — the gate really is printed cost ≤ 4", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { calm: 1 } })
      .resources(P2, { energy: 1, power: { calm: 1 } })
      .unit(P1, "base", { might: 6, name: "Giant" }, "giant")
      .hand(P1, DISCIPLINE, "disc")
      .hand(P2, DEFY, "defy")
      .build();
    await game.p1.cast("disc", { targets: "giant" });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "defy")).toBe(true);
    await game.p2.cast("defy", { targets: "disc" });
    await game.settle();
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.state("giant").mightModifier).toBe(0); // countered: no +2
  });

  test("Lux legend: Sky Splitter paid at [2] still 'costs [5] or more' → P1 draws 1 when it is played", async () => {
    const game = await board({ lux: true }).build();
    await castDiscountedSkySplitter(game);
    expect(game.p1.hand()).toEqual([]);
    await game.settle();
    expect(game.zoneOf("sky")).toBe("trash");
    expect(game.state("guard").damage).toBe(5);
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.violations().filter((v) => v.invariant !== "costPaid")).toEqual([]);
  });

  test("Lux legend, other direction: a printed-[2] spell never draws, and Eager Apprentice discounting it changes nothing about that", async () => {
    const game = await scenario()
      .legend(P1, LUX_LEGEND, "lux")
      .resources(P1, { energy: 2, power: { calm: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", EAGER_APPRENTICE, "appr")
      .unit(P1, "base", { might: 6, name: "Giant" }, "giant")
      .hand(P1, DISCIPLINE, "disc")
      .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"])
      .build();
    await game.p1.cast("disc", { targets: "giant" });
    expect(game.p1.energy()).toBe(1); // 2 → 1 with the Apprentice at a battlefield
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]); // Discipline's own "Draw 1" only — no legend draw
    expect(game.p1.deck()[0]).toBe("d2");
  });

  test("Kai'Sa, Evolutionary: conquering to 4 points with Sky Splitter (printed 8, would cost [2] to cast) and Discipline (2) in the trash — only Discipline is offered; Sky Splitter's printed 8 is not 'less than your points'", async () => {
    const game = await scenario()
      .points(P1, 3)
      .resources(P1, { power: { calm: 1, fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", KAISA_EVOLUTIONARY, "kaisa")
      .unit(P1, "base", { might: 6, name: "Giant" }, "giant")
      .unit(P2, "bf1", { might: 1, name: "Blocker" }, "blocker")
      .trash(P1, SKY_SPLITTER, "sky")
      .trash(P1, DISCIPLINE, "disc")
      .build();
    await game.p1.move("kaisa", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(4);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "kaisa" } });
    await game.p1.yes();
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(offered).toContain("disc");
    expect(offered).not.toContain("sky");
    await game.p1.pick("disc");
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("kaisa"); // Discipline's own target, if asked
    }
    await game.settle();
    expect(game.zoneOf("sky")).toBe("trash"); // never left the trash
    expect(game.zoneOf("disc")).toBe("mainDeck"); // played free, then recycled
    expect(game.state("blocker").zone).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
