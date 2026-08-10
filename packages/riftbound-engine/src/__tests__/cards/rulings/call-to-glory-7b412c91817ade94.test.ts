/**
 * Ruling 7b412c91817ade94 — Call to Glory (OGN-207 → ogn-207-298) · Reaction · [3]
 *     "As you play this, you may spend a buff as an additional cost. If you do, ignore this spell's cost.
 *      Give a unit +3 [Might] this turn."
 *   × Sona, Harmonious (OGN-073 → ogn-073-298) · 4 Might champion (here buffed, carrying 6 damage at 7 Might)
 *   × Shen, Kinkou (ogn-241-298) · Reaction unit · Shield 2 · Tank;  attacker = a vanilla "Jinx" (5 Might).
 *
 * Q: Jinx attacks Sona's battlefield. Can I react with Shen, then Call to Glory on Shen — paying it by
 *    removing Sona's buff — to kill Jinx and save Sona?
 * A: No. Spending Sona's buff drops her Might to 6 = her 6 marked damage, so she dies in the cleanup
 *    before combat damage. Sequence: attack → Shen (resolves immediately, focus passes) → attacker passes
 *    → Call to Glory (buff spent) → Sona dies → combat: Jinx dies, Shen (Tank) survives.
 * Rules: 337.2 (unit resolves immediately), 340.2.a/347.1 (focus passes), 404.1 (cost paid at
 *        finalization), 141/430 + cleanup (damage ≥ Might is lethal), 814/815 (Shield/Tank).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CALL_TO_GLORY = "ogn-207-298";
const SONA = "ogn-073-298";
const SHEN = "ogn-241-298";

/**
 * P2's turn. P1 holds bf1 with Sona: buffed (+1) and +2 this turn ⇒ 7 Might, carrying 6 damage.
 * P1 has exactly Shen's cost ([3] + order) — Call to Glory can only be paid by spending the buff.
 * P2 has a 5-Might "Jinx" in base ready to attack.
 */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .resources(P1, { energy: 3, power: { order: 1 } })
    .unit(P1, "bf1", SONA, "sona", { buffed: true, damage: 6, mightModifier: 2 })
    .unit(P2, "base", { might: 5, name: "Jinx" }, "jinx")
    .hand(P1, SHEN, "shen")
    .hand(P1, CALL_TO_GLORY, "glory");
}

/** Jinx attacks bf1; attacker (P2) passes Focus; P1 reacts with Shen to bf1. */
async function attackAndShen(): Promise<Game> {
  const game = await board().build();
  expect(game.state("sona")).toMatchObject({ damage: 6, isBuffed: true, might: 7 });
  await game.p2.move("jinx", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("play", "shen")).toBe(true);
  await game.p1.play("shen", { to: "bf1" });
  return game;
}

describe("Ruling 7b412c91817ade94 — spending Sona's life-saving buff on Call to Glory kills her before combat", () => {
  test("Shen played as a Reaction during the showdown resolves immediately (no chain), becomes a defender, and Focus passes to the attacker", async () => {
    const game = await attackAndShen();
    expect(game.zoneOf("shen")).toBe("battlefield-bf1");
    expect(game.chain()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.state("shen").combatRole).toBe("defender");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    // Sona is still fine at this point: 7 Might, 6 damage.
    expect(game.zoneOf("sona")).toBe("battlefield-bf1");
  });

  test("attacker passes, Focus returns to P1 who casts Call to Glory on Shen by spending Sona's buff (0 energy): Sona drops to 6 Might = 6 damage and dies in cleanup before any combat damage", async () => {
    const game = await attackAndShen();
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "glory")).toBe(true);
    await game.p1.cast("glory", { payOptional: true, targets: "shen" });
    expect(game.p1.energy()).toBe(0); // cost ignored — paid with the buff
    // Resolve just the spell (both pass priority), not the showdown.
    await game.p1.passPriority();
    if (game.chain().length > 0) {
      await game.p2.passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("glory")).toBe("trash");
    expect(game.zoneOf("sona")).toBe("trash"); // died in cleanup, combat not yet resolved
    expect(game.zoneOf("jinx")).toBe("battlefield-bf1"); // combat damage has not been dealt yet
    expect(game.state("jinx").damage).toBe(0);
    expect(game.zoneOf("shen")).toBe("battlefield-bf1");
  });

  test("combat then resolves: Shen (3 + Shield 2 + 3 = 8, Tank) kills the 5-Might Jinx and survives; P1 keeps bf1 — but Sona was not saved", async () => {
    const game = await attackAndShen();
    await game.p2.passFocus();
    await game.p1.cast("glory", { payOptional: true, targets: "shen" });
    await game.settle();
    expect(game.zoneOf("sona")).toBe("trash");
    expect(game.zoneOf("jinx")).toBe("trash");
    expect(game.zoneOf("shen")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    // The harness's costPaid invariant flags the buff-paid (cost-ignored) cast; nothing else may fire.
    expect(game.violations().filter((v) => v.invariant !== "costPaid")).toEqual([]);
  });
});
