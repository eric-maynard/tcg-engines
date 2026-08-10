/**
 * Ruling 0a9fe957c597e047 — Forbidding Waste (UNL-210 → unl-210-219) · Battlefield
 *   "While a unit here is defending alone, it has -2 [Might]."
 *   × Irelia, Fervent (sfd-057-221) · 4 Might · "[Deflect] … When you choose or ready me, give me +1 [Might] this turn." — a
 *     Deflect unit that also detects being "chosen".
 *
 * Q: Does Deflect work against Forbidding Waste?
 * A: No. Deflect taxes opponents' spells/abilities that CHOOSE the unit. The Waste is a continuous static that chooses
 *    nothing — it applies to whatever unit is defending alone — so no Deflect payment is involved and it applies in full.
 * Rules: 809.1.c (Deflect: opponents pay [rainbow] to choose me), 364 (static/passive abilities), 355.10 (what "choosing" is).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FORBIDDING_WASTE = "unl-210-219";
const IRELIA_FERVENT = "sfd-057-221";

/** P2's turn with an EMPTY pool (nothing to pay Deflect with). P1 holds the Waste (live) with a lone Irelia (4). P2's 3-Might Raider attacks. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 0 })
    .battlefield("waste", { controller: P1, def: FORBIDDING_WASTE, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 1, name: "Their Holder" }, "th")
    .unit(P1, "waste", IRELIA_FERVENT, "irelia")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider");
}

describe("Ruling 0a9fe957c597e047 — Forbidding Waste's -2 ignores Deflect (it never 'chooses' the unit)", () => {
  test("outside combat Irelia is her printed 4 with Deflect", async () => {
    const game = await board().build();
    expect(game.state("irelia")).toMatchObject({ combatRole: null, might: 4 });
    expect(game.state("irelia").keywords).toContain("Deflect");
  });

  test("Raider attacks: Irelia defends ALONE at the Waste → 4 - 2 = 2 immediately — P2 paid nothing (pool still empty, the move was legal), nothing went on the chain, and her 'when you choose me' did NOT fire (+0 modifier)", async () => {
    const game = await board().build();
    await game.p2.move("raider", "waste");
    expect(game.state("irelia")).toMatchObject({ combatRole: "defender", might: 2, mightModifier: 0 });
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  });

  test("so the penalty decides the combat: 3 ≥ 2 kills Irelia while she deals only 2 < 3 — the Raider survives and P2 conquers the Waste", async () => {
    const game = await board().build();
    await game.p2.move("raider", "waste");
    await game.settle();
    expect(game.zoneOf("irelia")).toBe("trash");
    expect(game.state("raider")).toMatchObject({ damage: 0, zone: "battlefield-waste" });
    expect(game.gameState.battlefields.waste?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: with a friendly Buddy beside her she is not 'alone' → full 4, and the same 3-Might Raider dies", async () => {
    const game = await board().unit(P1, "waste", { might: 1, name: "Buddy" }, "buddy").build();
    await game.p2.move("raider", "waste");
    expect(game.state("irelia")).toMatchObject({ combatRole: "defender", might: 4 });
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("irelia")).toBe("battlefield-waste");
    expect(game.gameState.battlefields.waste?.controller).toBe(P1);
  });
});
