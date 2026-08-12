/**
 * Core rules — the object-identity boundary (rule 124 / 124.1).
 *
 * A card that changes zones to or from a non-board zone becomes a NEW game object and
 * "nothing about the old object is tracked in any capacity". Relocating on the board is NOT
 * that boundary (446.1): a Move, a Recall or a swap keeps the same object and everything it
 * remembers. Every per-object ledger the engine keeps is keyed by CARD id — the card's
 * identity, which survives every zone change — so `operations/object-identity.ts` supplies the
 * missing instance layer and is the single place that tears those ledgers down.
 *
 * Rules covered:
 *   124 / 124.1   a zone change to/from a non-board zone mints a new object with no memory
 *   446.1         changing spaces on the board is a Move, not a zone change
 *   377.2.b       "Use only once each turn" — a per-object activation allowance
 *   383.3.e       "once each turn" triggered abilities — a per-object fire tally
 *   371.1         a once-each-turn replacement's spent allowance
 *   390.3         a delayed replacement is keyed to the OBJECT it chose
 *   372 / 371.2.b per-object damage-replacement bookkeeping
 *   359.3.e.4     a replayed card is a different object and is never re-acquired
 *
 * The file is a MATRIX in two halves:
 *   1. ledger kind × scope — what `resetObjectIdentity` drops and what it must leave alone
 *      (player-scoped and other-object records are the negatives);
 *   2. exit-and-return path × observable — every way a card can leave the board reaches that
 *      boundary (the instance id advances), and no board-to-board relocation does.
 */

import { describe, expect, test } from "bun:test";
import {
  forgetObjectScopedMemory,
  getObjectInstanceId,
  isObjectScopedTallyKey,
  type ObjectIdentityDraft,
  resetObjectIdentity,
} from "../../operations/object-identity";
import { P1, P2, scenario } from "../../harness";

// ---------------------------------------------------------------------------
// 1. ledger kind × scope
// ---------------------------------------------------------------------------

/** A draft carrying one entry of EVERY object-scoped ledger for `u1`, plus the negatives. */
function ledgers(): ObjectIdentityDraft {
  return {
    activeReplacements: [
      // 390.3 — bound to the object u1 chose: dies with it.
      { replaces: "take-damage", sourceCardId: "spell1", targetCardIds: ["u1"] },
      // bound to a DIFFERENT object: untouched.
      { replaces: "take-damage", sourceCardId: "spell1", targetCardIds: ["u2"] },
      // a player-scoped rider that merely names u1 as its SOURCE: outlives it.
      { replaces: "play-cost", playerId: P1, sourceCardId: "u1" },
    ],
    consumedNextReplacements: { "u1|0": true, "u1|1": true, "u2|0": true },
    damageReplacementOrder: { u1: ["double"], u2: ["prevent"] },
    damageTimeShieldsAsked: { u1: ["boss"], u2: ["boss"] },
    gameEventCounts: { "die|c:u1": 1, [`die|p:${P1}`]: 1 },
    objectInstances: {},
    turnEventCounts: {
      // object-scoped, every shape the key builders emit
      "activate|u1|0": 1,
      "choose|c:u1|ch:p1|bf:bf1": 1,
      "conquer|c:u1": 1,
      "trigger-fired|c:u1|e:die": 1,
      // negatives: another object, a look-alike id, the player, the bare event
      "activate|u10|0": 1,
      "conquer|c:u10": 1,
      [`conquer|p:${P1}`]: 1,
      conquer: 1,
    },
  };
}

