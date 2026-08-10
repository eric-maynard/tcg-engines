/**
 * Ruling b793853e73efc080 — Unyielding Spirit (OGN-145 → ogn-145-298) · Reaction · 1+[body] · "Prevent all spell and ability damage
 *     this turn."
 *   × Imperial Decree (OGN-221 → ogn-221-298) · Action · 5+[order][order] · "When any unit takes damage this turn, kill it."
 *
 * Q: Does Unyielding Spirit stop Imperial ("Emperor's") Decree?
 * A: No. Unyielding Spirit prevents DAMAGE from spells/abilities. Imperial Decree does not deal damage — it creates a trigger that
 *    KILLS a unit once it has taken damage. Kill ≠ damage, so when a unit takes (e.g. combat) damage under the Decree it is killed
 *    regardless of Unyielding Spirit.
 * Rules: 383 / 390.2 (Decree = delayed triggered kill), 420 (Kill is its own action, not damage), 431 (damage prevention only
 *        touches damage).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const UNYIELDING_SPIRIT = "ogn-145-298";
const IMPERIAL_DECREE = "ogn-221-298";
/** Inline 1-cost spell: deal 1 to a unit (spell damage — the kind Unyielding Spirit prevents). */
const STING = { abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }], cardType: "spell", domain: "fury", energyCost: 1, name: "Sting", timing: "action" } as const;

/**
 * P1's turn: 6 + [order][order] (Decree + Sting). P2 holds bf1 with a Giant (8) and has Unyielding Spirit + 1+[body].
 * P1's Poker (2) is ready in base — its combat damage to the Giant is non-lethal on its own.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { order: 2 } })
    .resources(P2, { energy: 1, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 8, name: "Giant" }, "giant")
    .unit(P1, "base", { might: 2, name: "Poker" }, "poker")
    .hand(P1, IMPERIAL_DECREE, "decree")
    .hand(P1, STING, "sting")
    .hand(P2, UNYIELDING_SPIRIT, "spirit");
}

/** P1 casts Imperial Decree; P2 answers with Unyielding Spirit; both resolve. */
async function decreeAndSpirit(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("decree");
  await game.p1.passPriority();
  expect(game.p2.can("cast", "spirit")).toBe(true);
  await game.p2.cast("spirit");
  expect(game.chain().map((c) => c.cardId)).toEqual(["decree", "spirit"]);
  await game.settle();
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("decree")).toBe("trash");
  expect(game.zoneOf("spirit")).toBe("trash");
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  return game;
}

describe("Ruling b793853e73efc080 — Unyielding Spirit prevents damage, not Imperial Decree's KILL", () => {
  test("premise: Unyielding Spirit does its own job — SPELL damage (Sting) to the Giant is prevented, so it takes 0 and, having taken no damage, is not Decree-killed either", async () => {
    const game = await decreeAndSpirit();
    await game.p1.cast("sting", { targets: "giant" });
    await game.settle();
    expect(game.zoneOf("sting")).toBe("trash");
    expect(game.state("giant")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
  });

  test("but COMBAT damage is not spell/ability damage: the Poker's 2 lands on the Giant, and Imperial Decree's trigger then KILLS it — Unyielding Spirit does not stop a kill", async () => {
    const game = await decreeAndSpirit();
    await game.p1.move("poker", "bf1");
    for (let i = 0; i < 8; i++) {
      const r = await game.settle();
      const d = game.decision();
      if (r.reason !== "open" || (d?.kind === "action" && d.context === "main")) {
        break;
      }
    }
    expect(game.zoneOf("giant")).toBe("trash"); // 2 damage on an 8-Might unit is not lethal — the Decree killed it
    expect(game.zoneOf("poker")).toBe("trash");
    expect(game.p2.units()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("control (no Unyielding Spirit at all): same combat, same outcome — the Decree kill never depended on it", async () => {
    const game = await board().build();
    await game.p1.cast("decree");
    await game.settle();
    await game.p1.move("poker", "bf1");
    for (let i = 0; i < 8; i++) {
      const r = await game.settle();
      const d = game.decision();
      if (r.reason !== "open" || (d?.kind === "action" && d.context === "main")) {
        break;
      }
    }
    expect(game.zoneOf("giant")).toBe("trash");
  });
});
