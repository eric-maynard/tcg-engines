/**
 * Ruling 1860b7791b96f31a — Icathian Rain (OGN-248 → ogn-248-298, [7] + [rainbow]×3) "Deal 2 to a unit." ×6
 *   × Walking Roost (UNL-130 → unl-130-219) · 6 Might · [Deflect]
 *   × Volibear, Furious (OGN-041 → ogn-041-298) · 9 Might · [Deflect 2]
 *   × Frigid Touch (SFD-066 → sfd-066-221) · [Reaction] [2], [Repeat] [2] · "Give a unit -2 [Might] this turn."
 *
 * Q: Do you have to pay the Deflect cost twice if you Repeat a card (choosing the same Deflect unit both times)?
 * A: Yes. Deflect is a mandatory ADDITIONAL cost charged "for each time they choose me", and the choices for a
 *    Repeat execution are made while the card is played — so choosing the same unit for both executions is choosing
 *    it twice and costs twice. The same holds for a multi-instance spell like Icathian Rain: N instances aimed at one
 *    Deflect unit cost N surcharges, not one per card. A [Deflect 2] unit charges its value each time.
 * Rules: 809.1.c (Deflect = "…cost [Deflect Value] more … for each time they choose me"), 809.1.b.3 (omitted X = 1),
 *        809.1.c.1 (the surcharge Power may be any Domain), 809.1.d (a Mandatory Additional Cost),
 *        820.1.d (Repeat = "pay [Cost] as an additional cost … execute the instructions one additional time"),
 *        820.2/820.2.a (the extra execution's choices are made in the Make Relevant Choices step, and may differ).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ICATHIAN_RAIN = "ogn-248-298";
const FRIGID_TOUCH = "sfd-066-221";
const WALKING_ROOST = "unl-130-219"; // 6 Might, [Deflect]
const VOLIBEAR_FURIOUS = "ogn-041-298"; // 9 Might, [Deflect 2]

/** P1's turn, Icathian Rain in hand. P2 holds bf1 with Walking Roost ([Deflect], 6) and a plain 4-Might Grunt. */
function rainBoard(power: number) {
  return scenario()
    .resources(P1, { energy: 7, power: { rainbow: power } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", WALKING_ROOST, "roost")
    .unit(P2, "bf1", { might: 4, name: "Grunt" }, "grunt")
    .hand(P1, ICATHIAN_RAIN, "rain");
}

/** P1's turn with Frigid Touch in hand; P2's Walking Roost ([Deflect], 6) and Grunt (4) sit at bf1. */
function touchBoard(energy: number, power: number) {
  return scenario()
    .resources(P1, { energy, power: { rainbow: power } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", WALKING_ROOST, "roost")
    .unit(P2, "bf1", { might: 4, name: "Grunt" }, "grunt")
    .hand(P1, FRIGID_TOUCH, "touch");
}

describe("Ruling 1860b7791b96f31a — Deflect is charged once per CHOICE, so a Repeat that re-chooses the same unit pays twice", () => {
  test("baseline: the Deflect unit has the keyword and choosing it ONCE with Icathian Rain costs one extra [rainbow]", async () => {
    const game = await rainBoard(4).build(); // 3 for the card + 1 Deflect
    expect(game.state("roost").keywords).toContain("Deflect");
    await game.p1.cast("rain", {
      targets: ["roost", "grunt", "grunt", "grunt", "grunt", "grunt"],
    });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await game.settle();
    expect(game.state("roost").damage).toBe(2);
    expect(game.zoneOf("grunt")).toBe("trash"); // 5 × 2 = 10 on a 4-Might Grunt
    expect(game.violations()).toEqual([]);
  });

  test("choosing the SAME Deflect unit with three instances costs THREE extra [rainbow] — not one per card", async () => {
    const short = await rainBoard(5).build(); // 3 + only 2 spare — one short of the three surcharges
    const rejected = await short.p1.try((p) =>
      p.cast("rain", { targets: ["roost", "roost", "roost", "grunt", "grunt", "grunt"] }),
    );
    expect(rejected.ok).toBe(false);
    expect(short.zoneOf("rain")).toBe("hand");

    const game = await rainBoard(6).build(); // 3 + 3 surcharges
    await game.p1.cast("rain", { targets: ["roost", "roost", "roost", "grunt", "grunt", "grunt"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await game.settle();
    expect(game.zoneOf("roost")).toBe("trash"); // 3 × 2 = 6 kills the 6-Might Roost
    expect(game.zoneOf("grunt")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("a [Deflect 2] unit charges its VALUE per choice: two instances at Volibear cost four extra [rainbow]", async () => {
    const board = (power: number) =>
      scenario()
        .resources(P1, { energy: 7, power: { rainbow: power } })
        .battlefield("bf1", { controller: P2 })
        .unit(P2, "bf1", VOLIBEAR_FURIOUS, "voli")
        .unit(P2, "bf1", { might: 4, name: "Grunt" }, "grunt")
        .hand(P1, ICATHIAN_RAIN, "rain");
    const short = await board(6).build(); // 3 + 3 — one short of 2 × [Deflect 2]
    expect(
      (await short.p1.try((p) => p.cast("rain", { targets: ["voli", "voli", "grunt", "grunt", "grunt", "grunt"] })))
        .ok,
    ).toBe(false);

    const game = await board(7).build(); // 3 + 4
    expect(game.state("voli").keywords).toContain("Deflect");
    await game.p1.cast("rain", { targets: ["voli", "voli", "grunt", "grunt", "grunt", "grunt"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await game.settle();
    expect(game.state("voli").damage).toBe(4);
    expect(game.zoneOf("voli")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });

  test("REPEAT, same target twice: Frigid Touch [2] + Repeat [2] on the Deflect unit both times needs TWO Deflect surcharges", async () => {
    const short = await touchBoard(4, 1).build(); // 2 + Repeat 2 energy, but only 1 surcharge available
    expect((await short.p1.try((p) => p.cast("touch", { repeat: 1, targets: ["roost", "roost"] }))).ok).toBe(false);
    expect(short.zoneOf("touch")).toBe("hand");

    const game = await touchBoard(4, 2).build();
    await game.p1.cast("touch", { repeat: 1, targets: ["roost", "roost"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } }); // 4 energy + 2 Deflect pips
    await game.settle();
    expect(game.state("roost").might).toBe(2); // 6 − 2 − 2: both executions landed
    expect(game.zoneOf("touch")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("REPEAT, only one execution chooses the Deflect unit: exactly ONE surcharge (820.2.a — the choices are independent)", async () => {
    const game = await touchBoard(4, 1).build();
    await game.p1.cast("touch", { repeat: 1, targets: ["roost", "grunt"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await game.settle();
    expect(game.state("roost").might).toBe(4); // 6 − 2
    expect(game.state("grunt").might).toBe(2); // 4 − 2
    expect(game.violations()).toEqual([]);
  });

  test("no Repeat: a single Frigid Touch at the Deflect unit costs [2] plus one surcharge and applies −2 once", async () => {
    const game = await touchBoard(2, 1).build();
    await game.p1.cast("touch", { targets: "roost" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await game.settle();
    expect(game.state("roost").might).toBe(4);
    expect(game.violations()).toEqual([]);
  });
});