describe("124.1 — the ledger matrix: what an identity reset drops and what it must not touch", () => {
  test("key classification: object-scoped shapes match, player-scoped and look-alike ids do not", () => {
    // `<event>|c:<id>`, with and without the trailing `|ch:` / `|bf:` / `|e:` scopes.
    expect(isObjectScopedTallyKey("conquer|c:u1", "u1")).toBe(true);
    expect(isObjectScopedTallyKey("choose|c:u1|ch:p1|bf:bf1", "u1")).toBe(true);
    expect(isObjectScopedTallyKey("trigger-fired|c:u1|e:die", "u1")).toBe(true);
    // `activate|<id>|<abilityIndex>` — the shape `forgetPerCardTallies` used to miss.
    expect(isObjectScopedTallyKey("activate|u1|0", "u1")).toBe(true);
    expect(isObjectScopedTallyKey("activate|u1|3", "u1")).toBe(true);
    // negatives
    expect(isObjectScopedTallyKey(`conquer|p:${P1}`, "u1")).toBe(false);
    expect(isObjectScopedTallyKey("conquer", "u1")).toBe(false);
    expect(isObjectScopedTallyKey("conquer|c:u10", "u1")).toBe(false); // id prefix, not the id
    expect(isObjectScopedTallyKey("activate|u10|0", "u1")).toBe(false);
  });

  test("per-turn tallies: 'the first time I …', a once-each-turn trigger fire and an activation allowance all reset", () => {
    const draft = ledgers();
    resetObjectIdentity(draft, "u1");
    expect(Object.keys(draft.turnEventCounts ?? {}).toSorted()).toEqual([
      "activate|u10|0",
      "conquer",
      `conquer|p:${P1}`,
      "conquer|c:u10",
    ].toSorted());
  });

  test("game-long tallies follow the same rule: the object key goes, the player key stays", () => {
    const draft = ledgers();
    resetObjectIdentity(draft, "u1");
    expect(draft.gameEventCounts).toEqual({ [`die|p:${P1}`]: 1 });
  });

  test("371.1: a spent once-each-turn replacement allowance is per OBJECT — every ability index of u1 goes, u2's stays", () => {
    const draft = ledgers();
    resetObjectIdentity(draft, "u1");
    expect(draft.consumedNextReplacements).toEqual({ "u2|0": true });
  });

  test("390.3: a delayed replacement bound to the departing object is dropped; one bound elsewhere, and one that merely names it as SOURCE, survive", () => {
    const draft = ledgers();
    resetObjectIdentity(draft, "u1");
    expect(draft.activeReplacements).toEqual([
      { replaces: "take-damage", sourceCardId: "spell1", targetCardIds: ["u2"] },
      { replaces: "play-cost", playerId: P1, sourceCardId: "u1" },
    ]);
  });

  test("372 / 371.2.b: per-object damage bookkeeping for the next damage the old object would have taken is dropped", () => {
    const draft = ledgers();
    resetObjectIdentity(draft, "u1");
    expect(draft.damageReplacementOrder).toEqual({ u2: ["prevent"] });
    expect(draft.damageTimeShieldsAsked).toEqual({ u2: ["boss"] });
  });

  test("the instance id advances once per crossing, and only for the card that crossed", () => {
    const draft = ledgers();
    expect(getObjectInstanceId(draft, "u1")).toBe(0);
    resetObjectIdentity(draft, "u1");
    expect(getObjectInstanceId(draft, "u1")).toBe(1);
    expect(getObjectInstanceId(draft, "u2")).toBe(0);
    resetObjectIdentity(draft, "u1");
    expect(getObjectInstanceId(draft, "u1")).toBe(2);
  });

  test("the teardown is idempotent and tolerates a card with no ledgers at all", () => {
    const draft = ledgers();
    forgetObjectScopedMemory(draft, ["u1"]);
    const once = JSON.parse(JSON.stringify(draft));
    forgetObjectScopedMemory(draft, ["u1", "never-seen"]);
    expect(JSON.parse(JSON.stringify(draft))).toEqual(once);
    forgetObjectScopedMemory({}, ["u1"]); // empty draft: no throw
  });
});

// ---------------------------------------------------------------------------
// 2. exit-and-return path × observable
// ---------------------------------------------------------------------------

/** Unit · 3 Might · "1: Draw 1. (Use only once each turn.)" */
const ONCE_USER = {
  abilities: [
    {
      cost: { energy: 1 },
      effect: { amount: 1, type: "draw" },
      restrictions: [{ type: "once-per-turn" }],
      type: "activated",
    },
  ],
  might: 3,
  name: "Once User",
};

/** "Return a friendly unit to its owner's hand." */
const BOUNCE = {
  abilities: [{ effect: { target: { controller: "friendly", type: "unit" }, type: "return-to-hand" }, timing: "action", type: "spell" }],
  cardType: "spell",
  energyCost: 1,
  name: "Bounce",
  timing: "action",
};
/** "Banish a unit." */
const BANISH = {
  abilities: [{ effect: { target: { type: "unit" }, type: "banish" }, timing: "action", type: "spell" }],
  cardType: "spell",
  energyCost: 1,
  name: "Banish It",
  timing: "action",
};
/** "Kill a unit." */
const KILL = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  energyCost: 1,
  name: "Kill It",
  timing: "action",
};
/** "Recycle a unit." (board → owner's deck) */
const RECYCLE = {
  abilities: [{ effect: { target: { type: "unit" }, type: "recycle" }, timing: "action", type: "spell" }],
  cardType: "spell",
  energyCost: 1,
  name: "Recycle It",
  timing: "action",
};
/** "Play a 1-Might Recruit unit token to your base." */
const MAKE_TOKEN = {
  abilities: [{ effect: { location: "base", token: { might: 1, name: "Recruit", type: "unit" }, type: "create-token" }, timing: "action", type: "spell" }],
  cardType: "spell",
  energyCost: 1,
  name: "Make Recruit",
  timing: "action",
};

function board() {
  return scenario()
    .resources(P1, { energy: 20, power: { order: 6, rainbow: 4 } })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", ONCE_USER, "hero")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "foe")
    .fillDecks({ main: 20, runes: 12 });
}

/** The instance id the engine is currently tracking for `alias`. */
function instance(game: { gameState: { objectInstances?: Record<string, number> } }, alias: string): number {
  return game.gameState.objectInstances?.[alias] ?? 0;
}

