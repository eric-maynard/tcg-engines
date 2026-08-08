/**
 * Rockfall Path — sfd-216-221 · Battlefield · no domain · no cost
 *
 *   Units can't be played here.
 *
 * Rules: 054 ("Can't beats Can"), 355.2.a/b (valid play locations: base or a battlefield you
 * control, plus any an effect makes valid — a prohibition still wins), 359.3.e.6 (an instruction that
 * can't be followed is ignored — "play a token HERE" at Rockfall makes nothing), 811.1.c.1 (Hide is
 * not Play — hiding a unit here is fine), 811.1.d.1 (a hidden permanent must be PLAYED to its
 * battlefield — impossible here, so a unit cannot come out of hiding at Rockfall), 108 (moving is not
 * playing).
 *
 * Head-judge notes — the tricky situations for THIS card:
 *  1. The controller's own hand plays: Rockfall is never a legal "to", base and other controlled
 *     battlefields still are; forcing to="rock" is rejected and nothing is spent.
 *  2. Permission vs prohibition: Sai Scout's "may play me to an open battlefield" does not unlock an
 *     open Rockfall (054).
 *  3. Effects that play tokens "here": Noxian Drummer marching onto Rockfall gets no Recruit.
 *  4. Hidden: you may HIDE a [Hidden] unit at Rockfall, but you can never play it from there; a
 *     hidden SPELL at Rockfall plays normally.
 *  5. Negative space: units MOVE onto Rockfall freely, fight there, conquer and hold it as usual;
 *     the restriction binds the opponent too when they control it; champions from the champion
 *     zone get base only.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-216-221";
const SKULKER = "ogn-175-298"; // Shipyard Skulker · Chaos · 3 energy · vanilla 3-Might unit
const SAI_SCOUT = "ogn-174-298"; // 6 · 5 Might · [Vision] · You may play me to an open battlefield.
const NOXIAN_DRUMMER = "ogn-222-298"; // When I move to a battlefield, play a 1-Might Recruit unit token here.
const PAKAA_CUB = "ogn-135-298"; // Unit · Body · [Hidden] (vanilla otherwise)
const BLOCK = "ogn-057-298"; // Spell · Calm · [Hidden] [Action] Give a unit [Shield 3] and [Tank] this turn.
const FIORA_WORTHY = "sfd-180-221"; // Champion unit · Order · 3

type Built = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;
const playTo = (game: Built, seat: "p1" | "p2", card: string) => game[seat].option("play", card)?.fields.find((f) => f.arg === "to")?.options ?? [];

/** P1 controls Rockfall (a keeper stands there) and a plain battlefield; plenty of resources. */
function board() {
  return scenario()
    .resources(P1, { energy: 10, power: { body: 3, chaos: 3, order: 3 } })
    .battlefield("rock", { controller: P1, def: CARD, inert: false, owner: P1 })
    .unit(P1, "rock", { might: 2, name: "Keeper" }, "keeper")
    .battlefield("plain", { controller: P1 })
    .unit(P1, "plain", { might: 2, name: "Keeper Two" }, "keeper2");
}

