/**
 * Ruling 348dcaee3c12ebc4 — Hidden Blade (ogn-213-298) × Zenith Blade (ogn-262-298) × Reaver's Row (ogn-285-298)
 *   Hidden Blade: "[Hidden] [Action] Kill a unit at a battlefield. Its controller draws 2."
 *   Zenith Blade: "[Action] Stun an enemy unit at a battlefield. You may move a friendly unit to that enemy unit's battlefield."
 *   Reaver's Row (battlefield): "When you defend here, you may move a friendly unit here to base."
 *
 * Q: If all attackers are removed during a showdown (Hidden Blade), does the showdown end at once? And if a unit is
 *    then brought in (Zenith Blade), is that a new combat that lets the defender use Reaver's Row again?
 * A: Showdowns never stop early — players keep acting/passing Focus until both pass in succession, even with no
 *    attackers left. A unit arriving mid-showdown does not start a new combat/showdown; defender designation happened
 *    once at the start, so "when you defend here" (Reaver's Row) does not re-trigger.
 * Rules: 340–344 (showdown ends only on consecutive passes), 621 (combat steps), 626 (attacker/defender designation once).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const ZENITH_BLADE = "ogn-262-298";
const REAVERS_ROW = "ogn-285-298";

function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { rainbow: 2 } }) // Zenith Blade: 3 + [rainbow][rainbow]
    .resources(P2, { energy: 2, power: { order: 1 } }) // Hidden Blade from hand: 2 + [order]
    .battlefield("row", { controller: P2, def: REAVERS_ROW, inert: false })
    .unit(P2, "row", { might: 3, name: "Defender" }, "def")
    .unit(P1, "base", { might: 2, name: "Attacker" }, "atk")
    .unit(P1, "base", { might: 2, name: "Second" }, "second")
    .hand(P2, HIDDEN_BLADE, "hb")
    .hand(P1, ZENITH_BLADE, "zb");
}

const showdowns = (game: Game) => game.gameState.interaction?.showdownStack ?? [];

/** P1 attacks Reaver's Row with the lone Attacker; P2 declines the Row's defend trigger; P1 passes Focus; P2 Hidden-Blades the Attacker; the chain resolves. */
async function attackerKilledMidShowdown(): Promise<{ game: Game; rowPrompts: number }> {
  const game = await board().build();
  let rowPrompts = 0;
  await game.p1.move("atk", "row");
  // Combat showdown at the Row; P2 is the defender → Reaver's Row "when you defend here, you may…" asks P2.
  expect(showdowns(game)).toHaveLength(1);
  expect(showdowns(game)[0]).toMatchObject({ active: true, battlefieldId: "row", isCombatShowdown: true });
  const d = game.decision();
  expect(d).toMatchObject({ kind: "yes-no", seat: P2 });
  expect(d?.source?.cardId).toBe("row");
  rowPrompts += 1;
  await game.p2.no();
  // Attacker (P1) holds Focus first; P1 passes, P2 uses its Focus to cast Hidden Blade on the Attacker.
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  const p1Hand = game.p1.hand().length;
  await game.p2.cast("hb", { targets: "atk" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["hb"]);
  // Resolve just the chain (both pass priority), nothing more.
  for (let i = 0; i < 4; i++) {
    const cur = game.decision();
    if (cur?.kind !== "action" || cur.context !== "chain") {
      break;
    }
    await game.seat(cur.seat).passPriority();
  }
  expect(game.zoneOf("atk")).toBe("trash");
  expect(game.p1.hand()).toHaveLength(p1Hand + 2); // "its controller draws 2"
  return { game, rowPrompts };
}

describe("Ruling 348dcaee3c12ebc4 — a showdown never ends early; a unit arriving mid-showdown is not a new combat", () => {
  test("all attackers gone (Hidden Blade) → the SAME showdown is still open: no attacker at the Row, yet Focus returns to P1 and both players may still act", async () => {
    const { game } = await attackerKilledMidShowdown();
    expect(game.p1.units("row")).toEqual([]);
    expect(showdowns(game)).toHaveLength(1);
    expect(showdowns(game)[0]).toMatchObject({ active: true, battlefieldId: "row" });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.gameState.battlefields.row).toMatchObject({ contested: true, controller: P2 });
  });

  test("it takes BOTH players passing Focus in succession to close it: after P1 passes it is still open with P2's Focus; after P2 passes the empty combat wraps up and the Row stays P2's", async () => {
    const { game } = await attackerKilledMidShowdown();
    await game.p1.passFocus();
    expect(showdowns(game)).toHaveLength(1);
    expect(showdowns(game)[0]?.active).toBe(true);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.passFocus();
    await game.settle(); // combat damage/resolution steps (nothing to fight)
    expect(showdowns(game)).toHaveLength(0);
    expect(game.gameState.battlefields.row).toMatchObject({ contested: false, controller: P2 });
    expect(game.zoneOf("def")).toBe("battlefield-row");
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("Zenith Blade brings Second into the Row mid-showdown: no new showdown/combat is created and Reaver's Row's defend trigger does NOT fire again; Second simply joins the ongoing combat as an attacker", async () => {
    const { game, rowPrompts } = await attackerKilledMidShowdown();
    // P1 has Focus in the still-open showdown and casts Zenith Blade: stun Defender, move Second there.
    await game.p1.cast("zb", { targets: ["def", "second"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["zb"]);
    for (let i = 0; i < 4; i++) {
      const cur = game.decision();
      if (cur?.kind !== "action" || cur.context !== "chain") {
        break;
      }
      await game.seat(cur.seat).passPriority();
    }
    // "You may move a friendly unit to that battlefield" — P1's optional destination choice.
    let d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      await game.p1.yes();
      d = game.decision();
    }
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    await game.p1.pick("battlefield-row");

    expect(game.state("def").isStunned).toBe(true);
    expect(game.locationOf("second")).toBe("row");
    // Still exactly one showdown — the original one — and no fresh "when you defend here" prompt for P2.
    expect(showdowns(game)).toHaveLength(1);
    expect(showdowns(game)[0]).toMatchObject({ active: true, battlefieldId: "row", isCombatShowdown: true });
    expect(game.chain()).toEqual([]);
    const after = game.decision();
    expect(after?.kind).toBe("action");
    expect(after).toMatchObject({ context: "showdown", kind: "action" });
    expect(after?.kind === "yes-no" || after?.source?.cardId === "row").toBe(false);
    expect(rowPrompts).toBe(1);
    // Second is an attacker in THIS combat.
    expect(game.state("second").combatRole).toBe("attacker");

    // Close the showdown: the stunned Defender deals no damage, Second (2) can't kill it (3) → Second is sent home, Row stays P2's.
    await game.settle();
    expect(showdowns(game)).toHaveLength(0);
    expect(game.zoneOf("second")).toBe("base");
    expect(game.zoneOf("def")).toBe("battlefield-row");
    expect(game.gameState.battlefields.row).toMatchObject({ contested: false, controller: P2 });
    expect(game.violations()).toEqual([]);
  });
});
