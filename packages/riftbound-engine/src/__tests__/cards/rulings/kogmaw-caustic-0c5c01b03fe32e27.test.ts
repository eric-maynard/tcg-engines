/**
 * Ruling 0c5c01b03fe32e27 — Kog'Maw, Caustic (OGN-190 → ogn-190-298) · 1-Might Chaos champion
 *   "[Deathknell] — Deal 4 to all units at my battlefield."
 *
 * Q: In combat, must a player assign might/damage if they have units with might, or may they choose to assign
 *    nothing (e.g. to avoid killing a Kog'Maw whose Deathknell would punish them)?
 * A: Damage must be assigned whenever any Might is available — you cannot take damage without dealing yours
 *    back. Lethal damage must be assigned in full before moving on; even when the assignment kills a unit with
 *    a death trigger (Kog'Maw) it cannot be avoided.
 * Rules: 465.2.c (each side assigns damage equal to its summed Might), 465.2.c.3 / 465.2.c.4 (lethal first,
 *        no over-assignment while other units remain), 808 (Deathknell), 466.2 (death triggers before the result).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KOGMAW = "ogn-190-298";

/** P1's turn. P2 holds bf1 with a lone Kog'Maw (1). P1's 3-Might Raider attacks from base. */
function loneKog() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", KOGMAW, "kog")
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider");
}

/** P1's turn. P2 holds bf1 with Kog'Maw (1) + a 5-Might Bruiser. P1's 4-Might Brute attacks. */
function kogAndBruiser() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", KOGMAW, "kog")
    .unit(P2, "bf1", { might: 5, name: "Bruiser" }, "bruiser")
    .unit(P1, "base", { might: 4, name: "Brute" }, "brute");
}

/** Attack bf1 with `unit`, both players pass Focus → combat damage step. */
async function attackAndClose(game: Game, unit: string): Promise<void> {
  await game.p1.move(unit, "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
}

describe("Ruling 0c5c01b03fe32e27 — combat damage MUST be assigned; you can't decline to hit Kog'Maw", () => {
  test("lone Kog'Maw defender: the Raider's 3 damage is forced onto it (no way to assign 0) — Kog'Maw dies even though that sets off its Deathknell", async () => {
    const game = await loneKog().build();
    await attackAndClose(game, "raider");
    const d = game.decision();
    if (d?.kind === "distribute" && d.seat === P1) {
      // If the engine surfaces the assignment at all, it demands the full 3 and refuses an empty assignment.
      expect(d.total).toBe(3);
      expect(d.buckets.map((b) => b.card ?? b.key)).toEqual(["kog"]);
      expect((await game.p1.try((p) => p.distribute({ kog: 0 }))).ok).toBe(false);
      await game.p1.distribute({ kog: 3 });
    }
    if (game.decision()?.kind === "order") {
      await game.acceptTriggerOrder();
    }
    expect(game.zoneOf("kog")).toBe("trash");
    // Kog'Maw's Deathknell is now a chain item — the very consequence P1 could not dodge.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kog", controller: P2, triggered: true })]);
  });

  test("…and the Deathknell then deals 4 to every unit at that battlefield: the 3-Might Raider (healed of Kog'Maw's 1) dies to it", async () => {
    const game = await loneKog().build();
    await attackAndClose(game, "raider");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("kog")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller ?? null).not.toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("two defenders (Kog'Maw 1 + Bruiser 5) vs a 4-Might Brute: the assignment prompt demands ALL 4 — assigning nothing, or only part of it, is rejected", async () => {
    const game = await kogAndBruiser().build();
    await attackAndClose(game, "brute");
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1, total: 4 });
    expect((await game.p1.try((p) => p.distribute({ bruiser: 0, kog: 0 }))).ok).toBe(false); // "take it without hitting back" — no
    expect((await game.p1.try((p) => p.distribute({ bruiser: 0, kog: 1 }))).ok).toBe(false); // 3 Might left unassigned — no
    expect((await game.p1.try((p) => p.distribute({ bruiser: 2, kog: 0 }))).ok).toBe(false); // partial — no
    // Still waiting on a legal, complete assignment.
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1, total: 4 });
    expect(game.zoneOf("kog")).toBe("battlefield-bf1");
  });

  test("lethal must be assigned in full before moving on (465.2.c.3/4): {kog:2, bruiser:2} over-assigns Kog'Maw while the Bruiser remains → rejected; {kog:1, bruiser:3} is legal and kills Kog'Maw (Deathknell follows)", async () => {
    const game = await kogAndBruiser().build();
    await attackAndClose(game, "brute");
    expect((await game.p1.try((p) => p.distribute({ bruiser: 2, kog: 2 }))).ok).toBe(false);
    await game.p1.distribute({ bruiser: 3, kog: 1 });
    if (game.decision()?.kind === "order") {
      await game.acceptTriggerOrder();
    }
    expect(game.zoneOf("kog")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kog", triggered: true })]);
    await game.settle();
    // Brute (4) took 6 in combat and died; Bruiser survives the Deathknell's 4 (healed first, 4 < 5).
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.state("bruiser")).toMatchObject({ damage: 4, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});
