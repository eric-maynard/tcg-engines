/**
 * Interaction: Salvage (ogn-224-298, Action spell, 2 + [order]) "You may kill up to one gear. Draw 1."
 *   × Brittle Steel (ven-003-166, spell, 2 + [fury]) "Kill a gear. [Flow] [4][fury] (You may play
 *     this from your trash for its Flow cost. Then banish it.)"
 *   × Zhonya's Hourglass (ogn-077-298, gear) "If a friendly unit would die, kill this instead. …"
 *
 * Question: P1 holds Salvage and Brittle Steel with resources for either; a second Brittle Steel is
 * in P1's trash (Flow). (a) NO gear anywhere on the board. (b) The only gear is P1's OWN Zhonya's
 * Hourglass in P1's base. Which spells appear in P1's legal actions (hand and Flow-from-trash), what
 * prompts does Salvage produce, and does Salvage still draw?
 *
 * Rules: 355.8 (a spell needs valid choices for ALL its targets to be put on the chain), 355.9.a.1
 * ("gear" = a gear on the board), 355.12 ("may <action> some number of objects" → the choices are
 * targets, chosen independently of the decision to act), 355.13 ("up to" → zero is a legal number;
 * chosen zero → played with no targets), 355.15 (choices are locked at finalization), 359.3.e.8 /
 * 359.3.e.11 (partial execution — the Draw 1 stands on its own).
 *
 * Expected: (a) Brittle Steel is absent from the legal actions both from hand and via Flow (Flow
 * changes zone/cost, not targeting); Salvage is playable with zero targets, produces no gear prompt
 * and no yes/no, and draws 1. (b) Brittle Steel becomes legal from hand and via Flow with P1's own
 * Hourglass as its lone target and kills it (Zhonya's only replaces a friendly UNIT's death, not
 * its own); Salvage offers {none, Hourglass}: none → Hourglass stays, draw 1; Hourglass → it dies,
 * draw 1. Never a "perform this?" yes/no — the option lives entirely in the 0-or-1 target choice.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SALVAGE = "ogn-224-298";
const BRITTLE_STEEL = "ven-003-166";
const ZHONYAS = "ogn-077-298";
const SKULKER = "ogn-175-298"; // known deck top so the draw is identifiable

/**
 * P1's turn with 6 energy + 1 fury + 1 order: enough for Salvage (2+order), Brittle Steel from hand
 * (2+fury) or Brittle Steel via Flow (4+fury). Units on both sides so the board is not empty — just
 * gear-less unless `withHourglass`.
 */
function board(withHourglass: boolean) {
  const s = scenario()
    .resources(P1, { energy: 6, power: { fury: 1, order: 1 } })
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
    .hand(P1, SALVAGE, "salvage")
    .hand(P1, BRITTLE_STEEL, "steelHand")
    .trash(P1, BRITTLE_STEEL, "steelTrash")
    .deckTop(P1, SKULKER, "top");
  return withHourglass ? s.gear(P1, ZHONYAS, "hourglass") : s;
}

/** The distinct target tuples the cast option for `alias` offers (e.g. [[], ["hourglass"]]). */
function targetTuples(game: Game, alias: string): string[][] {
  const field = game.p1.option("cast", alias)?.fields.find((f) => f.name === "targets");
  return ((field?.options ?? []) as string[][]).map((t) => [...t]);
}

describe("(a) no gear anywhere on the board", () => {
  test("Brittle Steel from HAND is not a legal action at all (355.8: 'a gear' has no valid choice) — absent from the menu, cast attempt refused, resources untouched", async () => {
    const game = await board(false).build();
    expect(game.p1.legal().some((o) => o.card === "steelHand")).toBe(false);
    expect(game.p1.can("cast", "steelHand")).toBe(false);
    const r = await game.p1.try((p) => p.cast("steelHand"));
    expect(r.ok).toBe(false);
    expect((await game.p1.try((p) => p.cast("steelHand", { targets: "foe" }))).ok).toBe(false); // a unit is not gear
    expect(game.zoneOf("steelHand")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 6, power: { fury: 1, order: 1 } });
    expect(game.chain()).toEqual([]);
  });

  test("Brittle Steel via FLOW from the trash is equally absent — Flow changes zone and cost, not the targeting requirement", async () => {
    const game = await board(false).build();
    expect(game.p1.legal().some((o) => o.card === "steelTrash")).toBe(false);
    expect(game.p1.can("cast", "steelTrash")).toBe(false);
    expect((await game.p1.try((p) => p.cast("steelTrash", { flow: true }))).ok).toBe(false);
    expect(game.zoneOf("steelTrash")).toBe("trash");
  });

  test("Salvage IS legal: 'up to one' makes zero a valid target count (355.13) — its target field offers only the empty choice", async () => {
    const game = await board(false).build();
    expect(game.p1.can("cast", "salvage")).toBe(true);
    const field = game.p1.option("cast", "salvage")?.fields.find((f) => f.name === "targets");
    expect(field).toMatchObject({ max: 0, min: 0 });
    expect(targetTuples(game, "salvage")).toEqual([[]]);
  });

  test("casting Salvage with nothing chosen: no gear prompt and no yes/no — it goes straight onto the chain with zero targets (355.12/355.15), pays 2 + [order], and on resolution P1 draws 1", async () => {
    const game = await board(false).script(P1, [], { strict: true }).build(); // strict: any unscripted prompt for P1 would throw
    await game.p1.cast("salvage");
    expect(game.decision()?.kind).toBe("action"); // priority window, not a question
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "salvage", controller: P1, targets: [], triggered: false })]);
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 1, order: 0 } });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("salvage")).toBe("trash");
    expect(game.zoneOf("top")).toBe("hand");
    expect(game.p1.hand().sort()).toEqual(["steelHand", "top"]);
    expect(game.locationOf("ally")).toBe("base");
    expect(game.locationOf("foe")).toBe("base");
    expect(game.violations()).toEqual([]);
  });
});

