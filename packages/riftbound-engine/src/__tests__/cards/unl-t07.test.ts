/**
 * Sprite — unl-t07 · Token Unit · (no domain, no cost) · 3 Might
 *
 *   [Temporary] (Kill me at the start of your Beginning Phase, before scoring.)
 *
 * Rules: 187.2 (a 3 [M] Sprite token is a domainless unit token with 3 Might, the Fae tag and
 * Temporary), 816.1.b/c (Temporary ≡ "At the start of this permanent's CONTROLLER's Beginning Phase,
 * before scoring, kill this"), 186.1 (a token put into a non-board zone ceases to exist), 315.2
 * (Beginning Step precedes the Scoring Step — so a lone Temporary unit never Holds).
 *
 * Head-judge notes (the tricky spots this file covers):
 *   1. WHOSE Beginning Phase: the controller's — it survives the opponent's whole turn (and can fight
 *      in it), and a Sprite stolen with Possession dies on the THIEF's turn start, not its owner's.
 *   2. "before scoring": a Sprite alone on a held battlefield is dead before the Hold check → no
 *      point and the battlefield goes uncontrolled; with a non-Temporary friend there the friend holds.
 *   3. It is a real kill/death (Deathknell-class triggers such as Vicious Snapjaws see it), and as a
 *      token it then ceases to exist rather than sitting in a trash.
 *   4. Until then it is an ordinary ready 3-Might body: made by Sprite Burst it can attack and conquer
 *      the same turn — but it will not be around to Hold that battlefield next turn.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-t07";
const SPRITE_BURST = "unl-069-219"; // Spell, 5 energy: play two ready 3 [Might] Sprite tokens with [Temporary]
const SNAPJAWS = "unl-129-219"; // Unit: When another friendly unit dies, gain 1 XP.
const POSSESSION = "ogn-203-298"; // Spell, 8 + chaos×3: take control of an enemy unit at a battlefield and recall it

/** Killed = left the board for the trash — or, being a token, ceased to exist altogether (186.1). */
const killed = (game: Game, id: string) => !game.has(id) || game.zoneOf(id) === "trash";
const sprites = (game: Game) => game.p1.units().filter((id) => game.state(id).name === "Sprite");