describe("Rockfall Path (sfd-216-221)", () => {
  test("registry payload: a battlefield whose only ability is the static self-keyword 'NoUnitsPlayedHere'", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Rockfall Path", rulesText: "Units can't be played here." });
    expect(def?.abilities).toEqual([{ effect: { keyword: "NoUnitsPlayedHere", target: "self", type: "grant-keyword" }, type: "static" }]);
  });

  test("a unit in the controller's hand is offered base and the OTHER controlled battlefield — never Rockfall (355.2.a + 054)", async () => {
    const game = await board().hand(P1, SKULKER, "sk").build();
    expect(playTo(game, "p1", "sk")).toEqual(["base", "battlefield-plain"]);
    await game.p1.play("sk", { to: "plain" });
    expect(game.zoneOf("sk")).toBe("battlefield-plain");
  });

  test("forcing to='rock' is rejected: the card stays in hand and no energy is spent", async () => {
    const game = await board().hand(P1, SKULKER, "sk").build();
    const before = game.p1.resources();
    const r = await game.p1.try((p) => p.play("sk", { to: "rock" }));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.code).toBe("ILLEGAL_ARGS");
    expect(game.zoneOf("sk")).toBe("hand");
    expect(game.p1.resources()).toEqual(before);
    expect(game.p1.units("rock")).toEqual(["keeper"]);
  });

  test("Can't beats Can (054): Sai Scout may go to an open battlefield, but an open (empty, uncontrolled) Rockfall is not offered while a plain open one is", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6 })
      .battlefield("rock", { controller: null, def: CARD, inert: false, owner: P2 })
      .battlefield("open", { controller: null })
      .hand(P1, SAI_SCOUT, "sai")
      .build();
    expect(playTo(game, "p1", "sai")).toEqual(["base", "battlefield-open"]);
    expect((await game.p1.try((p) => p.play("sai", { to: "rock" }))).ok).toBe(false);
    expect(game.zoneOf("sai")).toBe("hand");
  });

  test("negative space — MOVING is not playing: a unit walks onto an empty Rockfall, conquers it and scores", async () => {
    const game = await scenario()
      .battlefield("rock", { controller: null, def: CARD, inert: false, owner: P2 })
      .unit(P1, "base", { might: 3, name: "Walker" }, "walker")
      .build();
    await game.p1.move("walker", "rock");
    await game.settle();
    expect(game.zoneOf("walker")).toBe("battlefield-rock");
    expect(game.gameState.battlefields.rock?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("negative space — combat at Rockfall works normally: a 4-Might attacker kills the 2-Might keeper and takes it", async () => {
    const game = await board().active(P2).unit(P2, "base", { might: 4, name: "Raider" }, "raider").build();
    await game.p2.move("raider", "rock");
    await game.settle();
    expect(game.zoneOf("keeper")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("battlefield-rock");
    expect(game.gameState.battlefields.rock?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });

  test("symmetry: when P2 controls Rockfall, P2's hand unit is offered base only", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 10 })
      .battlefield("rock", { controller: P2, def: CARD, inert: false, owner: P1 })
      .unit(P2, "rock", { might: 2 }, "squatter")
      .hand(P2, SKULKER, "sk")
      .build();
    expect(playTo(game, "p2", "sk")).toEqual(["base"]);
  });

  test("champion zone: with Rockfall as P1's only battlefield, the champion can be played to base only", async () => {
    const game = await scenario()
      .resources(P1, { energy: 9, power: { order: 3 } })
      .battlefield("rock", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "rock", { might: 2 }, "keeper")
      .champion(P1, FIORA_WORTHY, "fiora")
      .build();
    expect(game.p1.can("playChampion")).toBe(true);
    expect(game.p1.option("playChampion")?.fields.find((f) => f.arg === "to")?.options).toEqual(["base"]);
    expect((await game.p1.try((p) => p.playChampion("rock"))).ok).toBe(false);
    await game.p1.playChampion("base");
    expect(game.zoneOf("fiora")).toBe("base");
  });

  test.failing("BUG: 'play a Recruit token HERE' at Rockfall must be ignored (054, 359.3.e.6) — Noxian Drummer marching onto Rockfall still gets its Recruit there", async () => {
    // Expected: Drummer arrives, its trigger resolves, no token exists anywhere (not at Rockfall, not in base).
    // Actual: a Recruit token is created at battlefield-rock.
    const game = await scenario()
      .battlefield("rock", { controller: null, def: CARD, inert: false, owner: P2 })
      .unit(P1, "base", NOXIAN_DRUMMER, "drum")
      .build();
    await game.p1.move("drum", "rock");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "drum", triggered: true })]);
    await game.settle();
    expect(game.p1.units("rock")).toEqual(["drum"]);
    expect(game.p1.base()).toEqual([]);
    expect(game.gameState.battlefields.rock?.controller).toBe(P1);
  });

  test("Hide is not Play (811.1.c.1): a [Hidden] unit CAN be hidden facedown at a Rockfall you control", async () => {
    const game = await board().resources(P1, { energy: 0, power: { rainbow: 1 } }).hand(P1, PAKAA_CUB, "cub").build();
    expect(game.p1.can("hide", "cub")).toBe(true);
    await game.p1.hide("cub", "rock");
    expect(game.zoneOf("cub")).toBe("facedown-rock");
    expect(game.chain()).toEqual([]); // 811.1.c.2 — hiding opens no chain
  });

  test.failing("BUG: a hidden UNIT at Rockfall can never be played from facedown (811.1.d.1 + 054) — the engine offers 'reveal' and plays it onto Rockfall", async () => {
    // Expected: no reveal/play option for the facedown Pakaa Cub at Rockfall; it stays facedown.
    // Actual: `reveal` is legal and the Cub lands in battlefield-rock.
    const game = await board().turn(3).facedown(P1, "rock", PAKAA_CUB, "cub").build();
    expect(game.p1.can("reveal", "cub")).toBe(false);
    const r = await game.p1.try((p) => p.reveal("cub"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("cub")).toBe("facedown-rock");
    expect(game.p1.units("rock")).toEqual(["keeper"]);
  });

  test("control: the same hidden unit at the PLAIN battlefield is revealed and played there for free", async () => {
    const game = await board().turn(3).resources(P1, { energy: 0 }).facedown(P1, "plain", PAKAA_CUB, "cub").build();
    expect(game.p1.can("reveal", "cub")).toBe(true);
    await game.p1.reveal("cub");
    await game.settle();
    expect(game.zoneOf("cub")).toBe("battlefield-plain");
    expect(game.p1.energy()).toBe(0);
  });

  test("a hidden SPELL at Rockfall is unaffected: Block comes out of hiding for free and gives the keeper Shield 3 + Tank this turn", async () => {
    const game = await board().turn(3).resources(P1, { energy: 0 }).facedown(P1, "rock", BLOCK, "block").build();
    expect(game.p1.can("reveal", "block")).toBe(true);
    await game.p1.reveal("block");
    game.script(P1, [(d) => (d.kind === "pick" ? "keeper" : undefined)]);
    await game.settle(); // 811.1.d.2 — the only unit "here" is the keeper
    expect(game.zoneOf("block")).toBe("trash");
    const granted = game.state("keeper").grantedKeywords.map((k) => k.keyword).sort();
    expect(granted).toEqual(["Shield", "Tank"]);
    expect(game.p1.energy()).toBe(0);
  });
});
