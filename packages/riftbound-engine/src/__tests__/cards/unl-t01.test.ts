/**
 * Baron Pit — unl-t01 · Battlefield TOKEN (created by Baron Nashor, unl-147-219)
 *
 *   (You can't start the game with a token battlefield.)
 *   Units can move here from anywhere.
 *
 * Rules: 187.9 (the Baron Pit token: a domainless battlefield token with "Units can move here from
 * anywhere"), 144.4 (a Standard Move is base→battlefield or battlefield→base; battlefield→battlefield only
 * with Ganking, 810) — the Pit's text is a property of the DESTINATION that opens the battlefield→Pit leg to
 * every unit, and nothing else: 144.2 (the move still exhausts the unit as its cost — an exhausted unit
 * cannot Standard-Move at all), 144.3 (several units, different origins, one destination), 144.4.a.1 /
 * 447.2 (in 3+ player games a battlefield holding units of two OTHER players is never a destination — the
 * Pit does not lift that), 190.3.a / 344 (arriving where the enemy is starts a combat as usual), 185.2.d
 * (a token battlefield is a battlefield: it is held and conquered for points like any other).
 *
 * Head-judge corner cases covered here:
 *   1. ONE WAY: "move HERE from anywhere" — a non-Ganking unit in the Pit may only walk to base; a
 *      Ganking unit in the Pit may still go anywhere (810 is additive).
 *   2. Symmetric text: the OPPONENT's units may also come from their battlefield straight into the Pit
 *      (and that starts a fight with whoever camps there).
 *   3. Mixed-origin group move: a base unit and a battlefield unit travel to the Pit together (144.3.b).
 *   4. Exhausted units are never offered; the arriving units are exhausted by the move.
 *   5. 3-player game: with P2 and P3 both in the Pit, P1 cannot move there even "from anywhere".
 *   6. Integration: the Pit that Baron Nashor creates mid-game behaves identically (registry-driven).
 *   7. The deck-building clause is not an in-game effect: the token carries exactly one static ability.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, P3, scenario } from "../../harness";
import type { Game } from "../../harness";
import { getGlobalCardRegistry } from "../../operations/card-lookup";

const CARD = "unl-t01";
const BARON = "unl-147-219"; // 10 + [chaos]x3 · 12 might · "As you play me, add the Baron Pit … I enter there."

/** Units P1 may send to `dest` with a Standard Move right now (flattened unit ids). */
function moversTo(game: Game, dest: string, seat: "p1" | "p2" = "p1"): string[] {
  const opt = game[seat].option(`standardMove:to:${dest}`);
  return [...new Set((opt?.fields.find((f) => f.name === "unitIds")?.options ?? []).flat() as string[])].sort();
}

/** Pit (uncontrolled, live text) + two ordinary battlefields. */
function board() {
  return scenario()
    .battlefield("pit", { controller: null, def: CARD, inert: false })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 });
}

