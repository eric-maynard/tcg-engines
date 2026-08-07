/**
 * Ruin Runner — sfd-105-221 · Unit · Body · 6 energy · 5 Might
 *
 *   I can't be chosen by enemy spells and abilities.
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  1. This is stronger than Deflect: no amount of spare power lets an OPPONENT choose it — it is
 *     simply not a legal target. If it is the only candidate, the enemy spell/ability cannot be
 *     played at all (355.8: a mandatory target must exist to put the item on the chain).
 *  2. "enemy" only: its controller's own spells choose it freely (a friendly Hextech Ray can even
 *     shoot it).
 *  3. "chosen" only: non-targeting effects (Flurry of Blades "all units at battlefields", combat
 *     damage) hit it normally — it is not indestructible.
 *  4. "spells AND abilities": an enemy gear's activated ability (Iron Ballista) and an enemy unit's
 *     play trigger (Solari Shieldbearer "stun a unit") may not pick it either; the Shieldbearer,
 *     with no other candidate, ends up stunning itself.
 *  5. Enemy MOVE-choosers (Charm "Move an enemy unit") are abilities that choose too.
 *  6. The protection is a board-only passive; the registry models it as a virtual "Untargetable"
 *     keyword granted to self.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-105-221";
const HEXTECH_RAY = "ogn-009-298"; // Action · 1 + [fury] · Deal 3 to a unit at a battlefield.
const FLURRY = "ogn-133-298"; // Reaction · 1 · Deal 1 to all units at battlefields.
const CHARM = "ogn-043-298"; // 1 + [calm] · Move an enemy unit.
const IRON_BALLISTA = "ogn-017-298"; // Gear · [Exhaust]: Deal 2 to a unit at a battlefield.
const SOLARI = "ogn-051-298"; // Unit · 3 · When you play me, stun a unit.
const DISCIPLINE = "ogn-058-298"; // Reaction · 2 · Give a unit +2 Might this turn. Draw 1.

/** P2 to act; Ruin Runner (P1) sits at P1's bf1, optionally with a vanilla friend beside it. */
function enemyTurn(withPal: boolean, p2: { energy?: number; power?: Record<string, number> } = { energy: 1, power: { fury: 1, rainbow: 2 } }) {
  const b = scenario().active(P2).resources(P2, p2).battlefield("bf1", { controller: P1 }).battlefield("bf2", { controller: null }).unit(P1, "bf1", CARD, "rr");
  return withPal ? b.unit(P1, "bf1", { might: 3, name: "Pal" }, "pal") : b;
}

