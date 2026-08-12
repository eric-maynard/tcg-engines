/**
 * Ruling bcd85efd39649dcd — Charm (OGN-043 → ogn-043-298) · Spell · [1][calm] · "Move an enemy unit."
 *
 * Q: In 2v2, can Charm move an opponent's unit into a battlefield where their TEAMMATE has units, forcing a
 *    showdown between allies?
 * A: No. Allies may never have units at the same battlefield, so that destination is not a legal choice at
 *    all — the play is prevented rather than producing an ally-vs-ally showdown. (Control is still not
 *    shared: a battlefield has exactly one controller, teammate or not.)
 * Rules: 489.8 (Magma Chamber / 2v2), 190.2.b (one controller per battlefield), 355.4 (destinations are
 *        chosen from the legal ones at finalization).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, P3, P4, scenario } from "../../../harness";

const CHARM = "ogn-043-298";

/** Four seats: P4 holds bf2 with a body, P2 holds bf1 with the unit P1 wants to Charm. */
function fourSeats() {
  return scenario({ players: 4 })
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P4 })
    .unit(P2, "bf1", { might: 2, name: "Victim" }, "victim")
    .unit(P4, "bf2", { might: 1, name: "Fourth Seat Body" }, "mate")
    .hand(P1, CHARM, "charm");
}

describe("Ruling bcd85efd39649dcd — Charm cannot deliver an opponent's unit onto their teammate's battlefield", () => {
  test("control is never shared: bf2 records exactly one controller and P2 is not it", async () => {
    const game = await fourSeats().build();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P4);
    expect(game.seat(P2).battlefields({ controlled: true })).not.toContain("bf2");
    expect(game.seat(P4).battlefields({ controlled: true })).toEqual(["bf2"]);
    expect(game.seat(P3).battlefields({ controlled: true })).toEqual([]);
  });

  test("baseline in the FREE-FOR-ALL four-player game the harness builds (no team mapping): every seat is an opponent, so bf2 is an ordinary destination", async () => {
    const game = await fourSeats().build();
    await game.p1.cast("charm", { targets: "victim" });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", timing: "FIN" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).toSorted() : []).toEqual([
      "base",
      "battlefield-bf2",
    ]);
    await game.p1.pick("battlefield-bf2");
    await game.settle();
    expect(game.locationOf("victim")).toBe("bf2"); // legal precisely because P2 and P4 are not allies
    expect(game.zoneOf("mate")).toBe("trash"); // …and it really is a showdown between those two seats
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  // BUG: the ruling is about Magma Chamber (2v2), and the harness cannot build one — `scenario({players: 4})`
  // leaves `gameState.teams` unset, so `areAllies` degrades to identity and every seat is an opponent. The
  // engine's ally gate (operations/teams.ts areAllies, used by standard-move / move-destinations) therefore
  // never engages and P4's occupied battlefield stays on Charm's destination list.
  test.failing(
    "BUG: ruling bcd85efd39649dcd — in a 2v2 the teammate's battlefield must not be offered; the harness seats four players with no teams, so it is",
    async () => {
      const game = await fourSeats().build();
      expect(game.gameState.teams).toEqual({ [P1]: 0, [P2]: 1, [P3]: 0, [P4]: 1 }); // Magma Chamber pairing
      await game.p1.cast("charm", { targets: "victim" });
      const d = game.decision();
      expect(d?.kind === "pick" ? d.options.map((o) => o.key) : []).not.toContain("battlefield-bf2");
    },
  );
});
