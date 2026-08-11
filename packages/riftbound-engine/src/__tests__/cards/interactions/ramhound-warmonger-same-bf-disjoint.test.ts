/**
 * Interaction: Trusty Ramhound (sfd-159-221) "While you have another unit here, I have +1 [Might]."
 *           × Ancient Warmonger (sfd-131-221) "I have [Assault] equal to the number of enemy units here."
 *
 * Two P1 passives reading the SAME battlefield's population through OPPOSITE qualifiers.
 * Ramhound wants a unit that is (friendly) AND (here) AND (not me); Warmonger counts units
 * that are (enemy) AND (here). The two scopes are disjoint, so every board mutation must move
 * exactly ONE of the two numbers.
 *
 * Rules:
 *  - 053.1  — a unit's "I/me" is itself, so "another unit" excludes the Ramhound itself.
 *  - 053.3  — "here" is a location reference (the published Captain Farron ruling reads a unit's
 *             "here" as that unit's own current location), so a friendly unit elsewhere is out.
 *  - 740.1.a/740.1.b — friendly = shares a controller; enemies = controlled by an opponent. "You
 *             have another unit" needs a unit P1 CONTROLS; "enemy units" can never include P1's own.
 *  - 477.2.b — "I have +1 [Might]" / "I have [Assault] …" are passive (have/has) effects applied in
 *             their layer, continuously re-read.
 *  - 477.3.b — snapshotting is confined to arithmetic effects from a NON-passive source; a passive
 *             recounts immediately, with no trigger and no chain item.
 *  - 807.1.b.3/807.1.c/807.2 — a bare [Assault] is Assault 1; Assault X is "while I am an attacker,
 *             I have +X [Might]"; instances sum. Assault pays out ONLY while attacking.
 *
 * Q: (a) does an enemy unit here / a friendly unit elsewhere / the Ramhound itself switch the
 *    Ramhound on?  (b) with the Warmonger here, what are the two numbers?  (c)/(d) which number
 *    moves when an enemy arrives, and which when a friend does?  (e) is "enemy units here" an
 *    unconditional +Might?
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RAMHOUND = "sfd-159-221"; // Unit · Order · 2 energy · 2 Might
const WARMONGER = "sfd-131-221"; // Unit · Chaos · 5 energy · 4 Might

/** The live Assault value the Warmonger's own passive is granting itself right now. */
function assaultOf(game: Game, alias: string): number | undefined {
  return game.state(alias).grantedKeywords.find((k) => k.keyword === "Assault")?.value;
}