describe("Ruin Runner (sfd-105-221)", () => {
  test("costs 6 energy; a 5-Might unit that enters exhausted carrying the (virtual) Untargetable protection; 5 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "rr").build();
    await game.p1.play("rr");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("rr")).toBe("base");
    expect(game.state("rr")).toMatchObject({ isExhausted: true, might: 5 });
    expect(game.state("rr").keywords).toContain("Untargetable");
    const short = await scenario().resources(P1, { energy: 5, power: { body: 3 } }).hand(P1, CARD, "rr").build();
    expect(short.p1.can("play", "rr")).toBe(false);
  });

  test("enemy spell: Hextech Ray offers only the vanilla Pal — Ruin Runner is refused even with spare power to burn (not a Deflect tax)", async () => {
    const game = await enemyTurn(true).hand(P2, HEXTECH_RAY, "ray").build();
    expect(game.p2.option("cast", "ray")?.fields.find((f) => f.arg === "targets")?.options).toEqual([["pal"]]);
    const r = await game.p2.try((p) => p.cast("ray", { targets: "rr" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("ray")).toBe("hand");
    await game.p2.cast("ray", { targets: "pal" });
    await game.settle();
    expect(game.state("rr").damage).toBe(0);
    expect(game.zoneOf("pal")).toBe("trash"); // 3 into a 3-Might unit
  });

  test("sole candidate → the enemy spell cannot be played at all (355.8)", async () => {
    const game = await enemyTurn(false).hand(P2, HEXTECH_RAY, "ray").build();
    expect(game.p2.can("cast", "ray")).toBe(false);
  });

  test("'enemy' only: its controller's own spells choose it freely — friendly Discipline makes it 7, a friendly Hextech Ray can even shoot it", async () => {
    const buff = await scenario().resources(P1, { energy: 2 }).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "rr").hand(P1, DISCIPLINE, "disc").build();
    await buff.p1.cast("disc", { targets: "rr" });
    expect(buff.p1.energy()).toBe(0); // no extra cost of any kind
    await buff.settle();
    expect(buff.state("rr").might).toBe(7);
    const shoot = await scenario().resources(P1, { energy: 1, power: { fury: 1 } }).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "rr").hand(P1, HEXTECH_RAY, "ray").build();
    expect(shoot.p1.option("cast", "ray")?.fields.find((f) => f.arg === "targets")?.options).toEqual([["rr"]]);
    await shoot.p1.cast("ray", { targets: "rr" });
    await shoot.settle();
    expect(shoot.state("rr").damage).toBe(3);
  });

  test("'chosen' only: the non-targeting Flurry of Blades (all units at battlefields) still deals it 1", async () => {
    const game = await enemyTurn(true, { energy: 1 }).hand(P2, FLURRY, "fl").build();
    await game.p2.cast("fl");
    await game.settle();
    expect(game.state("rr").damage).toBe(1);
    expect(game.state("pal").damage).toBe(1);
  });

  test("not indestructible: a 6-Might attacker kills it in ordinary combat and takes the battlefield", async () => {
    const game = await enemyTurn(false, { energy: 0 }).unit(P2, "base", { might: 6, name: "Bruiser" }, "bruiser").build();
    await game.p2.move("bruiser", "bf1");
    await game.settle();
    expect(game.zoneOf("rr")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("enemy MOVE-chooser: Charm ('Move an enemy unit') cannot be cast when Ruin Runner is the only enemy unit", async () => {
    const game = await enemyTurn(false, { energy: 1, power: { calm: 1, rainbow: 1 } }).hand(P2, CHARM, "charm").build();
    expect(game.p2.can("cast", "charm")).toBe(false);
    const withPal = await enemyTurn(true, { energy: 1, power: { calm: 1, rainbow: 1 } }).hand(P2, CHARM, "charm").build();
    const offered = withPal.p2.option("cast", "charm")?.fields.find((f) => f.arg === "targets")?.options ?? [];
    expect(offered).toContainEqual(["pal"]);
    expect(offered).not.toContainEqual(["rr"]);
  });

  test("enemy activated ABILITY: Iron Ballista may only shoot the Pal; alone, Ruin Runner leaves the Ballista with nothing to activate on", async () => {
    const game = await enemyTurn(true, { energy: 0 }).gear(P2, IRON_BALLISTA, "bal").build();
    await game.p2.activate("bal");
    await game.settle(); // the only legal pick (pal) is forced
    if (game.decision()?.kind === "pick") {
      const d = game.decision();
      expect(d?.kind === "pick" && d.options.map((o) => o.card)).not.toContain("rr");
      await game.p2.pick("pal");
      await game.settle();
    }
    expect(game.state("pal").damage).toBe(2);
    expect(game.state("rr").damage).toBe(0);
    expect(game.state("bal").isExhausted).toBe(true);
    const solo = await enemyTurn(false, { energy: 0 }).gear(P2, IRON_BALLISTA, "bal").build();
    expect(solo.p2.can("activate", "bal")).toBe(false);
    expect(solo.state("rr").damage).toBe(0);
  });

  test("enemy triggered ABILITY: Solari Shieldbearer's 'stun a unit' cannot pick it — with no other candidate the Shieldbearer stuns itself", async () => {
    const game = await enemyTurn(false, { energy: 3 }).hand(P2, SOLARI, "sol").build();
    await game.p2.play("sol");
    expect(game.chain().map((c) => c.name)).toEqual(["Solari Shieldbearer"]);
    await game.settle();
    if (game.decision()?.kind === "pick") {
      const d = game.decision();
      expect(d?.kind === "pick" && d.options.map((o) => o.card)).not.toContain("rr");
      await game.p2.pick("sol");
      await game.settle();
    }
    expect(game.state("rr").isStunned).toBe(false);
    expect(game.state("sol").isStunned).toBe(true);
    expect(game.decision()?.kind).toBe("action");
  });

  test("registry payload: a single static granting the virtual 'Untargetable' keyword to self (hand-authored for 'can't be chosen by enemy spells and abilities')", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "body", energyCost: 6, might: 5 });
    expect(def?.rulesText).toBe("I can't be chosen by enemy spells and abilities.");
    expect(def?.abilities).toEqual([{ effect: { keyword: "Untargetable", target: "self", type: "grant-keyword" }, type: "static" }]);
  });
});