describe("124 / 446.1 — every exit path reaches the identity boundary; no board relocation does", () => {
  test("YES: board → owner's hand mints a new object", async () => {
    const game = await board().hand(P1, BOUNCE, "spell").build();
    expect(instance(game, "hero")).toBe(0);
    await game.p1.cast("spell", { targets: "hero" });
    await game.settle();
    expect(game.zoneOf("hero")).toBe("hand");
    expect(instance(game, "hero")).toBe(1);
  });

  test("YES: board → banishment mints a new object", async () => {
    const game = await board().hand(P1, BANISH, "spell").build();
    await game.p1.cast("spell", { targets: "hero" });
    await game.settle();
    expect(game.zoneOf("hero")).toBe("banishment");
    expect(instance(game, "hero")).toBe(1);
  });

  test("YES: board → trash (a kill) mints a new object", async () => {
    const game = await board().hand(P1, KILL, "spell").build();
    await game.p1.cast("spell", { targets: "hero" });
    await game.settle();
    expect(game.zoneOf("hero")).toBe("trash");
    expect(instance(game, "hero")).toBe(1);
  });

  test("YES: board → the owner's deck (a recycle) mints a new object", async () => {
    const game = await board().hand(P1, RECYCLE, "spell").build();
    await game.p1.cast("spell", { targets: "hero" });
    await game.settle();
    expect(game.zoneOf("hero")).toBe("mainDeck");
    expect(instance(game, "hero")).toBe(1);
  });

  test("YES: a token leaving the board crosses the boundary before 186.1 removes it", async () => {
    const game = await board().hand(P1, MAKE_TOKEN, "make").hand(P1, KILL, "kill").build();
    await game.p1.cast("make");
    await game.settle();
    const token = game.p1.units("base").find((id) => game.state(id).isToken);
    expect(token).toBeDefined();
    await game.p1.cast("kill", { targets: token as string });
    await game.settle();
    expect(instance(game, token as string)).toBe(1);
  });

  test("NO: a Move between two board spaces keeps the SAME object (446.1)", async () => {
    const game = await board().build();
    await game.p1.move("hero", "bf1");
    await game.settle();
    expect(game.locationOf("hero")).toBe("bf1");
    expect(instance(game, "hero")).toBe(0);
  });

  test("NO: a turn boundary clears turn-scoped ledgers but is not an identity change either", async () => {
    const game = await board().build();
    await game.p1.activate("hero", 0);
    await game.settle();
    expect(game.p1.can("activate", "hero")).toBe(false);
    await game.advanceTurn();
    await game.advanceTurn();
    // The allowance is back because the TURN ended, not because the object changed.
    expect(game.p1.can("activate", "hero")).toBe(true);
    expect(instance(game, "hero")).toBe(0);
  });

  test("the round trip advances it exactly once per crossing: board → hand → board = two crossings", async () => {
    const game = await board().hand(P1, BOUNCE, "spell").build();
    await game.p1.cast("spell", { targets: "hero" });
    await game.settle();
    expect(instance(game, "hero")).toBe(1);
    await game.p1.play("hero", { to: "base" });
    await game.settle();
    expect(game.zoneOf("hero")).toBe("base");
    // The return is a play, not a leave: the instance minted on the way out is the one that
    // came back, so the ledgers it starts with are the empty ones minted for it.
    expect(instance(game, "hero")).toBe(1);
  });
});

describe("377.2.b — the 'use only once each turn' allowance follows the object, not the card", () => {
  test("YES: bounce and replay in the same turn re-arms the ability", async () => {
    const game = await board().hand(P1, BOUNCE, "spell").build();
    await game.p1.activate("hero", 0);
    await game.settle();
    expect(game.p1.can("activate", "hero")).toBe(false);

    await game.p1.cast("spell", { targets: "hero" });
    await game.settle();
    await game.p1.play("hero", { to: "base" });
    await game.settle();
    expect(game.p1.can("activate", "hero")).toBe(true);
  });

  test("NO: spending it and then MOVING does not re-arm it — same object, same spent allowance", async () => {
    const game = await board().build();
    await game.p1.activate("hero", 0);
    await game.settle();
    expect(game.p1.can("activate", "hero")).toBe(false);
    await game.p1.move("hero", "bf1");
    await game.settle();
    expect(game.p1.can("activate", "hero")).toBe(false);
  });

  test("NO: a SECOND copy of the card on the board has its own allowance, and spending one never spends the other", async () => {
    const game = await board().unit(P1, "base", ONCE_USER, "hero2").build();
    await game.p1.activate("hero", 0);
    await game.settle();
    expect(game.p1.can("activate", "hero")).toBe(false);
    expect(game.p1.can("activate", "hero2")).toBe(true);
  });

  test("player-scoped turn records are NOT object memory and survive the crossing untouched", async () => {
    const game = await board().hand(P1, BOUNCE, "spell").build();
    const playedBefore = game.gameState.cardsPlayedThisTurn?.[P1] ?? 0;
    await game.p1.cast("spell", { targets: "hero" });
    await game.settle();
    // Casting the bounce is a play by P1: a fact about the PLAYER, recorded against P1 and
    // not against any object, so the Hero's identity change cannot clear it.
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(playedBefore + 1);
    expect(instance(game, "hero")).toBe(1);
  });
});
