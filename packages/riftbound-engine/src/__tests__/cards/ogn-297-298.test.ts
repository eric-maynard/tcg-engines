/**
 * Windswept Hillock — ogn-297-298 · Battlefield
 *
 *   Units here have [Ganking]. (They can move from battlefield to battlefield.)
 *
 * Rules: 810 (Ganking: passive keyword; a unit's Standard Move may go battlefield → battlefield,
 * 144.4.c), 144.4.a/b (otherwise only base → battlefield or battlefield → base), 144.3.a (one
 * Standard Move may gather units from different origins to one destination), 420.3 (the Standard
 * Move exhausts — an exhausted unit cannot move), 522 / 476 (a static applies continuously and only
 * while its condition holds: leave the Hillock and the grant is gone), 190.4.c / 323.6 (a battlefield
 * left empty by its controller is lost at the next cleanup), 810.2 (extra Ganking is redundant).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. "Units here" — BOTH players' units, not "friendly units": P2's unit parked on the Hillock ganks
 *     on P2's turn just as well.
 *  2. One-way door: the grant is for units HERE. A plain unit on another battlefield may NOT move to
 *     the Hillock (it has no Ganking where it stands); a unit that ganked OFF the Hillock is a plain
 *     unit again and next turn can only walk home.
 *  3. The payoff is a real move: ganking from the Hillock into an enemy-held battlefield opens a
 *     combat there, wins it and conquers — and vacating the Hillock with your only unit costs you the
 *     Hillock at cleanup (no hold next turn).
 *  4. Exhausted units don't move, Ganking or not; a printed-Ganking unit here behaves the same (810.2).
 *  5. Mixed-origin move (144.3.a): a Hillock unit and a base unit may share one Standard Move to bf2.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ogn-297-298";

/** P1's turn; P1 controls the live Hillock with a ready 3-Might Rider on it; bf2 is open; bf3 is P2's with a 1-Might Sentry. */
function board() {
  return scenario()
    .battlefield("hill", { controller: P1, def: CARD, inert: false, owner: P1 })
    .battlefield("bf2", { controller: null })
    .battlefield("bf3", { controller: P2 })
    .unit(P1, "hill", { might: 3, name: "Rider" }, "rider")
    .unit(P2, "bf3", { might: 1, name: "Sentry" }, "sentry")
    .unit(P1, "base", { might: 2, name: "Homebody" }, "home");
}

/** Battlefield destinations (not base) currently offered to `seat` for `unit`, via either move verb. */
function battlefieldHops(game: Game, seat: "p1" | "p2", unit: string): string[] {
  const out = new Set<string>();
  for (const o of game[seat].legal()) {
    if (o.verb !== "move" && o.verb !== "gank") {
      continue;
    }
    for (const v of o.variants) {
      const p = v.params as { unitIds?: string[]; unitId?: string; destination?: string; toBattlefield?: string };
      const units = p.unitIds ?? (p.unitId ? [p.unitId] : []);
      const dest = p.toBattlefield ?? p.destination;
      if (units.length === 1 && units[0] === unit && dest && dest !== "base") {
        out.add(dest);
      }
    }
  }
  return [...out].sort();
}

