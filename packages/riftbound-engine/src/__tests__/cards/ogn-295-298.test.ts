/**
 * Vilemaw's Lair — ogn-295-298 · Battlefield · no domain · no cost
 *
 *   Units can't move from here to base.
 *
 * Rules: 144.4.b (the Standard Move: base → battlefield or battlefield → base; 144.3 Ganking adds
 * battlefield → battlefield), 446.1 / 449 (a Move is ANY board relocation, whether the Standard Move
 * or one caused by a spell/ability — "can't move" binds both), 446.2 (changing ZONES — return to
 * hand, kill — is not a Move), 455 / 456.3 (a Recall is not a Move and "cannot be prevented by
 * effects that restrict or block Movement"), 466.1.a.2 (combat cleanup step 3d RECALLS surviving
 * attackers when defenders remain), 423.1.b (a stunned unit deals no combat damage), 054 ("can't"
 * beats "can").
 *
 * Head-judge notes — the tricky situations for THIS card:
 *  1. Scope is ORIGIN = here, DESTINATION = base only: a Ganking unit may still leave the Lair for
 *     another battlefield; units elsewhere go home freely; anyone may still move INTO the Lair.
 *  2. It binds effect-moves too: Isolate ("Move an enemy unit from a battlefield to its base") does
 *     not get a unit out of the Lair.
 *  3. It does NOT bind Recalls: an attacker that survives a combat here alongside a surviving
 *     defender is recalled home as usual (456.3) — the Lair is not a prison for failed attackers.
 *  4. It does NOT bind zone changes: Rebuke (return to hand) works on a unit in the Lair (446.2).
 *  5. Symmetric and controller-independent: both players' units are stuck, whoever controls it.
 *  6. The restriction is positional and continuous: once a unit has left the Lair (by Ganking) it
 *     can walk home from its new battlefield on a later turn.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ogn-295-298";
const ISOLATE = "unl-124-219"; // Spell · 2 · Move an enemy unit from a battlefield to its base. Then, if … draw 1.
const REBUKE = "ogn-172-298"; // Spell [Action] · 2 + chaos chaos · Return a unit at a battlefield to its owner's hand.

const moveKeys = (game: Game, seat: "p1" | "p2") =>
  game[seat]
    .legal()
    .filter((o) => o.verb === "move" || o.verb === "gank")
    .map((o) => o.key)
    .sort();

/** P1's turn; the Lair (P1-controlled) holds a READY P1 unit; bf2 is a plain open battlefield. */
function board(camper: { keywords?: string[] } = {}) {
  return scenario()
    .battlefield("lair", { controller: P1, def: CARD, inert: false, owner: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "lair", { might: 3, name: "Camper", ...camper }, "camper");
}

describe("Vilemaw's Lair (ogn-295-298)", () => {
  test("registry payload: one static ability granting the NoMoveToBase marker to units HERE", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Vilemaw's Lair" });
    expect(def?.abilities).toEqual([
      {
        effect: { duration: "permanent", keyword: "NoMoveToBase", target: { location: "here", type: "unit" }, type: "grant-keyword" },
        type: "static",
      },
    ]);
  });

  test("a ready unit here has NO Standard Move to base (nothing offered, the attempt is illegal) — control: the same unit on an inert copy walks home", async () => {
    const game = await board().build();
    expect(game.state("camper").isReady).toBe(true);
    expect(moveKeys(game, "p1")).toEqual([]);
    const t = await game.p1.try((p) => p.move("camper", "base"));
    expect(t.ok).toBe(false);
    expect(game.locationOf("camper")).toBe("lair");

    const inert = await scenario().battlefield("lair", { controller: P1, def: CARD, inert: true }).unit(P1, "lair", { might: 3 }, "camper").build();
    expect(moveKeys(inert, "p1")).toEqual(["standardMove:to:base"]);
    await inert.p1.move("camper", "base");
    expect(inert.locationOf("camper")).toBe("base");
  });

  test("'from HERE': while the Lair is in play a unit at ANOTHER battlefield still moves to base normally", async () => {
    const game = await board().unit(P1, "bf2", { might: 2, name: "Rover" }, "rover").build();
    expect(moveKeys(game, "p1")).toEqual(["standardMove:to:base"]);
    await game.p1.move("rover", "base");
    expect(game.locationOf("rover")).toBe("base");
    expect(game.state("rover").isExhausted).toBe(true);
    // …and that option was only ever about the rover: the camper still cannot follow.
    expect((await game.p1.try((p) => p.move("camper", "base"))).ok).toBe(false);
  });

  test("'to BASE': a Ganking unit here may still move battlefield → battlefield (only the base leg is closed)", async () => {
    const game = await board({ keywords: ["Ganking"] }).build();
    const keys = moveKeys(game, "p1");
    expect(keys).not.toContain("standardMove:to:base");
    expect(keys).toContain("gankingMove:camper");
    await game.p1.gank("camper", "bf2");
    await game.settle();
    await game.settle();
    expect(game.locationOf("camper")).toBe("bf2");
  });

  test("moving INTO the Lair is unrestricted: a base unit takes the Standard Move to the Lair and arrives (exhausted)", async () => {
    const game = await scenario()
      .battlefield("lair", { controller: null, def: CARD, inert: false })
      .unit(P1, "base", { might: 2, name: "Walker" }, "walker")
      .build();
    await game.p1.move("walker", "lair");
    await game.settle();
    await game.settle();
    expect(game.locationOf("walker")).toBe("lair");
    expect(game.gameState.battlefields.lair?.controller).toBe(P1);
    // …and now it is stuck there.
    expect(game.state("walker").keywords).toContain("NoMoveToBase");
  });

  test("symmetric: the OPPONENT's ready unit in a Lair P1 owns/controls cannot go home on the opponent's turn either", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("lair", { controller: P2, def: CARD, inert: false, owner: P1 })
      .unit(P2, "lair", { might: 3, name: "Squatter" }, "squatter")
      .unit(P2, "base", { might: 1, name: "Homebody" }, "homebody")
      .build();
    expect(moveKeys(game, "p2")).toEqual(["standardMove:to:lair"]); // only the homebody's move in
    expect((await game.p2.try((p) => p.move("squatter", "base"))).ok).toBe(false);
    expect(game.locationOf("squatter")).toBe("lair");
  });

  test("binds effect-moves (449): Isolate cast at the enemy unit in the Lair leaves it exactly where it is", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .battlefield("lair", { controller: P2, def: CARD, inert: false, owner: P1 })
      .unit(P2, "lair", { might: 3, name: "Squatter" }, "squatter")
      .hand(P1, ISOLATE, "isolate")
      .build();
    const castable = game.p1.can("cast", "isolate");
    if (castable) {
      // Either the Lair unit is not a legal object at all, or the move instruction does nothing.
      const r = await game.p1.try((p) => p.cast("isolate", { targets: "squatter" }));
      if (r.ok) {
        await game.settle();
      }
    }
    expect(game.locationOf("squatter")).toBe("lair");
    expect(game.p2.base()).not.toContain("squatter");
  });

  test("control for the above: the same Isolate on an enemy unit at a PLAIN battlefield sends it to its base", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .battlefield("plain", { controller: P2 })
      .unit(P2, "plain", { might: 3, name: "Squatter" }, "squatter")
      .hand(P1, ISOLATE, "isolate")
      .build();
    await game.p1.cast("isolate", { targets: "squatter" });
    await game.settle();
    expect(game.locationOf("squatter")).toBe("base");
  });

  test("does NOT bind Recalls (456.3 / 466.1.a.2): a 2-Might attacker into a STUNNED 5-Might defender here — nobody dies, the attacker is recalled home to base", async () => {
    const game = await scenario()
      .battlefield("lair", { controller: P2, def: CARD, inert: false, owner: P2 })
      .unit(P2, "lair", { might: 5, name: "Dazed Guard" }, "guard", { stunned: true })
      .unit(P1, "base", { might: 2, name: "Raider" }, "raider")
      .build();
    await game.p1.move("raider", "lair");
    await game.settle();
    expect(game.state("guard")).toMatchObject({ zone: "battlefield-lair" });
    expect(game.zoneOf("raider")).toBe("base"); // recalled, alive
    expect(game.locationOf("raider")).toBe("base");
    expect(game.gameState.battlefields.lair?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test("does NOT bind zone changes (446.2): Rebuke returns a unit in the Lair to its owner's hand", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 2 } })
      .battlefield("lair", { controller: P2, def: CARD, inert: false, owner: P1 })
      .unit(P2, "lair", { might: 3, name: "Squatter" }, "squatter")
      .hand(P1, REBUKE, "rebuke")
      .build();
    await game.p1.cast("rebuke", { targets: "squatter" });
    await game.settle();
    expect(game.zoneOf("squatter")).toBe("hand");
    expect(game.p2.hand()).toContain("squatter");
  });

  test("positional and continuous: after Ganking OUT of the Lair the marker is gone, and two turns later the unit walks home from bf2", async () => {
    const game = await board({ keywords: ["Ganking"] }).build();
    expect(game.state("camper").keywords).toContain("NoMoveToBase");
    await game.p1.gank("camper", "bf2");
    await game.settle();
    await game.settle();
    expect(game.locationOf("camper")).toBe("bf2");
    expect(game.state("camper").keywords).not.toContain("NoMoveToBase");
    await game.advanceTurn(); // P2
    await game.advanceTurn(); // P1 again — camper readied
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("camper").isReady).toBe(true);
    await game.p1.move("camper", "base");
    expect(game.locationOf("camper")).toBe("base");
  });

  test("holding/scoring is unaffected: the stuck unit still holds the Lair for a point at the start of its controller's turn", async () => {
    const game = await board().turn(2).active(P2).build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.locationOf("camper")).toBe("lair");
    expect(moveKeys(game, "p1")).toEqual([]); // ready again after Awaken, still no way home
  });
});
