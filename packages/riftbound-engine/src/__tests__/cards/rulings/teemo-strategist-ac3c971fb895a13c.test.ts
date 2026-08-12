/**
 * Ruling ac3c971fb895a13c — Teemo, Strategist (OGN-121 → ogn-121-298) · 2 Might · [Hidden]
 *   "When I defend, choose an enemy unit here and reveal the top 5 cards of your Main Deck. Deal 1 to that
 *    unit for each card with [Hidden] revealed this way, then recycle the revealed cards."
 *   × Vex, Apathetic (UNL-150 → unl-150-219) "When an opponent plays a unit while I'm at a battlefield,
 *     [Stun] it. They can't move it this turn."
 *
 * Q: If Vex stuns Teemo, Strategist, does Teemo still deal its ability damage?
 * A: Yes. [Stun] only stops a unit contributing its Might in the Combat Damage Step. It does not silence
 *    abilities: Teemo's "When I defend" trigger still goes on the chain and still resolves in full, dealing
 *    1 per revealed [Hidden] card.
 * Rules: 423.1.b ([Stun] = no Might contribution in the Combat Damage Step, nothing else), 383 (triggered
 *        abilities are independent chain items once queued).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TEEMO = "ogn-121-298";
const VEX_APATHETIC = "unl-150-219";
const HIDDEN_BLADE = "ogn-213-298"; // [Hidden]
const TIDETURNER = "ogn-199-298"; // [Hidden]
const ZHONYAS = "ogn-077-298"; // [Hidden]
const PLAIN = { cardType: "unit", energyCost: 1, might: 1, name: "Plain Recruit" } as const;

/** P2's turn: P1 durably holds bf1 with a STUNNED Teemo; P2's 5-Might Raider attacks into him.
 *  P1's top 5 hold exactly three [Hidden] cards ⇒ Teemo's trigger should deal 3. */
function defenceBoard(stunned: boolean) {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", TEEMO, "teemo", stunned ? { stunned: true } : undefined)
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
    .deck(P1, [HIDDEN_BLADE, TIDETURNER, ZHONYAS, PLAIN, PLAIN], ["d1", "d2", "d3", "d4", "d5"]);
}

async function attackTeemo(stunned: boolean): Promise<Game> {
  const game = await defenceBoard(stunned).build();
  await game.p2.move("raider", "bf1");
  return game;
}

describe("Ruling ac3c971fb895a13c — a stunned Teemo, Strategist still deals his ability damage", () => {
  test("setup: Vex, Apathetic really does stun the unit her controller's opponent plays", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { mind: 1 } })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", VEX_APATHETIC, "vex")
      .hand(P1, TEEMO, "teemo")
      .build();
    await game.p1.play("teemo");
    await game.settle();
    expect(game.state("teemo").isStunned).toBe(true);
  });

  test("ruling: the stunned Teemo's 'When I defend' trigger still fires and sits on the chain", async () => {
    const game = await attackTeemo(true);
    expect(game.state("teemo")).toMatchObject({ combatRole: "defender", isStunned: true });
    expect(game.chain().map((c) => c.cardId)).toContain("teemo");
    expect(game.chain().find((c) => c.cardId === "teemo")).toMatchObject({ controller: P1, triggered: true });
  });

  test("ruling: it resolves in full — 3 [Hidden] cards among the revealed 5 ⇒ 3 damage to the attacker", async () => {
    const game = await attackTeemo(true);
    // drive the chain by hand so we can read the damage before combat damage muddies it
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      await game.acting().pass();
    }
    expect(game.state("raider").damage).toBe(3);
    // "…then recycle the revealed cards": all five have left the top of the deck.
    expect(game.p1.deck().slice(0, 5)).not.toContain("d1");
    expect(game.p1.deck().slice(0, 5)).not.toContain("d3");
  });

  test("control: an UN-stunned Teemo deals exactly the same 3 — the stun changed nothing about the ability", async () => {
    const game = await attackTeemo(false);
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      await game.acting().pass();
    }
    expect(game.state("raider").damage).toBe(3);
  });

  test("what the stun DOES do: the stunned Teemo contributes no combat damage, so the 5-Might Raider survives", async () => {
    const game = await attackTeemo(true);
    await game.settle();
    expect(game.zoneOf("teemo")).toBe("trash"); // 2 Might, 5 damage
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });

  test("contrast: an UN-stunned Teemo does contribute his 2 Might in the damage step", async () => {
    const game = await attackTeemo(false);
    await game.settle();
    expect(game.zoneOf("teemo")).toBe("trash");
    // 3 (ability) + 2 (combat Might) = 5 ≥ the Raider's 5 Might.
    expect(game.zoneOf("raider")).toBe("trash");
  });
});
