/**
 * Ruling da5ebc51980410ef — Akali, Deadly Weapon (VEN-021 → ven-021-166) · Unit · Fury · 3 · 3 Might
 *     "When I move, you may deal 1 to a unit at a battlefield I moved to or from. …"
 *   × Mask of Foresight (OGN-060 → ogn-060-298) · Gear "When a friendly unit attacks or defends alone, give it +1 [Might] this turn."
 *   × Morgana, Vindictive (VEN-017 → ven-017-166) · 5 Might · [Ambush] "When you play me, deal damage to a unit equal to the damage marked on it."
 *   × Rogue Assassin (VEN-139 → ven-139-166, the Akali legend) "[Action] [Exhaust]: If it's your turn, move a friendly unit in a
 *     showdown to base and if I'm [Empowered], ready it."
 *
 * Q: Akali moves into a battlefield (Mask on board), then I Ambush Morgana in, then pull Akali back out with the
 *    Akali legend. Does Morgana — now alone — get Mask's +1?
 * A: No. Mask's "attacks alone" is checked only when a unit GAINS its attacker/defender designation. Morgana was
 *    designated while Akali was still there (not alone); moving Akali away later does not re-designate Morgana and
 *    creates no new Mask trigger.
 * Rules: 383.4.e/f (attack/defend triggers fire once, on gaining the designation), 740.2.a (alone), 464.2.c.3.a.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AKALI = "ven-021-166";
const MASK = "ogn-060-298";
const MORGANA = "ven-017-166";
const ROGUE_ASSASSIN = "ven-139-166";

/** P1's turn. P1: Rogue Assassin legend, Mask in base, Akali (3) in base, Morgana in hand + exactly 5 + [fury]. P2 holds bf1 with a 6-Might Wall. */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .legend(P1, ROGUE_ASSASSIN, "rogue")
    .gear(P1, MASK, "mask")
    .unit(P1, "base", AKALI, "akali")
    .hand(P1, MORGANA, "morgana")
    .unit(P2, "bf1", { might: 6, name: "Wall" }, "wall");
}

/** Akali moves in alone (declining her own move trigger); Mask's trigger for AKALI resolves; P1 holds Focus. */
async function akaliAttacks(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("akali", "bf1");
  // Akali's own "When I move, you may deal 1…" — a leading "you may" is decided at finalization; decline it.
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
  await game.p1.no();
  // Akali attacked ALONE → Mask triggered for her (the only Mask trigger this scenario ever produces).
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mask", triggered: true })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.chain()).toEqual([]);
  expect(game.state("akali")).toMatchObject({ combatRole: "attacker", might: 4, mightModifier: 1 });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

/** …P1 Ambushes Morgana into bf1; her play trigger (0 damage) resolves; Focus returns to P1. */
async function ambushMorgana(game: Game): Promise<void> {
  expect(game.p1.can("play", "morgana")).toBe(true);
  await game.p1.play("morgana", { to: "bf1" });
  // "When you play me, deal damage to a unit equal to the damage marked on it" — target chosen at finalization.
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
  await game.p1.pick("wall"); // 0 damage marked → deals 0
  expect(game.state("morgana")).toMatchObject({ combatRole: "attacker", zone: "battlefield-bf1" });
  // Morgana joined a combat where Akali already attacks → NOT alone → no Mask trigger, only her own play trigger.
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "morgana", triggered: true })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.chain()).toEqual([]);
  expect(game.state("wall").damage).toBe(0);
  expect(game.state("morgana")).toMatchObject({ might: 5, mightModifier: 0 });
  if (game.actingSeat() === P2) {
    await game.p2.passFocus();
  }
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
}

describe("Ruling da5ebc51980410ef — pulling Akali out does not make Mask of Foresight trigger for the Ambushed Morgana", () => {
  test("Morgana Ambushed next to attacking Akali gains 'attacker' while NOT alone: no Mask trigger, she stays at 5", async () => {
    const game = await akaliAttacks();
    await ambushMorgana(game);
    expect(game.p1.units("bf1").sort()).toEqual(["akali", "morgana"]);
    expect(game.state("morgana")).toMatchObject({ combatRole: "attacker", might: 5, mightModifier: 0 });
  });

  test("Rogue Assassin then moves Akali to base: Morgana is now the lone attacker but is NOT re-designated — no Mask trigger appears and she still has 5 Might", async () => {
    const game = await akaliAttacks();
    await ambushMorgana(game);
    await game.p1.activate("rogue");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rogue" })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    // "move a friendly unit in a showdown to base" — chosen as it resolves: both attackers are offered.
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["akali", "morgana"]);
    await game.p1.pick("akali");
    // Akali's own move trigger asks again (she moved from bf1) — decline.
    if (game.decision()?.kind === "yes-no") {
      await game.p1.no();
    }
    expect(game.locationOf("akali")).toBe("base");
    expect(game.p1.units("bf1")).toEqual(["morgana"]); // alone now
    expect(game.state("morgana").combatRole).toBe("attacker"); // same designation, never re-gained
    // The ruling: no Mask trigger was created for Morgana; she has no +1.
    expect(game.chain().some((c) => c.cardId === "mask")).toBe(false);
    expect(game.state("morgana")).toMatchObject({ might: 5, mightModifier: 0 });
  });

  test("outcome confirms it: Morgana (5, no bonus) fights the 6-Might Wall alone and dies — with Mask's +1 she would have traded", async () => {
    const game = await akaliAttacks();
    await ambushMorgana(game);
    await game.p1.activate("rogue");
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.pick("akali");
    if (game.decision()?.kind === "yes-no") {
      await game.p1.no();
    }
    await game.settle();
    expect(game.zoneOf("morgana")).toBe("trash");
    expect(game.state("wall")).toMatchObject({ damage: 0, zone: "battlefield-bf1" }); // took 5 < 6, healed after combat
    expect(game.locationOf("akali")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});
