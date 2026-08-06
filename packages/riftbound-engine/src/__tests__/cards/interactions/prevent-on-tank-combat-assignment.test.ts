/**
 * Interaction: Prevent effects on a Tank defender during combat-damage assignment.
 *
 *   Sunlit Guardian (ogn-054-298) — 3 Might, "[Shield] (+1 Might while I'm a defender.)
 *     [Tank] (I must be assigned combat damage first.)"  → 4 Might while defending
 *   Ki Barrier (ven-126-166) — Reaction, 2 energy + [order]: "Choose a unit. Prevent the next 7
 *     damage that would be dealt to it this turn. (Opponents can assign it extra combat damage
 *     to kill it.)"   — VEN is not in the engine card pool, so it is declared inline below.
 *   Counter Strike (sfd-194-221) — Reaction, 2 energy + [calm/body]: "Choose a unit. The next
 *     time that unit would be dealt damage this turn, prevent it. Draw 1."
 *
 * Rules: 465.2.c.6 (Tank must be assigned first), 465.2.c.3 (full lethal before the next unit),
 * 465.2.c.4 (no more than minimum lethal unless no units remain), 465.2.c.5 (replacement
 * effects — Prevent — apply at ASSIGNMENT time), 437.5.a (lethal is computed including the
 * Prevent Value), 437.5.b (Prevent Value "All" → no amount is ever lethal), 465.2.c.10 (a
 * Counter-Strike'd unit can still "be dealt damage", so it is NOT exempt from mandatory
 * assignment), 437.4 (fully prevented damage counts as not dealt), 437.7 (Prevent is a delayed
 * replacement effect).
 *
 * Question: P2 defends bf1 with Sunlit Guardian + a vanilla 4-Might unit.
 *   Case 1  — Ki Barrier on Guardian, attacker 12 Might: lethal for Guardian = 4 + 7 = 11, so
 *             exactly 11 → Guardian (takes 4, dies), 1 → vanilla (survives). Attacker survives
 *             the defenders' 8, both sides have survivors → attacker is recalled, P2 keeps bf1.
 *   Case 1b — Ki Barrier, attacker 8 Might: 8 < 11 so all 8 must stay on the Tank; Guardian
 *             takes 1 and lives; vanilla is assigned nothing. Both defenders live.
 *   Case 2  — Counter Strike on Guardian, attacker 12 Might: Prevent Value is effectively "All"
 *             → never lethal, yet not exempt (465.2.c.10) → all 12 go on Guardian and are
 *             prevented. Guardian 0, vanilla 0, both survive; P2 also drew 1.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SUNLIT_GUARDIAN = "ogn-054-298";
const COUNTER_STRIKE = "sfd-194-221";
/** Ki Barrier (ven-126-166) — hand-authored: the VEN set is not shipped in the card pool. */
const KI_BARRIER = {
  abilities: [
    {
      effect: { amount: 7, duration: "turn", target: { type: "unit" }, type: "prevent-damage" },
      timing: "reaction",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "order",
  energyCost: 2,
  id: "ven-126-166",
  name: "Ki Barrier",
  powerCost: ["order"],
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nChoose a unit. Prevent the next 7 damage that would be dealt to it this turn. (Opponents can assign it extra combat damage to kill it.)",
  timing: "reaction",
};

type Def = string | Record<string, unknown>;

/**
 * P2 holds bf1 with Sunlit Guardian (Tank/Shield) + a vanilla 4-Might unit and has the
 * protective Reaction in hand with enough to pay for it. P1 has one attacker of the given Might.
 */
function board(attackerMight: number, reaction: Def) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", SUNLIT_GUARDIAN, "guardian")
    .unit(P2, "bf1", { might: 4, name: "Vanilla Defender" }, "vanilla")
    .unit(P1, "base", { might: attackerMight, name: "Bruiser" }, "bruiser")
    .resources(P2, { energy: 2, power: { order: 1, calm: 1 } })
    .hand(P2, reaction as string, "react");
}

/** P1 attacks bf1, passes Focus; P2 answers with the Reaction on Sunlit Guardian; combat resolves. */
async function attackAndProtect(game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>) {
  await game.p1.move("bruiser", "bf1");
  await game.p1.passFocus();
  await game.p2.cast("react", { targets: "guardian" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["react"]);
  await game.settle();
}

describe("Prevent on a Tank defender × combat damage assignment", () => {
  test("control: with no Prevent, a 12-Might attacker kills both 4-Might defenders (Tank first, then vanilla) and conquers", async () => {
    const game = await board(12, KI_BARRIER).build();
    await game.p1.move("bruiser", "bf1");
    await game.settle(); // nobody reacts
    expect(game.zoneOf("guardian")).toBe("trash");
    expect(game.zoneOf("vanilla")).toBe("trash");
    expect(game.locationOf("bruiser")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("the defender can answer the attack with Ki Barrier on Sunlit Guardian during the showdown (Reaction; pays 2 energy + 1 order)", async () => {
    const game = await board(12, KI_BARRIER).build();
    await game.p1.move("bruiser", "bf1");
    await game.p1.passFocus();
    expect(game.p2.can("cast", "react")).toBe(true);
    await game.p2.cast("react", { targets: "guardian" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0, calm: 1 } });
    expect(game.chain().map((c) => c.name)).toEqual(["Ki Barrier"]);
    expect(game.zoneOf("react")).toBe("chain");
  });

  test("Case 1 — Ki Barrier (prevent 7) + 12-Might attacker: Guardian must be assigned 11 (4 Might + 7 prevent) and dies, vanilla takes only 1 and survives, attacker is recalled (465.2.c.3-5, 437.5.a). Engine ignores Prevent in combat assignment", async () => {
    // Expected: assignment 11/1; Guardian dealt 11-7=4 → dies; vanilla 1 → lives; P2 keeps bf1.
    // Actual: combat resolver assigns 4 to Guardian, 4 to vanilla (+4 overflow) — both die, P1 conquers.
    const game = await board(12, KI_BARRIER).build();
    await attackAndProtect(game);
    expect(game.zoneOf("react")).toBe("trash");
    expect(game.zoneOf("guardian")).toBe("trash");
    expect(game.locationOf("vanilla")).toBe("bf1");
    expect(game.locationOf("bruiser")).toBe("base"); // both sides survived → attacker recalled
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("Case 1b — Ki Barrier + 8-Might attacker: 8 < 11 so all 8 must stay on the Tank; Guardian takes 1 and survives, vanilla is assigned nothing; both defenders live (465.2.c.3, 465.2.c.6, 437.5.a)", async () => {
    // Expected: Guardian dealt 8-7=1, survives; vanilla untouched; P2 keeps bf1 with both units.
    // Actual: 4 → Guardian, 4 → vanilla; both defenders die.
    const game = await board(8, KI_BARRIER).build();
    await attackAndProtect(game);
    expect(game.locationOf("guardian")).toBe("bf1");
    expect(game.locationOf("vanilla")).toBe("bf1");
    expect(game.p2.units("bf1").sort()).toEqual(["guardian", "vanilla"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test.failing("BUG: Case 2 — Counter Strike on the Tank + 12-Might attacker: never lethal (437.5.b) but not exempt (465.2.c.10) → all 12 assigned to Guardian and prevented; both defenders take 0 and survive; P2 drew 1", async () => {
    // Expected: Counter Strike chooses Guardian; assignment 12/0; all prevented (437.4); attacker recalled.
    // Actual: Counter Strike's "prevent it" clause is not implemented (no target is even asked —
    // only "Draw 1" resolves), and combat splits 4/4(+4): both defenders die and P1 conquers.
    const game = await board(12, COUNTER_STRIKE).build();
    const handBefore = game.p2.hand().length;
    await attackAndProtect(game);
    expect(game.p2.hand()).toHaveLength(handBefore - 1 + 1); // cast Counter Strike, drew 1
    expect(game.locationOf("guardian")).toBe("bf1");
    expect(game.state("guardian").damage).toBe(0);
    expect(game.locationOf("vanilla")).toBe("bf1");
    expect(game.state("vanilla").damage).toBe(0);
    expect(game.locationOf("bruiser")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("Counter Strike is castable by the defender in the showdown and draws 1 on resolution (the part the engine does implement)", async () => {
    const game = await board(12, COUNTER_STRIKE).build();
    await game.p1.move("bruiser", "bf1");
    await game.p1.passFocus();
    expect(game.p2.can("cast", "react")).toBe(true);
    const handBefore = game.p2.hand().length;
    await game.p2.cast("react");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 1, calm: 0 } });
    await game.settle();
    expect(game.zoneOf("react")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(handBefore - 1 + 1);
  });
});