/**
 * P1's turn. bf1 (P1's) holds the Ramhound and ONE enemy unit. P1 also has the Warmonger and a
 * Garrison in base and a Scout at bf2; P2 also has a Ganking unit at bf2. Nothing here is
 * Contested, so the board sits still until somebody moves.
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", RAMHOUND, "ram")
    .unit(P2, "bf1", { might: 2, name: "Foe A" }, "foeA")
    .unit(P1, "base", WARMONGER, "war")
    .unit(P1, "base", { might: 2, name: "Garrison" }, "garrison")
    .unit(P1, "bf2", { might: 2, name: "Scout" }, "scout")
    .unit(P2, "bf2", { keywords: ["Ganking"], might: 2, name: "Foe B" }, "foeB");
}

describe("Trusty Ramhound × Ancient Warmonger — same battlefield, disjoint qualifiers", () => {
  test("(a) no bonus: an ENEMY unit here, a FRIENDLY unit elsewhere and the Ramhound ITSELF are all near-misses", async () => {
    const game = await board().build();
    // Foe A is here but not P1's (740.1.b); Garrison and Scout are P1's but not here (053.3);
    // the Ramhound is here and P1's but is not "another" unit (053.1).
    expect(game.locationOf("foeA")).toBe("bf1");
    expect(game.locationOf("garrison")).toBe("base");
    expect(game.locationOf("scout")).toBe("bf2");
    expect(game.state("ram")).toMatchObject({ baseMight: 2, might: 2 });

    // Positive control: the SAME board with one friendly body added at bf1 does light it up.
    const withAlly = await board().unit(P1, "bf1", { might: 1, name: "Ally" }, "ally").build();
    expect(withAlly.state("ram").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });

  test("(a) the Warmonger sitting in base has Assault 0 — 'enemy units here' is read at ITS location, not board-wide", async () => {
    const game = await board().build();
    expect(game.locationOf("war")).toBe("base");
    expect(game.state("war").keywords).toContain("Assault"); // it always HAS the keyword …
    expect(assaultOf(game, "war")).toBe(0); // … at value 0: no enemy unit shares its location
    expect(game.state("war").might).toBe(4);
  });

  test("(b) Warmonger moves base → bf1: Ramhound becomes 3, Warmonger's Assault is 1 (not 2, not 3)", async () => {
    const game = await board().build();
    await game.p1.move("war", "bf1");
    expect(game.locationOf("war")).toBe("bf1");
    // Ramhound: the Warmonger is another unit P1 controls, here → +1.
    expect(game.state("ram").might).toBe(3);
    // Warmonger: only Foe A counts. Not itself (a unit is not its own enemy, 740.1.b), not the
    // Ramhound (friendly, 740.1.a), not Foe B at bf2 (not "here", 053.3).
    expect(assaultOf(game, "war")).toBe(1);
    // and the count is not leaked onto anybody else
    expect(game.state("ram").grantedKeywords.some((k) => k.keyword === "Assault")).toBe(false);
    expect(game.state("foeA").grantedKeywords).toEqual([]);
  });

  test("(c) an ENEMY arrival moves only the Warmonger's number: Assault 1 → 2, Ramhound stays 3", async () => {
    const game = await board().build();
    await game.p1.move("war", "bf1");
    expect(game.state("ram").might).toBe(3);
    expect(assaultOf(game, "war")).toBe(1);

    await game.advanceTurn(); // P2's turn — its Ganking unit can cross battlefield to battlefield
    await game.p2.gank("foeB", "bf1");
    expect(game.locationOf("foeB")).toBe("bf1");

    // 477.2.b/477.3.b — the passive re-reads its condition immediately on arrival.
    expect(assaultOf(game, "war")).toBe(2);
    expect(game.state("ram").might).toBe(3); // untouched: an enemy body is invisible to "you have another unit"
    expect(game.chain()).toEqual([]); // no trigger, no chain item — this is a passive recount
    // Assault is attacker-only (807.1.c): as the DEFENDER of P2's attack it is still a plain 4.
    expect(game.state("war").combatRole).toBe("defender");
    expect(game.state("war").might).toBe(4);
  });

  test("(d) a FRIENDLY arrival moves neither: Ramhound is already satisfied (boolean, not a count) and Assault ignores friends", async () => {
    const game = await board().build();
    await game.p1.move("war", "bf1");
    await game.p1.move("garrison", "bf1");
    expect(game.locationOf("garrison")).toBe("bf1");
    expect(game.state("ram").might).toBe(3); // "another unit", not "each other unit"
    expect(assaultOf(game, "war")).toBe(1); // 740.1.a — a friendly arrival is not an enemy unit
    expect(game.violations()).toEqual([]);
  });

  test("(e) three enemy units here is NOT an unconditional +3: at rest the Warmonger is 4 Might with Assault 3", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", WARMONGER, "war")
      .unit(P1, "bf1", RAMHOUND, "ram")
      .unit(P2, "bf1", { might: 1, name: "E1" }, "e1")
      .unit(P2, "bf1", { might: 1, name: "E2" }, "e2")
      .unit(P2, "bf1", { might: 1, name: "E3" }, "e3")
      .build();
    expect(assaultOf(game, "war")).toBe(3);
    expect(game.state("war").combatRole).toBeNull();
    expect(game.state("war").might).toBe(4); // 807.1.c — no attacker designation, no Might
    expect(game.state("ram").might).toBe(3); // the Warmonger is the one friendly body it needs
  });

  test("(e) while ATTACKING three enemy units the same Assault 3 is worth +3: a 7-Might attacker (807.1.c / 807.2)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", WARMONGER, "war")
      .unit(P2, "bf1", { might: 1, name: "E1" }, "e1")
      .unit(P2, "bf1", { might: 1, name: "E2" }, "e2")
      .unit(P2, "bf1", { might: 1, name: "E3" }, "e3")
      .build();
    expect(game.state("war").might).toBe(4); // in base: Assault 0
    await game.p1.move("war", "bf1");
    expect(game.state("war").combatRole).toBe("attacker");
    expect(assaultOf(game, "war")).toBe(3);
    expect(game.state("war").might).toBe(7);
  });
});