describe("Baron Pit (unl-t01)", () => {
  test("registry payload: a battlefield whose only ability is the static 'move here from anywhere' marker (the token clause is deck-building only)", async () => {
    await board().build();
    expect(getGlobalCardRegistry().get("pit")).toMatchObject({ cardType: "battlefield", name: "Baron Pit" });
    expect(getGlobalCardRegistry().getAbilities("pit")).toEqual([
      { effect: { keyword: "AcceptsMoveFromAnywhere", target: "self", type: "grant-keyword" }, type: "static" },
    ] as never);
  });

  test("'from anywhere': a ready NON-Ganking unit at bf1 is offered a Standard Move straight to the Pit — but still not bf1 → bf2 (144.4)", async () => {
    const game = await board().unit(P1, "bf1", { might: 2, name: "Scout" }, "scout").build();
    expect(game.state("scout").keywords).not.toContain("Ganking");
    expect(moversTo(game, "pit")).toEqual(["scout"]);
    expect(moversTo(game, "bf2")).toEqual([]);
    expect(game.p1.can("gank", "scout")).toBe(false);
    await game.p1.move("scout", "pit");
    expect(game.zoneOf("scout")).toBe("battlefield-pit");
    expect(game.state("scout").isExhausted).toBe(true); // 144.2: the move's cost is unchanged
    await game.settle(); // hands back the cleanup showdown at the empty Pit once
    await game.settle();
    expect(game.gameState.battlefields.pit?.controller).toBe(P1); // conquered like any battlefield
    expect(game.p1.points()).toBe(1);
  });

  test("ONE WAY only: a non-Ganking unit standing IN the Pit may go home to base and nowhere else; a forced bf→bf attempt is rejected", async () => {
    const game = await board().unit(P1, "pit", { might: 2, name: "Camper" }, "camper").build();
    const keys = game.p1.legal().filter((o) => o.verb === "move" || o.verb === "gank").map((o) => o.key);
    expect(keys).toEqual(["standardMove:to:base"]);
    const r = await game.p1.try((p) => p.move("camper", "bf1"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("camper")).toBe("battlefield-pit");
  });

  test("Ganking is additive (810.1.c.1): a Ganking unit in the Pit can still move on to bf1", async () => {
    const game = await board().unit(P1, "pit", { keywords: ["Ganking"], might: 2, name: "Rider" }, "rider").build();
    expect(moversTo(game, "bf1")).toEqual(["rider"]);
    await game.p1.move("rider", "bf1");
    expect(game.zoneOf("rider")).toBe("battlefield-bf1");
  });

  test("exhausted units are never movers (144.2): an exhausted unit at bf1 is not offered the Pit; its ready neighbour is", async () => {
    const game = await board()
      .unit(P1, "bf1", { might: 2, name: "Tired" }, "tired", { exhausted: true })
      .unit(P1, "bf1", { might: 2, name: "Fresh" }, "fresh")
      .build();
    expect(moversTo(game, "pit")).toEqual(["fresh"]);
    const r = await game.p1.try((p) => p.move("tired", "pit"));
    expect(r.ok).toBe(false);
  });

  test("mixed origins, one destination (144.3.b): Home (base) and Scout (bf1) move to the Pit TOGETHER in one Standard Move; both arrive exhausted", async () => {
    const game = await board().unit(P1, "base", { might: 2, name: "Home" }, "home").unit(P1, "bf1", { might: 2, name: "Scout" }, "scout").build();
    expect(moversTo(game, "pit")).toEqual(["home", "scout"]);
    await game.p1.move(["home", "scout"], "pit");
    expect(game.cardsAt("pit").sort()).toEqual(["home", "scout"]);
    expect(game.state("home").isExhausted).toBe(true);
    expect(game.state("scout").isExhausted).toBe(true);
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p1.units("base")).toEqual([]);
  });

  test("symmetric + combat: on P2's turn THEIR Raider (3) walks from bf2 straight into the Pit where P1's Camper (2) sits — a real combat: Camper dies, P2 conquers the Pit", async () => {
    const game = await board()
      .active(P2)
      .unit(P1, "pit", { might: 2, name: "Camper" }, "camper")
      .unit(P2, "bf2", { might: 3, name: "Raider" }, "raider")
      .build();
    expect(moversTo(game, "pit", "p2")).toEqual(["raider"]);
    await game.p2.move("raider", "pit");
    expect(game.decision()).toMatchObject({ context: "showdown", seat: P2 }); // attacker has Focus
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.state("camper").combatRole).toBe("defender");
    await game.settle();
    expect(game.zoneOf("camper")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("battlefield-pit");
    expect(game.gameState.battlefields.pit?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });

  test("negative space: an ordinary (inert) battlefield next to the Pit gets no such permission — bf1's unit cannot reach bf2, and bf2's text-less card grants nothing", async () => {
    const game = await board().unit(P1, "bf1", { might: 2, name: "Scout" }, "scout").unit(P1, "bf2", { might: 2, name: "Far" }, "far").build();
    expect(moversTo(game, "bf2")).toEqual([]);
    expect(moversTo(game, "bf1")).toEqual([]);
    expect(moversTo(game, "pit")).toEqual(["far", "scout"]);
  });

  test("3-player game (144.4.a.1 / 447.2): with units of BOTH other players already in the Pit, P1's units are not offered the Pit at all — 'from anywhere' does not lift the two-other-players cap", async () => {
    const game = await scenario({ players: 3 })
      .battlefield("pit", { controller: null, def: CARD, inert: false })
      .battlefield("bf1", { controller: P1 })
      .unit(P2, "pit", { might: 2, name: "Two" }, "two")
      .unit(P3, "pit", { might: 2, name: "Three" }, "three")
      .unit(P1, "bf1", { might: 5, name: "Scout" }, "scout")
      .unit(P1, "base", { might: 5, name: "Home" }, "home")
      .build();
    expect(game.p1.option("standardMove:to:pit")).toBeUndefined();
    expect((await game.p1.try((p) => p.move("scout", "pit"))).ok).toBe(false);
    expect((await game.p1.try((p) => p.move("home", "pit"))).ok).toBe(false);
    // control: with only ONE other player there the Pit is open from bf1 as usual
    const open = await scenario({ players: 3 })
      .battlefield("pit", { controller: null, def: CARD, inert: false })
      .battlefield("bf1", { controller: P1 })
      .unit(P2, "pit", { might: 2, name: "Two" }, "two")
      .unit(P1, "bf1", { might: 5, name: "Scout" }, "scout")
      .build();
    expect(moversTo(open, "pit")).toEqual(["scout"]);
  });

  test("integration: the Pit Baron Nashor creates mid-game is the same token — right after he resolves, a non-Ganking unit at bf1 may move to the new battlefield (and Baron himself, exhausted there, may not leave)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 10, power: { chaos: 3 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 2, name: "Scout" }, "scout")
      .hand(P1, BARON, "baron")
      .build();
    await game.p1.play("baron", { to: "base" });
    await game.settle();
    await game.settle();
    const pit = game.battlefields().find((b) => b !== "bf1" && b !== "bf2");
    expect(pit).toBeDefined();
    expect(game.findAll({ defId: CARD, zone: "battlefieldRow" })).toEqual([pit as string]);
    expect(game.locationOf("baron")).toBe(pit);
    expect(moversTo(game, pit as string)).toEqual(["scout"]); // baron is exhausted: not a mover
    expect(moversTo(game, "bf2")).toEqual([]);
    await game.p1.move("scout", pit as string);
    expect(game.locationOf("scout")).toBe(pit);
    expect(game.violations()).toEqual([]);
  });
});
