/**
 * Ruling 76162db94341b930 — Radiant Dawn (OGN-261 → ogn-261-298) · Leona legend "When you stun one or more enemy units, buff a
 *   friendly unit." with Leona, Determined (OGN-238 → ogn-238-298) · 4 Might "[Shield] When I attack, stun an enemy unit here."
 *   × Flash (OGS-011 → ogs-011-024) · Reaction · [2] "Move up to 2 friendly units to base."
 *
 * Q: Does Leona announce her stun target when the attack trigger goes on the chain, or on resolution? Can the defender
 *    Flash the targeted unit away in response?
 * A: The target is announced as the trigger goes on the chain and re-checked on resolution. The opponent may respond with
 *    Flash; if the target is no longer valid (moved to base — not "here"), no stun happens and Radiant Dawn grants no buff.
 * Rules: 355 / 383.6 (triggered abilities choose targets when put on the chain), 359.3.e (illegal target on resolution → skipped).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RADIANT_DAWN = "ogn-261-298";
const LEONA_DETERMINED = "ogn-238-298";
const FLASH = "ogs-011-024";

/** P1's turn: Radiant Dawn legend, Leona (4) ready in base. P2 holds bf1 with Guard (3) and Squire (2), Flash + [2] in hand. */
function board() {
  return scenario()
    .legend(P1, RADIANT_DAWN, "dawn")
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P2, "bf1", { might: 2, name: "Squire" }, "squire")
    .unit(P1, "base", LEONA_DETERMINED, "leona")
    .hand(P2, FLASH, "flash");
}

/** Leona attacks bf1; P1 is asked her stun target NOW and names the Guard; P1 passes → P2 has priority with the trigger pending. */
async function leonaTargetsGuard(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("leona", "bf1");
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "leona" } });
  expect(d?.kind === "pick" ? d.options.map((o) => o.key).toSorted() : []).toEqual(["guard", "squire"]);
  await game.p1.pick("guard");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "leona", controller: P1, targets: ["guard"], triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

/** Answer Radiant Dawn's "buff a friendly unit" if it asks (Leona is the only friendly unit). */
async function answerDawn(game: Game): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick("leona");
    } else if (d?.kind === "yes-no" && d.seat === P1) {
      await game.p1.yes();
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      return;
    }
  }
}

describe("Ruling 76162db94341b930 — Leona's stun target is announced on the chain; Flashing it away means no stun and no Radiant Dawn buff", () => {
  test("the target is announced as the trigger goes on the chain (P1 picks before anyone has priority) and is visible on the chain item", async () => {
    await leonaTargetsGuard();
  });

  test("control: no response → the Guard is stunned and Radiant Dawn buffs a friendly unit (Leona)", async () => {
    const game = await leonaTargetsGuard();
    await game.p2.passPriority(); // trigger resolves
    await answerDawn(game);
    expect(game.state("guard").isStunned).toBe(true);
    expect(game.state("leona").isBuffed).toBe(true);
  });

  test("P2 CAN respond on the initial chain: Flash is legal with Leona's trigger pending and moves the Guard to base; Leona's item still names the Guard", async () => {
    const game = await leonaTargetsGuard();
    expect(game.p2.can("cast", "flash")).toBe(true);
    await game.p2.cast("flash", { targets: ["guard"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["leona", "flash"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Flash resolves
    expect(game.zoneOf("guard")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "leona", targets: ["guard"], triggered: true })]);
  });

  test("on resolution the Guard is no longer 'here' → invalid: NO stun on anyone, and Radiant Dawn grants NO buff", async () => {
    const game = await leonaTargetsGuard();
    await game.p2.cast("flash", { targets: ["guard"] });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Flash
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (d?.kind !== "action") {
        break;
      }
      await game.seat(d.seat).passPriority();
    }
    expect(game.chain()).toEqual([]);
    // No retarget prompt, no Dawn prompt.
    const d = game.decision();
    expect(d?.kind === "pick" && d.seat === P1).toBe(false);
    expect(game.state("guard").isStunned).toBe(false);
    expect(game.state("squire").isStunned).toBe(false);
    expect(game.state("leona").isBuffed).toBe(false);
    // The showdown continues against the Squire alone.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.violations()).toEqual([]);
  });
});
