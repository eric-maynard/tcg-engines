/**
 * Ruling 10c345aac2a60075 — Facebreaker (OGN-220 → ogn-220-298) [Hidden][Action] · 2 "Stun a friendly unit
 *   and an enemy unit at the same battlefield. (They don't deal combat damage this turn.)"
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) "If a friendly unit would die, kill this instead. Heal that
 *     unit, exhaust it, and recall it. (Send it to base. This isn't a move.)"
 *   × Vilemaw's Lair (OGN-295 → ogn-295-298) Battlefield "Units can't move from here to base."
 *   (unl-060-219 Vilemaw is listed by the scrape; the answer's attacker is "Lee Sin" — any attacking unit.)
 *
 * Q: How do Facebreaker / Zhonya's interact with Vilemaw's Lair when the attacker is stunned?
 * A: With attacker and defender both stunned nobody deals combat damage; defenders remain, so the attacker
 *    is RECALLED to base — the Lair cannot stop it because a recall is not a move. (Likewise Zhonya's recall.)
 * Rules: 455/456 (recall is not a move; movement restrictions don't apply), 466.1.a.2 (surviving attackers
 * are recalled when defenders remain), stun (no combat damage this turn).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FACEBREAKER = "ogn-220-298";
const ZHONYAS_HOURGLASS = "ogn-077-298";
const VILEMAWS_LAIR = "ogn-295-298";

/** P2's turn. P1 controls the live Lair with a 4-Might Guard and holds Facebreaker (2 energy). P2's "Lee Sin" (5) attacks from base. */
function facebreakerBoard() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2 })
    .battlefield("lair", { controller: P1, def: VILEMAWS_LAIR, inert: false })
    .unit(P1, "lair", { might: 4, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 5, name: "Lee Sin" }, "lee")
    .hand(P1, FACEBREAKER, "fb");
}

describe("Ruling 10c345aac2a60075 — stunned attacker at Vilemaw's Lair is still recalled home (recall ≠ move)", () => {
  test("the Lair is live: units there carry 'can't move to base' — Guard is not offered a move home", async () => {
    const game = await facebreakerBoard().active(P1).build();
    expect(game.state("guard").keywords).toContain("NoMoveToBase");
    const field = game.p1.option("standardMove:to:base")?.fields.find((f) => f.name === "unitIds");
    const offered = (field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]);
    expect(offered).not.toContain("guard");
  });

  test("Lee Sin attacks the Lair; P1 (Focus) Facebreakers Guard + Lee Sin: both are stunned before combat damage", async () => {
    const game = await facebreakerBoard().build();
    await game.p2.move("lee", "lair");
    expect(game.state("lee").combatRole).toBe("attacker");
    expect(game.state("lee").keywords).toContain("NoMoveToBase"); // now at the Lair too
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "fb")).toBe(true);
    await game.p1.cast("fb", { targets: ["guard", "lee"] });
    expect(game.p1.energy()).toBe(0);
    while (game.chain().length > 0 && game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("fb")).toBe("trash");
    expect(game.state("guard").isStunned).toBe(true);
    expect(game.state("lee").isStunned).toBe(true);
    expect(game.state("guard").damage).toBe(0);
    expect(game.state("lee").damage).toBe(0);
  });

  test("combat then deals no damage; the defender remains, so the stunned attacker is RECALLED to base despite the Lair — and that recall is not counted as a move", async () => {
    const game = await facebreakerBoard().build();
    await game.p2.move("lee", "lair");
    const movesAfterAttack = game.gameState.unitsMovedThisTurn?.[P2] ?? 0;
    expect(movesAfterAttack).toBe(1);
    await game.p2.passFocus();
    await game.p1.cast("fb", { targets: ["guard", "lee"] });
    await game.settle();
    // Nobody was hurt, nobody died.
    expect(game.zoneOf("guard")).toBe("battlefield-lair");
    expect(game.state("guard").damage).toBe(0);
    expect(game.zoneOf("lee")).toBe("base"); // recalled home even though "units can't move from here to base"
    expect(game.state("lee").damage).toBe(0);
    expect(game.p2.trash()).not.toContain("lee");
    expect(game.gameState.battlefields.lair?.controller).toBe(P1);
    expect(game.gameState.battlefields.lair?.contested).toBe(false);
    // Recalls are not moves: P2's move count is unchanged by the recall.
    expect(game.gameState.unitsMovedThisTurn?.[P2] ?? 0).toBe(movesAfterAttack);
    expect(game.violations()).toEqual([]);
  });

  test("Zhonya's half: a 3-Might attacker that WOULD die at the Lair is saved by its Zhonya's — healed, exhausted and recalled to base, Lair notwithstanding; no combat trade happens for it", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("lair", { controller: P1, def: VILEMAWS_LAIR, inert: false })
      .unit(P1, "lair", { might: 5, name: "Guard" }, "guard")
      .unit(P2, "base", { might: 3, name: "Lee Sin" }, "lee")
      .gear(P2, ZHONYAS_HOURGLASS, "zh")
      .build();
    await game.p2.move("lee", "lair");
    expect(game.state("lee").keywords).toContain("NoMoveToBase");
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash"); // killed instead
    expect(game.zoneOf("lee")).toBe("base"); // recalled despite the Lair
    expect(game.state("lee").damage).toBe(0);
    expect(game.state("lee").isExhausted).toBe(true);
    expect(game.zoneOf("guard")).toBe("battlefield-lair"); // took 3 < 5
    expect(game.gameState.battlefields.lair?.controller).toBe(P1);
  });
});
