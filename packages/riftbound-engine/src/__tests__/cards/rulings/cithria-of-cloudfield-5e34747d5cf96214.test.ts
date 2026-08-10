/**
 * Ruling 5e34747d5cf96214 — Cithria of Cloudfield (OGN-139 → ogn-139-298) · 1 Might "When you play another unit, buff me."
 *   × Sett, Kingpin (OGN-240 → ogn-240-298) · 5 Might [Tank] "I get +1 [Might] for each buffed friendly unit at my battlefield."
 *
 * Q: Buffed Cithria dies in combat; Sett loses her +1 while carrying damage that is lethal at the lower Might. Does Sett die?
 * A: No. In the Resolution Step all lethally damaged units are trashed simultaneously — at that instant Cithria is still there,
 *    so Sett is checked at the higher Might and is not lethal — and then all damage is healed. By the time anything could look
 *    again, Sett has no damage. Units only die in cleanups / the resolution step, never "in between".
 * Rules: 465.2.d / 466.1 (combat damage dealt simultaneously; Combat Cleanup kills lethal units then 466.1.a.1 heals all),
 *        522 (passives apply continuously while on board), 140.3 (lethal = non-zero damage ≥ Might).
 * Setup note: so that the attacker may legally kill Cithria WITHOUT first assigning lethal damage to the [Tank] Sett (815), Cithria
 * has been given [Tank] this turn (as e.g. Block ogn-057-298 does) — with two Tanks the assigner picks the order (815.1.c.2).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CITHRIA = "ogn-139-298";
const SETT_KINGPIN = "ogn-240-298";

/**
 * P2's turn. P1 holds bf1 with Sett, Kingpin (5, +1 from buffed Cithria = 6) and a BUFFED Cithria (1+1 = 2, granted [Tank] this
 * turn). P2's 7-Might Brute attacks from base.
 */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", SETT_KINGPIN, "sett")
    .unit(P1, "bf1", CITHRIA, "cithria", { buffed: true, grantedKeywords: [{ duration: "turn", keyword: "Tank" }] })
    .unit(P2, "base", { might: 7, name: "Brute" }, "brute")
    .build();
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Brute attacks bf1; both pass Focus; P2 is asked to assign its 7 combat damage. */
async function toAssignment(): Promise<Game> {
  const game = await board();
  await game.p2.move("brute", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
  await game.p2.passFocus();
  await game.p1.passFocus();
  return game;
}

describe("Ruling 5e34747d5cf96214 — Sett survives losing Cithria's +1: deaths are simultaneous, then damage heals", () => {
  test("premise: Sett reads 6 (5 + 1 for the buffed Cithria at his battlefield); Cithria is a buffed 2", async () => {
    const game = await board();
    expect(game.state("sett")).toMatchObject({ might: 6, staticMightBonus: 1 });
    expect(game.state("cithria")).toMatchObject({ isBuffed: true, might: 2 });
    expect(game.state("cithria").keywords).toContain("Tank");
  });

  test("the attacker (P2) CHOOSES the assignment: a distribute decision for P2 over Sett (lethal at 6 — his CURRENT Might, Cithria included) and Cithria (lethal at 2)", async () => {
    const game = await toAssignment();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "distribute", seat: P2, total: 7 });
    const buckets = d?.kind === "distribute" ? Object.fromEntries(d.buckets.map((b) => [b.key, b.lethal])) : {};
    expect(buckets).toEqual({ cithria: 2, sett: 6 });
  });

  test("P2 kills Cithria (2) and puts the other 5 on Sett: all damage is dealt at once, Cithria (and the Brute, who took 8) are trashed together — Sett had 5 < 6 at that moment and is NOT killed", async () => {
    const game = await toAssignment();
    await game.p2.distribute({ cithria: 2, sett: 5 });
    // P1's 8 (6 + 2) all goes to the lone Brute — forced; drain whatever remains of the combat.
    await game.settle();
    expect(showdown(game)).toBeUndefined();
    expect(game.zoneOf("cithria")).toBe("trash");
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.zoneOf("sett")).toBe("battlefield-bf1");
  });

  test("afterwards Sett is a 5 (the +1 left with Cithria) with ZERO damage — healed in the Combat Cleanup before any later check could call 5-damage-on-5-Might lethal; P1 keeps bf1", async () => {
    const game = await toAssignment();
    await game.p2.distribute({ cithria: 2, sett: 5 });
    await game.settle();
    expect(game.state("sett")).toMatchObject({ damage: 0, might: 5, staticMightBonus: 0, zone: "battlefield-bf1" });
    expect(game.p1.trash()).not.toContain("sett");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: 6 assigned to Sett IS lethal at the moment damage is dealt (Cithria still present, Might 6) — Sett dies, Cithria (1 < 2) lives", async () => {
    const game = await toAssignment();
    await game.p2.distribute({ cithria: 1, sett: 6 });
    await game.settle();
    expect(game.zoneOf("sett")).toBe("trash");
    expect(game.zoneOf("cithria")).toBe("battlefield-bf1");
    expect(game.state("cithria").damage).toBe(0);
    expect(game.zoneOf("brute")).toBe("trash"); // took 8 ≥ 7
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
