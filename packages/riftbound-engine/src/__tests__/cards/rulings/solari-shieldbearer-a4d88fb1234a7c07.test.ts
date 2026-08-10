/**
 * Ruling a4d88fb1234a7c07 — Solari Shieldbearer (OGN-051 → ogn-051-298) · 2 Might · [3] Calm
 *   "When you play me, stun a unit. (It doesn't deal combat damage this turn.)"
 *   × Radiant Dawn (OGN-261 → ogn-261-298) · Legend (Leona) · "When you stun one or more enemy units, buff a friendly unit."
 *
 * Q: Can Solari Shieldbearer stun itself when it enters?
 * A: Yes — "a unit" includes itself. Nuance: that self-stun does NOT trigger Leona's legend (Radiant Dawn), which needs an
 *    ENEMY unit to be stunned.
 * Rules: 355 (any unit matching the descriptor may be chosen, including the source), 383.2 (trigger conditions must match:
 *        "enemy units"), 702 (buff).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SOLARI_SHIELDBEARER = "ogn-051-298";
const RADIANT_DAWN = "ogn-261-298";

/** P1's turn with [3]; Radiant Dawn is P1's legend; P2 has a 3-Might Foe in base; P1 a 2-Might Ally in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .legend(P1, RADIANT_DAWN, "leona")
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .unit(P2, "base", { might: 3, name: "Foe" }, "foe")
    .hand(P1, SOLARI_SHIELDBEARER, "solari");
}

/** Play the Shieldbearer to base and get to its "stun a unit" prompt. */
async function playSolari(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("solari", { to: "base" });
  if (game.decision()?.kind !== "pick") {
    await game.settle();
  }
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "solari" } });
  return game;
}

describe("Ruling a4d88fb1234a7c07 — Solari Shieldbearer may stun itself; that doesn't wake Radiant Dawn", () => {
  test("the play trigger's 'stun a unit' offers the Shieldbearer itself (alongside Ally and Foe)", async () => {
    const game = await playSolari();
    const d = game.decision();
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["ally", "foe", "solari"]);
  });

  test("choosing itself: the Shieldbearer ends up stunned in base; Radiant Dawn does NOT trigger (no chain item, nobody buffed)", async () => {
    const game = await playSolari();
    await game.p1.pick("solari");
    let sawLeona = game.chain().some((c) => c.cardId === "leona");
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
      sawLeona ||= game.chain().some((c) => c.cardId === "leona");
    }
    await game.settle();
    expect(sawLeona).toBe(false);
    expect(game.state("solari")).toMatchObject({ isStunned: true, zone: "base" });
    expect(game.state("solari").isBuffed).toBe(false);
    expect(game.state("ally").isBuffed).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: stunning the ENEMY Foe does trigger Radiant Dawn — P1 buffs a friendly unit (the Shieldbearer: 2 → 3)", async () => {
    const game = await playSolari();
    await game.p1.pick("foe");
    // Drive: pass priority until Leona's buff prompt, answer it with the Shieldbearer.
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        expect(d.source?.cardId).toBe("leona");
        await game.p1.pick("solari");
        break;
      }
      if (d?.kind === "action" && game.chain().length > 0) {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.state("foe").isStunned).toBe(true);
    expect(game.state("solari")).toMatchObject({ isBuffed: true, isStunned: false, might: 3 });
  });
});
