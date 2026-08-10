/**
 * Ruling 1bd4b510ce2c24a2 — Teemo, Strategist (OGN-121 → ogn-121-298) · Champion · Mind · 2 Might
 *     "[Hidden] When I defend, choose an enemy unit here and reveal the top 5 cards of your Main Deck. Deal 1 to that
 *      unit for each card with [Hidden] revealed this way, then recycle the revealed cards."
 *   × Cannon Barrage (OGN-127 → ogn-127-298) · Reaction · Body · [2]+[body] · "Deal 2 to all enemy units in combat."
 *
 * Q: Hidden Teemo is revealed at a battlefield under attack, then Cannon Barrage kills him before his effect resolves —
 *    does the effect still resolve and look at the top 5?
 * A: Yes, the ability still resolves and reveals (then recycles) the top 5 — but it deals NO damage: the damage is
 *    aimed at an enemy unit "here" (where Teemo is) and Teemo is no longer anywhere.
 * Rules: 811 (playing a Hidden card), 464.2.c.3.a (late arrival becomes a defender), 383 (trigger persists without its
 *        source), 359.3.e ("here" undefined once the source left → that instruction is ignored), 424 / 403.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TEEMO_STRATEGIST = "ogn-121-298";
const CANNON_BARRAGE = "ogn-127-298";
const BACK_OFF = "unl-042-219"; // a [Hidden] spell
const SKULKER = "ogn-175-298"; // no [Hidden]

const TOP_SIX = ["h1", "n1", "h2", "n2", "n3", "n4"];

/**
 * P2's turn 3. P1 holds bf1 with Holder (4) and hid Teemo there on an earlier turn. P1's deck, top first: Back Off (H),
 * Skulker, Back Off (H), Skulker, Skulker, Skulker — two [Hidden] cards among the top five. P2: Raider (5) in base,
 * Cannon Barrage in hand with exactly [2]+[body].
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 2, power: { body: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Holder" }, "holder")
    .facedown(P1, "bf1", TEEMO_STRATEGIST, "teemo")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
    .hand(P2, CANNON_BARRAGE, "cannon")
    .deck(P1, [BACK_OFF, SKULKER, BACK_OFF, SKULKER, SKULKER, SKULKER], TOP_SIX);
}

/** Raider attacks bf1; P2 passes focus; P1 plays Teemo from face-down → he defends and his trigger (naming the Raider) is on the chain. */
async function teemoRevealedIntoCombat(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  await game.p2.passFocus();
  await game.p1.reveal("teemo");
  expect(game.zoneOf("teemo")).toBe("battlefield-bf1");
  expect(game.state("teemo").combatRole).toBe("defender");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "teemo", controller: P1, targets: ["raider"], triggered: true })]);
  return game;
}

/** …P1 passes; P2 answers with Cannon Barrage; both pass so it resolves (LIFO) — Teemo dies with his trigger still pending. */
async function barrageKillsTeemo(game: Game): Promise<void> {
  await game.p1.passPriority();
  await game.p2.cast("cannon");
  expect(game.p2.resources()).toEqual({ energy: 0, power: { body: 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["teemo", "cannon"]);
  await game.p2.passPriority();
  await game.p1.passPriority();
}

describe("Ruling 1bd4b510ce2c24a2 — Teemo killed in response: his defend trigger still resolves (reveal 5) but deals no damage", () => {
  test("control (no Barrage): the trigger resolves normally — two [Hidden] cards among the top five → Raider takes 2; the five are recycled (n4 becomes the top card)", async () => {
    const game = await teemoRevealedIntoCombat();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("raider").damage).toBe(2);
    expect(game.p1.deck()[0]).toBe("n4");
    expect(game.p1.deck().slice(-5).sort()).toEqual(["h1", "h2", "n1", "n2", "n3"]);
  });

  test("Cannon Barrage resolves first: 2 to each enemy unit in combat kills the 2-Might Teemo (Holder takes 2) — and Teemo's trigger is STILL on the chain", async () => {
    const game = await teemoRevealedIntoCombat();
    await barrageKillsTeemo(game);
    expect(game.zoneOf("cannon")).toBe("trash");
    expect(game.zoneOf("teemo")).toBe("trash");
    expect(game.state("holder")).toMatchObject({ damage: 2, zone: "battlefield-bf1" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "teemo", triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("the orphaned trigger then resolves and deals NO damage — 'an enemy unit here' has no 'here' once Teemo is gone — and the showdown carries on (Raider 5 v Holder 4)", async () => {
    const game = await teemoRevealedIntoCombat();
    await barrageKillsTeemo(game);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("raider").damage).toBe(0);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    await game.settle();
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  // Expected (ruling): the reveal is not tied to Teemo's location — the top 5 are still revealed and then recycled,
  // so afterwards n4 is P1's top card and h1/n1/h2/n2/n3 sit at the bottom. Actual: the engine skips the whole
  // instruction once the "here" referent is gone — the deck is left untouched (top card still h1).
  test("ruling 1bd4b510ce2c24a2 — with Teemo dead the engine skips the reveal/recycle entirely; ruling: top 5 are still revealed and recycled (only the damage is lost)", async () => {
    const game = await teemoRevealedIntoCombat();
    await barrageKillsTeemo(game);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("raider").damage).toBe(0);
    expect(game.p1.deck()[0]).toBe("n4");
    expect(game.p1.deck().slice(-5).sort()).toEqual(["h1", "h2", "n1", "n2", "n3"]);
  });
});
