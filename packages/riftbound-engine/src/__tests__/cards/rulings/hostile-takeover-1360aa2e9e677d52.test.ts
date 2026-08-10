/**
 * Ruling 1360aa2e9e677d52 — Hostile Takeover (SFD-202 → sfd-202-221, Action, 5 + [rainbow][rainbow])
 *   "Take control of an enemy unit at a battlefield. Ready it. … Lose control of that unit and recall it at end of turn."
 *   × Deathgrip (sfd-163-221, Reaction, 2) "Kill a friendly unit. If you do, give +[Might] equal to its Might to another
 *     friendly unit this turn. Draw 1."
 *   × a [Deflect] unit (Pouty Poro ogn-013-298, 2 Might: "Opponents must pay [rainbow] to choose me with a spell or ability.")
 *
 * Q: After taking control of a Deflect unit with Hostile Takeover, do I still pay Deflect to target it with my own
 *    Deathgrip?
 * A: No. Deflect taxes OPPONENTS of the unit's controller. Once you control it, it is your friendly unit and your
 *    spells are not enemy spells — no surcharge. (Targeting it with Hostile Takeover, while it was still theirs, did cost
 *    the extra [rainbow].)
 * Rules: 809.1.c (Deflect: spells "an opponent controls"), 740.1.a/740.1.b (friendly/enemy are relative to CONTROLLER),
 *        477.1.a (take control).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HOSTILE_TAKEOVER = "sfd-202-221";
const DEATHGRIP = "sfd-163-221";
const POUTY_PORO = "ogn-013-298";

/**
 * P1's turn. P2's Pouty Poro (Deflect, 2) alone at P2's bf1. P1: Buddy (2) in base, Hostile Takeover + Deathgrip in hand,
 * EXACTLY 7 energy + 3 rainbow: 5 + 2 rainbow for HT, +1 rainbow Deflect surcharge, 2 for Deathgrip — nothing spare.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { rainbow: 3 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", POUTY_PORO, "poro")
    .unit(P1, "base", { might: 2, name: "Buddy" }, "buddy")
    .hand(P1, HOSTILE_TAKEOVER, "ht")
    .hand(P1, DEATHGRIP, "dg");
}

/** HT on the Poro, resolved; the ensuing showdown at bf1 settled (P1 conquers); back in P1's open main phase. */
async function takenOver(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("ht", { targets: "poro" });
  await game.settle(); // HT resolves → non-combat showdown at bf1 handed back once
  await game.settle(); // both pass → P1 conquers bf1
  expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P1 });
  return game;
}

describe("Ruling 1360aa2e9e677d52 — Deflect stops applying to you once you control the unit", () => {
  test("baseline: while the Poro is P2's, P1's Hostile Takeover DOES pay Deflect — 5 energy + 2 rainbow + 1 extra rainbow", async () => {
    const game = await board().build();
    expect(game.state("poro")).toMatchObject({ controller: P2, keywords: expect.arrayContaining(["Deflect"]) });
    await game.p1.cast("ht", { targets: "poro" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ht", targets: ["poro"] })]);
  });

  test("after Hostile Takeover resolves the Poro is CONTROLLED by P1 (owner P2), readied, and P1 took bf1", async () => {
    const game = await takenOver();
    expect(game.state("poro")).toMatchObject({ controller: P1, owner: P2, isReady: true, location: "bf1" });
    expect(game.state("poro").keywords).toContain("Deflect"); // it still HAS Deflect …
    expect(game.p1.units("bf1")).toContain("poro"); // … but it is P1's friendly unit now
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("P1's own Deathgrip may now choose the Poro as 'a friendly unit' for its printed 2 energy with ZERO power left — no Deflect surcharge (809.1.c, 740.1)", async () => {
    const game = await takenOver();
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 0 } });
    expect(game.p1.can("cast", "dg")).toBe(true);
    const field = game.p1.option("cast", "dg")?.fields.find((f) => f.name === "targets");
    expect((field?.options ?? []).flat()).toContain("poro");
    await game.p1.cast("dg", { targets: "poro" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dg", controller: P1, targets: ["poro"] })]);
  });

  test("Deathgrip resolves normally: the Poro dies (to its OWNER P2's trash), Buddy gets +2 this turn, P1 draws 1", async () => {
    const game = await takenOver();
    const hand = game.p1.hand().length;
    await game.p1.cast("dg", { targets: "poro" });
    await game.settle();
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick("buddy"); // "another friendly unit" — Buddy is the only one
      await game.settle();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.p2.trash()).toContain("poro");
    expect(game.p1.trash()).not.toContain("poro");
    expect(game.state("buddy").might).toBe(4);
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1);
    expect(game.zoneOf("dg")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
