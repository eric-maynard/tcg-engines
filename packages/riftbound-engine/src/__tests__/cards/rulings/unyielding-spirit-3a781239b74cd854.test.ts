/**
 * Ruling 3a781239b74cd854 — Unyielding Spirit (OGN-145 → ogn-145-298) · Reaction · [1][body] · "Prevent all spell and ability
 *     damage this turn."
 *   × Cull the Weak (OGN-209 → ogn-209-298) · Spell · [2][order] · "Each player kills one of their units."
 *   (The scrape also lists Cull, sfd-134-221 — an unrelated Equipment; not part of the question.)
 *
 * Q: Does Unyielding Spirit stop Cull the Weak?
 * A: No. Unyielding Spirit only prevents DAMAGE from spells/abilities. Cull the Weak is a kill effect, not damage, so the
 *    unit dies anyway.
 * Rules: 428 (Kill is its own game action, not damage), 437/438 (damage & prevention), FAQ 3860.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const UNYIELDING_SPIRIT = "ogn-145-298";
const CULL_THE_WEAK = "ogn-209-298";
const FALLING_COMET = "ogn-085-298"; // [5] Action "Deal 6 to a unit at a battlefield." — the damage control case

/** P1's turn. P1: Pawn (2) + Cull the Weak, [2][order]. P2: lone Knight (4) at P2's bf1 + Unyielding Spirit, [1][body]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .resources(P2, { energy: 1, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Pawn" }, "pawn")
    .unit(P2, "bf1", { might: 4, name: "Knight" }, "knight")
    .hand(P1, CULL_THE_WEAK, "cull")
    .hand(P2, UNYIELDING_SPIRIT, "spirit");
}

describe("Ruling 3a781239b74cd854 — Unyielding Spirit (damage prevention) does not stop Cull the Weak (a kill)", () => {
  test.failing("BUG: P2 answers Cull the Weak with Unyielding Spirit; Spirit resolves first, then Cull still KILLS P2's only unit (and P1's) — kill ≠ damage", async () => {
    const game = await board().build();
    await game.p1.cast("cull"); // rule 355.10.e — no play-time target; the caster picks pawn on resolution
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "spirit")).toBe(true);
    await game.p2.cast("spirit");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cull", "spirit"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Unyielding Spirit resolves — its prevention is now in force for the turn
    expect(game.zoneOf("spirit")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["cull"]);
    await game.settle(); // Cull resolves; each side has exactly one unit → forced
    expect(game.zoneOf("knight")).toBe("trash"); // not saved
    expect(game.state("knight").damage).toBe(0); // it was never damage
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("control: the same Unyielding Spirit DOES blank spell damage — Falling Comet's 6 on the Knight is prevented and it lives", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5 })
      .resources(P2, { energy: 1, power: { body: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Knight" }, "knight")
      .hand(P1, FALLING_COMET, "comet")
      .hand(P2, UNYIELDING_SPIRIT, "spirit")
      .build();
    await game.p1.cast("comet", { targets: "knight" });
    await game.p1.passPriority();
    await game.p2.cast("spirit");
    await game.settle();
    expect(game.zoneOf("knight")).toBe("battlefield-bf1");
    expect(game.state("knight").damage).toBe(0);
    expect(game.zoneOf("comet")).toBe("trash");
  });
});
