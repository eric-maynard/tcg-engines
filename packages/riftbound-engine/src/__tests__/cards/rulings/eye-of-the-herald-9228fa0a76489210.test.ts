/**
 * Ruling 9228fa0a76489210 — Eye of the Herald (SFD-153 → sfd-153-221) · Equipment · [Equip][order] · wearer gains
 *     "When I move, play a 1 [Might] Recruit unit token here."
 *   × Nine-Tailed Fox (OGN-255 → ogn-255-298, Ahri legend) "When an enemy unit attacks a battlefield you control, give it
 *     -1 [Might] this turn, to a minimum of 1 [Might]."
 *
 * Q: I attack with a Herald-equipped unit into the Ahri player's battlefield — does my Recruit token get the -1 too?
 * A: Yes. The move trigger plays the Recruit at that battlefield; it gains the attacker designation there, so Ahri's
 *    ability triggers for it as well (once per unit, whenever it first becomes an attacker this combat). All these
 *    triggers are chain items. (The Recruit is already at the 1-Might floor, so its printed Might can't drop further.)
 * Rules: 383.2.c (triggers evaluate after the event), 464.2.c.3.a (late arrivals become attackers), 150.2/718.3 (Effect text).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EYE_OF_THE_HERALD = "sfd-153-221";
const NINE_TAILED_FOX = "ogn-255-298";

/** P1's turn. P2 (Ahri legend) holds bf1 with Guard (6). P1's Knight (3) in base wears the Eye. */
function board() {
  return scenario()
    .legend(P2, NINE_TAILED_FOX, "ahri")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 6, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 3, name: "Knight" }, "knight", { equippedWith: ["eye"] } as Record<string, unknown>)
    .card("eye", { def: EYE_OF_THE_HERALD, meta: { attachedTo: "knight" } as Record<string, unknown>, owner: P1, zone: "base" });
}

const recruits = (game: Game) => game.findAll({ name: "Recruit", owner: P1 });

async function passBoth(game: Game): Promise<void> {
  for (let i = 0; i < 2; i++) {
    const d = game.decision();
    expect(d).toMatchObject({ context: "chain", kind: "action" });
    await game.seat(d!.seat).passPriority();
  }
}

describe("Ruling 9228fa0a76489210 — the Herald's Recruit token attacking into Ahri's battlefield also draws Ahri's -1 trigger", () => {
  test("Knight attacks bf1: the Herald move trigger goes on the chain; when it resolves a 1-Might Recruit token is played AT bf1 and is an ATTACKER there", async () => {
    const game = await board().build();
    expect(game.state("knight").attachments).toEqual(["eye"]);
    await game.p1.move("knight", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "knight", controller: P1, triggered: true })]);
    expect(recruits(game)).toEqual([]);
    await passBoth(game);
    const [rec] = recruits(game);
    expect(rec).toBeDefined();
    expect(game.locationOf(rec!)).toBe("bf1");
    expect(game.state(rec!)).toMatchObject({ combatRole: "attacker", isToken: true, might: 1 });
    expect(game.state("knight").combatRole).toBe("attacker");
  });

  test("Ahri's legend then triggers once for EACH enemy attacker at her battlefield — two P2-controlled Nine-Tailed Fox items on the chain (Knight AND the Recruit), not one", async () => {
    const game = await board().build();
    await game.p1.move("knight", "bf1");
    await passBoth(game);
    const ahriItems = game.chain().filter((c) => c.cardId === "ahri");
    expect(ahriItems).toHaveLength(2);
    expect(ahriItems.every((c) => c.controller === P2 && c.triggered)).toBe(true);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" }); // respondable chain items
  });

  test("after they resolve: Knight is 3 → 2 this turn; the Recruit was hit by its own trigger but sits at the 1-Might floor (still 1, never 0); then the showdown proceeds with P1's Focus", async () => {
    const game = await board().build();
    await game.p1.move("knight", "bf1");
    for (let i = 0; i < 10 && game.decision()?.kind === "action" && (game.decision() as { context?: string }).context === "chain"; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("knight")).toMatchObject({ might: 2, mightModifier: -1 });
    const [rec] = recruits(game);
    expect(game.state(rec!).might).toBe(1);
    expect(game.state(rec!).might).toBeGreaterThanOrEqual(1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    // Combat: 2 + 1 into 6 → both attackers die (the token ceases to exist), Guard holds.
    await game.settle();
    expect(game.zoneOf("knight")).toBe("trash");
    expect(game.zoneOf(rec!)).toBe("gone");
    expect(game.state("guard")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("contrast — no Ahri legend: same attack, the Recruit still arrives as an attacker but nothing else triggers; Knight stays 3", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 6, name: "Guard" }, "guard")
      .unit(P1, "base", { might: 3, name: "Knight" }, "knight", { equippedWith: ["eye"] } as Record<string, unknown>)
      .card("eye", { def: EYE_OF_THE_HERALD, meta: { attachedTo: "knight" } as Record<string, unknown>, owner: P1, zone: "base" })
      .build();
    await game.p1.move("knight", "bf1");
    await passBoth(game);
    expect(game.chain()).toEqual([]);
    expect(recruits(game)).toHaveLength(1);
    expect(game.state("knight").might).toBe(3);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });
});