describe("Sprite (unl-t07)", () => {
  test("registry payload: a costless, domainless 3-Might unit TOKEN whose only ability is the Temporary keyword", async () => {
    const game = await scenario().unit(P1, "base", CARD, "sprite").build();
    const def = peekDefaultCardPool()?.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", isToken: true, might: 3, name: "Sprite" });
    expect(def?.energyCost ?? 0).toBe(0);
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.domain).toBeUndefined();
    expect(def?.abilities).toEqual([{ keyword: "Temporary", type: "keyword" }]);
    expect(game.state("sprite")).toMatchObject({ baseMight: 3, isReady: true, might: 3 });
    expect(game.state("sprite").keywords).toEqual(["Temporary"]);
    expect(game.state("sprite").domains).toEqual([]);
  });

  test("rule 187.2 — a Sprite token carries the Fae tag (the token definition has no tags at all)", async () => {
    // Expected: tags include "Fae" so "Fae"-matters text can see it. Actual: `tags` is absent.
    await scenario().build();
    expect(peekDefaultCardPool()?.get(CARD)?.tags ?? []).toContain("Fae");
  });

  test("killed at the start of its controller's Beginning Phase: on the board through the opponent's turn end, gone by your main phase", async () => {
    const game = await scenario().turn(3).active(P2).unit(P1, "base", CARD, "sprite").unit(P1, "base", { might: 2, name: "Plain" }, "plain").build();
    expect(game.zoneOf("sprite")).toBe("base");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(killed(game, "sprite")).toBe(true);
    expect(game.p1.units()).toEqual(["plain"]); // only the Temporary one went
  });

  test("negative space: NOT killed when the OPPONENT's Beginning Phase starts — it survives their entire turn", async () => {
    const game = await scenario().unit(P1, "base", CARD, "sprite").build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("sprite")).toBe("base");
    expect(game.state("sprite").might).toBe(3);
    await game.p2.endTurn(); // now P1's turn begins → this is the moment it dies
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(killed(game, "sprite")).toBe(true);
  });

  test("'before scoring': a lone Sprite on a battlefield you control dies first → no Hold point, battlefield uncontrolled (control: a plain unit there does Hold)", async () => {
    const lone = await scenario().active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "sprite").build();
    await lone.advanceTurn();
    expect(lone.turnPlayer()).toBe(P1);
    expect(killed(lone, "sprite")).toBe(true);
    expect(lone.p1.points()).toBe(0);
    expect(lone.gameState.battlefields.bf1?.controller).toBeNull();
    const plain = await scenario().active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", { might: 3, name: "Plain" }, "plain").build();
    await plain.advanceTurn();
    expect(plain.p1.points()).toBe(1);
    expect(plain.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("Sprite + a non-Temporary friend on the battlefield: the Sprite dies, the friend still Holds for 1 point", async () => {
    const game = await scenario().active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "sprite").unit(P1, "bf1", { might: 1, name: "Anchor" }, "anchor").build();
    await game.advanceTurn();
    expect(killed(game, "sprite")).toBe(true);
    expect(game.zoneOf("anchor")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("the Temporary kill is a real death: Vicious Snapjaws ('when another friendly unit dies, gain 1 XP') triggers off it during the Beginning Phase", async () => {
    const game = await scenario().active(P2).unit(P1, "base", CARD, "sprite").unit(P1, "base", SNAPJAWS, "snap").build();
    expect(game.p1.xp()).toBe(0);
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning"); // held while the death trigger sits on the chain
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "snap", controller: P1, triggered: true })]);
    expect(killed(game, "sprite")).toBe(true); // already dead when the trigger is pending
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.xp()).toBe(1);
    expect(game.zoneOf("snap")).toBe("base");
  });

  test("tokens made by Sprite Burst: two READY 3-Might Sprite tokens with Temporary; they outlive the opponent's turn and then cease to exist (not even in the trash, 186.1)", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).hand(P1, SPRITE_BURST, "burst").build();
    await game.p1.cast("burst");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    const made = sprites(game);
    expect(made).toHaveLength(2);
    for (const id of made) {
      expect(game.state(id)).toMatchObject({ cardType: "unit", controller: P1, isReady: true, isToken: true, might: 3, zone: "base" });
      expect(game.state(id).keywords).toContain("Temporary");
    }
    await game.advanceTurn(); // P2's turn: still here
    expect(sprites(game)).toHaveLength(2);
    await game.advanceTurn(); // P1's Beginning Phase: both go at once
    expect(game.turnPlayer()).toBe(P1);
    expect(sprites(game)).toEqual([]);
    for (const id of made) {
      expect(game.has(id)).toBe(false);
    }
    expect(game.p1.trash()).toEqual(["burst"]);
  });

  test("a fresh Sprite is a normal ready 3-Might body: it attacks and conquers this turn (+1) — but is killed before it could Hold next turn (still 1, battlefield lost)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Sentry" }, "sentry")
      .hand(P1, SPRITE_BURST, "burst")
      .build();
    await game.p1.cast("burst");
    await game.settle();
    const [first] = sprites(game);
    await game.p1.move(first as string, "bf1");
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash"); // 3 ≥ 2, and 2 < 3
    expect(game.locationOf(first as string)).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.has(first as string)).toBe(false);
    expect(game.p1.points()).toBe(1); // no Hold: it died before scoring
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
  });

  test("controller ≠ owner (816.1.b/c) — a Sprite stolen with Possession dies at the start of the THIEF's Beginning Phase, not its owner's", async () => {
    // Expected: P1 possesses P2's Sprite (now in P1's base, controller P1, owner P2); it survives the
    // start of P2's turn and is killed when P1's next turn begins. Actual: the Beginning-Phase sweep
    // keys on OWNER, so it is killed as P2's turn starts.
    const game = await scenario()
      .resources(P1, { energy: 8, power: { chaos: 3 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", CARD, "sprite")
      .unit(P2, "bf1", { might: 1, name: "Anchor" }, "anchor")
      .hand(P1, POSSESSION, "pos")
      .build();
    await game.p1.cast("pos", { targets: "sprite" });
    await game.settle();
    expect(game.state("sprite")).toMatchObject({ controller: P1, owner: P2, zone: "base" });
    await game.advanceTurn(); // → P2 (the OWNER's Beginning Phase): must survive
    expect(game.turnPlayer()).toBe(P2);
    expect(killed(game, "sprite")).toBe(false);
    expect(game.state("sprite")).toMatchObject({ controller: P1, zone: "base" });
    await game.advanceTurn(); // → P1 (the CONTROLLER's Beginning Phase): now it dies
    expect(game.turnPlayer()).toBe(P1);
    expect(killed(game, "sprite")).toBe(true);
  });
});