describe("Windswept Hillock (ogn-297-298)", () => {
  test("registry payload: a single STATIC ability granting Ganking to units here — no controller restriction (both sides' units)", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Windswept Hillock" });
    expect(def?.abilities).toEqual([{ effect: { keyword: "Ganking", target: { location: "here", type: "unit" }, type: "grant-keyword" }, type: "static" }]);
  });

  test("continuous: a vanilla unit standing on the Hillock HAS Ganking right now; the unit in base and the enemy on bf3 do not", async () => {
    const game = await board().build();
    expect(game.state("rider").keywords).toContain("Ganking");
    expect(game.state("home").keywords).not.toContain("Ganking");
    expect(game.state("sentry").keywords).not.toContain("Ganking");
  });

  test("the payoff: the Rider may move Hillock → open bf2 (battlefield to battlefield), conquering it for 1 point; the Homebody in base is offered no battlefield→battlefield hop", async () => {
    const game = await board().build();
    expect(battlefieldHops(game, "p1", "rider")).toEqual(["bf2", "bf3"]);
    await game.p1.gank("rider", "bf2");
    await game.settle();
    await game.settle();
    expect(game.locationOf("rider")).toBe("bf2");
    expect(game.state("rider").isExhausted).toBe(true);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("only while HERE: after ganking to bf2 the Rider no longer has Ganking, and on P1's next turn (ready again) it may only walk home — no bf2 → bf3 / bf2 → hill hop", async () => {
    const game = await board().build();
    await game.p1.gank("rider", "bf2");
    await game.settle();
    await game.settle();
    expect(game.state("rider").keywords).not.toContain("Ganking");
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("rider").isReady).toBe(true);
    expect(battlefieldHops(game, "p1", "rider")).toEqual([]);
    expect(game.p1.can("gank", "rider")).toBe(false);
    await game.p1.move("rider", "base");
    expect(game.locationOf("rider")).toBe("base");
  });

  test("one-way door (144.4): a plain unit on ANOTHER battlefield cannot move TO the Hillock — the grant is for units already here", async () => {
    const game = await scenario()
      .battlefield("hill", { controller: null, def: CARD, inert: false, owner: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf2", { might: 3, name: "Camper" }, "camper")
      .build();
    expect(game.state("camper").keywords).not.toContain("Ganking");
    expect(battlefieldHops(game, "p1", "camper")).toEqual([]);
    const r = await game.p1.try((p) => p.gank("camper", "hill"));
    expect(r.ok).toBe(false);
    expect(game.locationOf("camper")).toBe("bf2");
  });

  test("'Units here' includes ENEMY units: P2's unit parked on P2's Hillock ganks into open bf2 on P2's turn", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("hill", { controller: P2, def: CARD, inert: false, owner: P1 }) // P1's battlefield card, P2 holds it
      .battlefield("bf2", { controller: null })
      .unit(P2, "hill", { might: 2, name: "Interloper" }, "interloper")
      .build();
    expect(game.state("interloper").keywords).toContain("Ganking");
    expect(battlefieldHops(game, "p2", "interloper")).toEqual(["bf2"]);
    await game.p2.gank("interloper", "bf2");
    await game.settle();
    await game.settle();
    expect(game.locationOf("interloper")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });

  test("real combat off the Hillock: Rider (3) ganks into P2's bf3 held by a 1-Might Sentry → showdown → Sentry dies, Rider conquers bf3 (1 point)", async () => {
    const game = await board().build();
    await game.p1.gank("rider", "bf3");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("rider").combatRole).toBe("attacker");
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.locationOf("rider")).toBe("bf3");
    expect(game.gameState.battlefields.bf3?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("vacating with your only unit: after the Rider ganks away, P1 loses the empty Hillock at cleanup (190.4.c) and does not hold it next turn", async () => {
    const game = await board().build();
    await game.p1.gank("rider", "bf2");
    await game.settle();
    await game.settle();
    expect(game.p1.units("hill")).toEqual([]);
    expect(game.gameState.battlefields.hill?.controller).toBe(null);
    const pts = game.p1.points(); // 1 (bf2 conquer)
    await game.advanceTurn();
    await game.advanceTurn(); // P1's Beginning Phase: holds bf2 only
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(pts + 1);
    expect(game.gameState.scoredThisTurn?.[P1]).toEqual(["bf2"]);
  });

  test("exhausted units don't move, Ganking or not (the Standard Move's cost is exhausting)", async () => {
    const game = await scenario()
      .battlefield("hill", { controller: P1, def: CARD, inert: false, owner: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "hill", { might: 3, name: "Tired Rider" }, "tired", { exhausted: true })
      .build();
    expect(game.state("tired").keywords).toContain("Ganking");
    expect(battlefieldHops(game, "p1", "tired")).toEqual([]);
    expect((await game.p1.try((p) => p.gank("tired", "bf2"))).ok).toBe(false);
  });

  test("mixed origins, one destination (144.3.a): the Hillock Rider and the base Homebody move to bf2 together in a single Standard Move", async () => {
    const game = await board().build();
    await game.p1.move(["rider", "home"], "bf2");
    await game.settle();
    await game.settle();
    expect(game.locationOf("rider")).toBe("bf2");
    expect(game.locationOf("home")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
  });

  test("810.2 redundancy: a printed-Ganking unit on the Hillock still lists Ganking once it leaves (printed), and ganks off the Hillock like anyone else", async () => {
    const game = await scenario()
      .battlefield("hill", { controller: P1, def: CARD, inert: false, owner: P1 })
      .battlefield("bf2", { controller: null })
      .battlefield("bf3", { controller: null })
      .unit(P1, "hill", { keywords: ["Ganking"], might: 2, name: "Born Ganker" }, "ganker")
      .build();
    expect(game.state("ganker").keywords.filter((k) => k === "Ganking")).toHaveLength(1);
    await game.p1.gank("ganker", "bf2");
    await game.settle();
    await game.settle();
    expect(game.locationOf("ganker")).toBe("bf2");
    expect(game.state("ganker").keywords).toContain("Ganking"); // printed keyword survives leaving
  });

  test("inert control: with the Hillock's text stripped the same Rider has no Ganking and no battlefield→battlefield move", async () => {
    const game = await scenario()
      .battlefield("hill", { controller: P1, def: CARD, inert: true })
      .battlefield("bf2", { controller: null })
      .unit(P1, "hill", { might: 3, name: "Rider" }, "rider")
      .build();
    expect(game.state("rider").keywords).not.toContain("Ganking");
    expect(battlefieldHops(game, "p1", "rider")).toEqual([]);
  });
});