describe("(b) the only gear is P1's own Zhonya's Hourglass", () => {
  test("Brittle Steel from hand becomes legal; its lone legal target is P1's OWN Hourglass (friendliness is irrelevant); it kills it on resolution — Zhonya's does not save itself", async () => {
    const game = await board(true).build();
    expect(game.p1.can("cast", "steelHand")).toBe(true);
    expect(targetTuples(game, "steelHand")).toEqual([["hourglass"]]);
    expect((await game.p1.try((p) => p.cast("steelHand", { targets: "ally" }))).ok).toBe(false);
    await game.p1.cast("steelHand", { targets: "hourglass" });
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 0, order: 1 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "steelHand", targets: ["hourglass"] })]);
    await game.settle();
    expect(game.zoneOf("hourglass")).toBe("trash");
    expect(game.zoneOf("steelHand")).toBe("trash");
    expect(game.locationOf("ally")).toBe("base"); // the replacement is about units dying, nothing happened to the unit
  });

  test("Brittle Steel via Flow is legal too ([4][fury] from the trash, same lone target); it kills the Hourglass and is then banished", async () => {
    const game = await board(true).build();
    expect(game.p1.can("cast", "steelTrash")).toBe(true);
    expect(targetTuples(game, "steelTrash")).toEqual([["hourglass"]]);
    await game.p1.cast("steelTrash", { flow: true, targets: "hourglass" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 0, order: 1 } });
    await game.settle();
    expect(game.zoneOf("hourglass")).toBe("trash");
    expect(game.zoneOf("steelTrash")).toBe("banishment");
  });

  test("Salvage now offers exactly {no gear, own Hourglass} as its optional target set (0..1)", async () => {
    const game = await board(true).build();
    const field = game.p1.option("cast", "salvage")?.fields.find((f) => f.name === "targets");
    expect(field).toMatchObject({ max: 1, min: 0 });
    const tuples = targetTuples(game, "salvage");
    expect(tuples).toHaveLength(2);
    expect(tuples).toEqual(expect.arrayContaining([[], ["hourglass"]]));
    expect(tuples.flat()).not.toContain("ally");
    expect(tuples.flat()).not.toContain("foe");
  });

  test("Salvage choosing NONE: no yes/no, Hourglass untouched, still draws 1", async () => {
    const game = await board(true).script(P1, [], { strict: true }).build();
    await game.p1.cast("salvage", { targets: [] });
    expect(game.decision()?.kind).toBe("action");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "salvage", targets: [] })]);
    await game.settle();
    expect(game.zoneOf("hourglass")).toBe("base");
    expect(game.zoneOf("top")).toBe("hand");
    expect(game.zoneOf("salvage")).toBe("trash");
  });

  test("Salvage choosing the Hourglass: it is killed, THEN P1 draws 1 — again with no yes/no anywhere", async () => {
    const game = await board(true).script(P1, [], { strict: true }).build();
    await game.p1.cast("salvage", { targets: "hourglass" });
    expect(game.decision()?.kind).toBe("action");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "salvage", targets: ["hourglass"] })]);
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 1, order: 0 } });
    await game.settle();
    expect(game.zoneOf("hourglass")).toBe("trash");
    expect(game.zoneOf("top")).toBe("hand");
    expect(game.p1.hand().sort()).toEqual(["steelHand", "top"]);
    expect(game.zoneOf("salvage")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
