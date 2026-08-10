/**
 * Ruling 67380e387f6b101b — Sprite (OGN-274 → ogn-274-298) · 3-Might unit token · [Temporary]
 *   × Frozen Fortress (unl-212-219, battlefield: "start of each Beginning Phase, deal 1 to each unit here") — source of
 *     the 1 prior damage; Stalwart Poro (ogn-052-298, 2 Might, [Shield]); Discipline (ogn-058-298, Reaction [2]: "+2 Might
 *     this turn. Draw 1."); Stupefy (ogn-095-298, Reaction [1]: "−1 Might this turn, min 1. Draw 1.").
 *
 * Q: My Sprite already has 1 damage (Frozen Fortress). Opponent attacks it with Stalwart Poro, plays Discipline on the
 *    Poro; I chain Stupefy. How does combat resolve?
 * A: Chain (LIFO): Stupefy resolves first (Poro −1, I draw 1), then Discipline (Poro +2, they draw 1) — the Poro ends the
 *    chain HIGHER than it started (net +1). Combat: Poro deals its Might to Sprite; 1 prior + that ≥ 3 → Sprite dies.
 *    [The answer also credits the Poro with Shield's +1 "as a defender" and so has it survive at 4 Might — but the Poro
 *    is the ATTACKER here; see RULING-CONFLICT note below.]
 * Rules: 340 (LIFO), 465 (combat damage = Might, simultaneous), damage persists until healed at end of turn, Shield
 *        ("+1 Might while I'm a defender").
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPRITE = "ogn-274-298";
const FROZEN_FORTRESS = "unl-212-219";
const STALWART_PORO = "ogn-052-298";
const DISCIPLINE = "ogn-058-298";
const STUPEFY = "ogn-095-298";

/**
 * P2's turn (main phase — the Fortress's beginning-phase ping already happened: Sprite carries 1 damage; the
 * battlefield is otherwise inert here). P1 holds the Fortress with the Sprite alone. P2: Stalwart Poro in base,
 * Discipline + [2]. P1: Stupefy + [1]. Known deck tops.
 */
function board() {
  return scenario()
    .active(P2)
    .battlefield("fortress", { controller: P1, def: FROZEN_FORTRESS, inert: true, owner: P1 })
    .unit(P1, "fortress", SPRITE, "sprite", { damage: 1 })
    .unit(P2, "base", STALWART_PORO, "poro")
    .hand(P2, DISCIPLINE, "disc")
    .resources(P2, { energy: 2 })
    .hand(P1, STUPEFY, "stupefy")
    .resources(P1, { energy: 1 })
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["p1d1", "p1d2"])
    .deck(P2, ["ogn-175-298", "ogn-175-298"], ["p2d1", "p2d2"]);
}

/** Poro attacks; P2 (Focus) plays Discipline on it; P1 responds with Stupefy on it. Chain = [disc, stupefy]. */
async function attackDisciplineStupefy(): Promise<{ game: Game; poroBefore: number }> {
  const game = await board().build();
  expect(game.state("sprite")).toMatchObject({ damage: 1, might: 3 }); // damaged but alive (lethal is 3)
  await game.p2.move("poro", "fortress");
  expect(game.state("poro").combatRole).toBe("attacker");
  expect(game.state("sprite").combatRole).toBe("defender");
  const poroBefore = game.state("poro").might;
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.cast("disc", { targets: "poro" });
  await game.p2.passPriority();
  expect(game.p1.can("cast", "stupefy")).toBe(true);
  await game.p1.cast("stupefy", { targets: "poro" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["disc", "stupefy"]); // Stupefy on top
  return { game, poroBefore };
}

describe("Ruling 67380e387f6b101b — damaged Sprite vs Stalwart Poro with Discipline answered by Stupefy", () => {
  test("premise: the Sprite's earlier 1 damage is still marked when it is attacked (3 Might, not dead); Stupefy sits on TOP of Discipline", async () => {
    const { game } = await attackDisciplineStupefy();
    expect(game.state("sprite").damage).toBe(1);
    expect(game.zoneOf("sprite")).toBe("battlefield-fortress");
  });

  test("LIFO step 1 — Stupefy resolves first: Poro −1 Might (never below 1) and P1 draws 1; Discipline still pending", async () => {
    const { game, poroBefore } = await attackDisciplineStupefy();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("stupefy")).toBe("trash");
    expect(game.state("poro").might).toBe(Math.max(1, poroBefore - 1));
    expect(game.p1.hand()).toEqual(["p1d1"]);
    expect(game.p2.hand()).toEqual([]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["disc"]);
  });

  test("LIFO step 2 — Discipline resolves second: Poro +2 on top of that and P2 draws 1; the Poro ends the chain ABOVE where it started (the later +2 outlasts the earlier −1)", async () => {
    const { game, poroBefore } = await attackDisciplineStupefy();
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.state("poro").might).toBe(Math.max(1, poroBefore - 1) + 2);
    expect(game.state("poro").might).toBeGreaterThan(poroBefore);
    expect(game.p2.hand()).toEqual(["p2d1"]);
    expect(game.p1.hand()).toEqual(["p1d1"]);
    // Back in the showdown; no combat damage yet.
    expect(game.state("sprite").damage).toBe(1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  // RULING-CONFLICT: the riftjudge answer gives the Poro Shield's +1 "as a defender" (3 → 2 → 4) and so has it survive the
  // Sprite's 3 damage with 3 marked. In the question the Poro is the ATTACKER; Shield reads "+1 [Might] while I'm a
  // defender", so it is 2 → 1 → 3, deals 3, takes 3 and dies as well. The engine follows the card text; we assert that and
  // keep the ruling's actual point — prior damage + combat damage is cumulative and kills the Sprite.
  test("combat: damage is simultaneous and cumulative — Sprite takes the Poro's Might on top of its prior 1 (≥ 3 total) and dies; the attacking Poro gets NO Shield bonus (3 Might), takes the Sprite's 3 and dies too; nobody holds the Fortress", async () => {
    const { game } = await attackDisciplineStupefy();
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    const poroFinal = game.state("poro").might;
    expect(poroFinal).toBe(3); // 2 base (attacking: no Shield) −1 +2
    expect(1 + poroFinal).toBeGreaterThanOrEqual(3); // lethal for the 3-Might Sprite
    await game.settle();
    expect(game.has("sprite") ? game.zoneOf("sprite") : "gone").not.toBe("battlefield-fortress"); // Sprite (a token) is killed → ceases to exist
    expect(game.p1.units("fortress")).toEqual([]);
    expect(game.zoneOf("poro")).toBe("trash"); // 3 damage on a 3-Might attacker
    expect(game.gameState.battlefields.fortress?.controller).toBe(null);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
