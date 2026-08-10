/**
 * Ruling d4687e14acd3e175 — Blighted Battleaxe (UNL-019 → unl-019-219) · Equipment · Fury · [4] · +4 Might
 *   "[Equip] [1][fury] … At the end of your turn, if I didn't conquer this turn, unattach this and deal 4 to me."
 *
 * Q: If a 4-Might wearer got "+2 [Might] this turn", does the Battleaxe still kill it at the end of my turn?
 * A: No — it survives. "At the end of your turn" resolves in the Ending Step while "this turn" effects only expire
 *    in the Expiration Step that follows, so after the unattach the unit is 4 + 2 = 6 when the 4 lands: not
 *    lethal; the end-of-turn heal then wipes the 4. Caveat: were the bonus already gone (shorter duration), the
 *    unit would be at 4 and the 4 damage WOULD kill it before any heal — that is the plain no-buff case below.
 * Rules: 317.1 (Ending Step triggers) before 317.2.c (this-turn effects expire) and 317.2 heal, 142.4.b (lethal =
 *        damage ≥ current Might, checked in the Cleanup after the trigger resolves).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BLIGHTED_BATTLEAXE = "unl-019-219";
/** "+2 [Might] this turn" as a 1-cost spell. */
const RALLY = {
  abilities: [{ effect: { amount: 2, duration: "turn", target: { controller: "friendly", type: "unit" }, type: "modify-might" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Rally (+2 this turn)",
  rulesText: "Give a friendly unit +2 [Might] this turn.",
  timing: "action",
} as const;

/** P1's turn 3. P1's 4-Might Wearer in base carries the Battleaxe (4 + 4 = 8); P1 holds Rally with [1]; nobody conquers. */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Bystander" }, "by")
    .unit(P1, "base", { might: 4, name: "Wearer" }, "wearer", { equippedWith: ["axe"] })
    .card("axe", { def: BLIGHTED_BATTLEAXE, meta: { attachedTo: "wearer" }, owner: P1, zone: "base" })
    .hand(P1, RALLY, "rally");
}

describe("Ruling d4687e14acd3e175 — a '+2 this turn' outlives the Battleaxe's end-of-turn hit, so a 4-Might wearer survives", () => {
  test("setup facts: the Wearer is 8 with the axe; Rally makes it 10 (+2 this turn)", async () => {
    const game = await board().build();
    expect(game.state("wearer")).toMatchObject({ attachments: ["axe"], baseMight: 4, might: 8 });
    await game.p1.cast("rally", { targets: "wearer" });
    await game.settle();
    expect(game.state("wearer")).toMatchObject({ might: 10, mightModifier: 2 });
  });

  test("end of P1's turn (no conquer): the axe trigger goes on the chain in the Ending Step while the +2 is STILL active; it unattaches (→ 6) and deals 4 — 4 < 6, the Wearer LIVES", async () => {
    const game = await board().build();
    await game.p1.cast("rally", { targets: "wearer" });
    await game.settle();
    await game.p1.endTurn();
    expect(game.phase()).toBe("ending");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "wearer", controller: P1, triggered: true })]);
    expect(game.state("wearer").mightModifier).toBe(2); // "this turn" has not expired yet
    // Resolve just the trigger and look before the Expiration Step finishes the turn.
    while (game.chain().length > 0 && game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    if (game.turnPlayer() === P1) {
      // Still inside P1's Ending Step: unattached, 4 marked on a 6-Might unit.
      expect(game.state("axe").attachedTo).toBeUndefined();
      expect(game.state("wearer")).toMatchObject({ damage: 4, might: 6, zone: "base" });
    }
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("wearer")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("…then the Expiration Step heals it and drops the +2: on P2's turn the Wearer is an undamaged, unequipped 4; the loose axe sits in P1's base", async () => {
    const game = await board().build();
    await game.p1.cast("rally", { targets: "wearer" });
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("wearer")).toMatchObject({ attachments: [], damage: 0, might: 4, mightModifier: 0, zone: "base" });
    expect(game.state("axe")).toMatchObject({ attachedTo: undefined, zone: "base" });
    const pass1 = game.trace().expiration[0];
    expect(pass1?.healed).toContain("wearer");
    expect(pass1?.expired).toContain("mightModifier:wearer");
  });

  test("contrast / the caveat: with NO bonus in force when the trigger resolves, the unattached Wearer is 4 and the 4 damage is lethal — it dies before any end-of-turn heal; the axe stays behind unattached", async () => {
    const game = await board().build();
    await game.advanceTurn(); // Rally never cast
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("wearer")).toBe("trash");
    expect(game.state("axe")).toMatchObject({ attachedTo: undefined, zone: "base" });
    expect(game.violations()).toEqual([]);
  });
});
