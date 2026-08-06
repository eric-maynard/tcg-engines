/**
 * Interaction: Noxian Guillotine (ogn-254-298, Action, 4) "Choose a unit. Kill it the next time it
 *   takes damage this turn. [Legion] — Kill it now instead."
 *   × Counter Strike (sfd-194-221, Reaction, 2) "Choose a unit. The next time that unit would be
 *   dealt damage this turn, prevent it. Draw 1."
 *   × Sudden Storm (sfd-017-221, Action, 3) "Deal 2 to a unit at a battlefield. If it's attacking,
 *   deal 4 to it instead."
 *
 * Question: A resolves Guillotine WITHOUT Legion on B's 5-Might unit at a battlefield. B then
 * resolves Counter Strike on it. A then resolves Sudden Storm (2) at it. Does the Guillotine kill
 * fire? If A damages it again later this turn, does it die then? Contrast: Guillotine WITH Legion
 * and B responding with Counter Strike.
 *
 * Rules: 437.7 (Prevent is a delayed replacement effect, 389), 437.2/437.2.a (prevented damage is
 * replaced by damage reduced by the Prevent Value — here to 0), 437.4 + 417.1.e.1 (damage that is
 * entirely prevented was never dealt → "takes damage" conditions do not fire), 437.1.b.2, 158.2
 * ([Legion] "instead" replaces the delayed kill with an immediate kill — a kill is not damage, so
 * a Prevent has nothing to replace).
 *
 * Expected: no-Legion Guillotine arms a delayed kill; Counter Strike draws 1 on resolution and
 * turns Storm's 2 into 0, so the unit took no damage and survives with Guillotine STILL armed;
 * the next non-zero damage this turn (even non-lethal) kills it. With Legion the unit simply dies
 * on resolution regardless of Counter Strike (B still drew 1).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GUILLOTINE = "ogn-254-298";
const COUNTER_STRIKE = "sfd-194-221";
const SUDDEN_STORM = "sfd-017-221";
const HEXTECH_RAY = "ogn-009-298"; // Deal 3 to a unit at a battlefield — the "later damage this turn"

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** Flatten the `targets` field of a seat's cast option into the set of card ids offered. */
function targetsOffered(game: Game, seat: "p1" | "p2", alias: string): string[] {
  const opt = game[seat].option("cast", alias);
  const field = opt?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/**
 * Cast Counter Strike at `target`. The engine currently exposes no target field for it (see BUG
 * below), so only pass `targets` when the option actually asks for one — keeps the non-BUG tests
 * meaningful both before and after the fix.
 */
async function castCounterStrike(game: Game, target: string): Promise<void> {
  const wantsTarget = game.p2.option("cast", "cs")?.fields.some((f) => f.name === "targets") ?? false;
  await game.p2.cast("cs", wantsTarget ? { targets: target } : {});
}

function board() {
  return (
    scenario()
      .resources(P1, { energy: 20, power: { fury: 5, order: 5, rainbow: 5 } })
      .resources(P2, { energy: 20, power: { calm: 5, body: 5, rainbow: 5 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Big Foe" }, "foe") // B's 5-Might unit at a battlefield
      .unit(P1, "base", { might: 1, name: "Bystander" }, "ally") // a second unit so targeting is a real choice
      // A 0-cost card A can play first to turn Legion on for the contrast case.
      .hand(P1, { energyCost: 0, might: 1, name: "Cheap Recruit" }, "recruit")
      .hand(P1, GUILLOTINE, "ng")
      .hand(P1, SUDDEN_STORM, "storm")
      .hand(P1, HEXTECH_RAY, "ray")
      .hand(P2, COUNTER_STRIKE, "cs")
  );
}

describe("Noxian Guillotine × Counter Strike × Sudden Storm — prevented damage is not 'taking damage'", () => {
  test("no Legion: Guillotine resolves leaving the unit alive with a delayed kill armed on it", async () => {
    const game = await board().build();
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(0); // first card this turn → no Legion
    await game.p1.cast("ng", { targets: "foe" });
    await game.settle();
    expect(game.zoneOf("ng")).toBe("trash");
    expect(game.locationOf("foe")).toBe("bf1");
    expect(game.state("foe").damage).toBe(0);
    const armed = (game.gameState.activeReplacements ?? []) as { replaces?: string; sourceCardId?: string; targetCardIds?: string[] }[];
    expect(armed).toEqual([expect.objectContaining({ replaces: "take-damage", sourceCardId: "ng", targetCardIds: ["foe"] })]);
  });

  test("Counter Strike then resolves for B: B draws 1 immediately on resolution (net hand size unchanged: -CS +1)", async () => {
    const game = await board().build();
    await game.p1.cast("ng", { targets: "foe" });
    await game.settle();
    const p2Hand = game.p2.hand().length;
    const p2Deck = game.p2.deck().length;
    expect(game.p2.can("cast", "cs")).toBe(true); // Reaction: playable on A's turn in the open state
    await castCounterStrike(game, "foe");
    expect(game.chain().map((c) => c.name)).toEqual(["Counter Strike"]);
    await game.settle();
    expect(game.zoneOf("cs")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand - 1 + 1);
    expect(game.p2.deck()).toHaveLength(p2Deck - 1);
    // Counter Strike deals no damage: the Guillotine target is untouched and still alive.
    expect(game.locationOf("foe")).toBe("bf1");
  });

  test.failing("BUG: Counter Strike must 'Choose a unit' at play time — the engine offers no target at all (parser dropped the Prevent clause)", async () => {
    // Expected: the cast option has a `targets` field offering every unit (foe, ally).
    // Actual: Counter Strike is parsed as just "Draw 1" — no target field, no prevention installed.
    const game = await board().build();
    const offered = targetsOffered(game, "p2", "cs");
    expect(offered).toContain(game.card("foe"));
    expect(offered).toContain(game.card("ally"));
    await expect(game.p2.cast("cs")).rejects.toThrow(); // a target IS required
  });

  test("control (no Counter Strike): Sudden Storm's 2 damage is 'taking damage' → Guillotine kills the 5-Might unit", async () => {
    const game = await board().build();
    await game.p1.cast("ng", { targets: "foe" });
    await game.settle();
    await game.p1.cast("storm", { targets: "foe" });
    await game.settle();
    expect(game.zoneOf("storm")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("trash"); // 2 < 5, but the delayed kill fired
    expect(game.gameState.activeReplacements ?? []).toHaveLength(0); // single-fire, spent
  });

  test.failing("BUG: Guillotine → Counter Strike → Sudden Storm: the 2 is prevented to 0, the unit took no damage, survives, and Guillotine stays armed (437.2.a, 437.4, 417.1.e.1)", async () => {
    // Expected: Counter Strike's Prevent replaces Storm's 2 with 0; fully prevented damage is not
    // dealt, so "the next time it takes damage" has not happened — foe alive, 0 damage, Guillotine's
    // delayed kill still in activeReplacements, Counter Strike's prevent consumed.
    // Actual: Counter Strike installs no prevention; Storm deals 2 and Guillotine kills foe.
    const game = await board().build();
    await game.p1.cast("ng", { targets: "foe" });
    await game.settle();
    await castCounterStrike(game, "foe");
    await game.settle();
    await game.p1.cast("storm", { targets: "foe" });
    await game.settle();
    expect(game.zoneOf("storm")).toBe("trash");
    expect(game.locationOf("foe")).toBe("bf1");
    expect(game.state("foe").damage).toBe(0);
    const armed = (game.gameState.activeReplacements ?? []) as { sourceCardId?: string }[];
    expect(armed.map((e) => e.sourceCardId)).toEqual(["ng"]); // Guillotine still armed; Counter Strike's shield used up
  });

  test.failing("BUG: after the prevented hit, the NEXT real damage this turn (Hextech Ray 3, non-lethal to 5 Might) triggers the still-armed Guillotine and kills it", async () => {
    // Expected: Storm was prevented (unit survives), then Ray's 3 is real damage → Guillotine kills.
    // Actual: the unit already died to Storm because nothing was prevented, so Ray has no target.
    const game = await board().build();
    await game.p1.cast("ng", { targets: "foe" });
    await game.settle();
    await castCounterStrike(game, "foe");
    await game.settle();
    await game.p1.cast("storm", { targets: "foe" });
    await game.settle();
    expect(game.locationOf("foe")).toBe("bf1"); // survived the prevented Storm
    await game.p1.cast("ray", { targets: "foe" });
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash"); // 3 < 5 Might, killed by Guillotine not by lethal damage
    expect(game.gameState.activeReplacements ?? []).toHaveLength(0);
  });

  test("contrast — Legion active: B responds to Guillotine with Counter Strike; CS resolves first (B draws 1), then 'Kill it now instead' kills the unit outright — a kill is not damage (158.2)", async () => {
    const game = await board().build();
    await game.p1.play("recruit"); // "another card this turn" → Legion on
    await game.settle();
    expect(game.zoneOf("recruit")).toBe("base");
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);

    const p2Hand = game.p2.hand().length;
    await game.p1.cast("ng", { targets: "foe" });
    expect(game.actingSeat()).toBe(P1); // caster holds priority first
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "cs")).toBe(true); // Reaction in response
    await castCounterStrike(game, "foe");
    expect(game.chain().map((c) => c.name)).toEqual(["Noxian Guillotine", "Counter Strike"]); // CS on top
    await game.settle();

    expect(game.zoneOf("cs")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand - 1 + 1); // B still drew 1
    expect(game.zoneOf("ng")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("trash"); // killed NOW — prevention is irrelevant to a kill
    // "instead": no delayed take-damage kill is left behind (158.2).
    expect(game.gameState.activeReplacements ?? []).toHaveLength(0);
    expect(game.chain()).toHaveLength(0);
  });

  test("contrast — Legion active, no response: Guillotine kills the undamaged 5-Might unit immediately on resolution", async () => {
    const game = await board().build();
    await game.p1.play("recruit");
    await game.settle();
    await game.p1.cast("ng", { targets: "foe" });
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.gameState.activeReplacements ?? []).toHaveLength(0);
    expect(game.locationOf("ally")).toBe("base"); // only the chosen unit
  });
});
