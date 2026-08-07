/**
 * Sprite Fountain — unl-078-219 · Gear · Mind · 2 energy + [mind]
 *
 *   [Temporary] (Kill this at the start of its controller's Beginning Phase, before scoring.)
 *   When you play this, play a ready 3 [Might] Sprite unit token with [Temporary] to your base.
 *   [Deathknell][>] Repeat this gear's play effect. (When this dies, get the effect.)
 *
 * Rules: 816 (Temporary ≡ "at the start of this permanent's CONTROLLER's Beginning Phase, before
 * scoring, kill this"; 816.2.a multiple instances trigger only once), 808 (Deathknell ≡ "When I die,
 * [Effect]" — a Temporary kill and a "kill a gear" spell are both deaths), 187.2 (Sprite token: 3
 * Might, Temporary, domainless), 186.1 (a token leaving the board ceases to exist), 383 (the play
 * effect is a triggered ability → a chain item; the token exists only after it resolves).
 *
 * Head-judge notes — the tricky spots for this card:
 *  1. The value proposition is TWO Sprites over two of my turns: Sprite A on play; at my next
 *     Beginning Phase Temporary kills BOTH the Fountain and Sprite A, and the Fountain's Deathknell
 *     immediately mints Sprite B — which, being created during that Beginning Phase, is NOT killed
 *     until the Beginning Phase after that. Net board at my next main phase: exactly one fresh Sprite.
 *  2. Whose Beginning Phase: the controller's. Nothing dies when the OPPONENT's turn starts; the
 *     Sprite is a real ready 3-Might defender for their whole turn.
 *  3. Any death repeats the effect: Detonate (sfd-005-221) on P2's turn kills it → P1 (its controller,
 *     not the caster) gets the Sprite in P1's base, plus Detonate's "its controller draws 2". That
 *     Sprite, made on P2's turn, then dies at the start of MY turn before I can ever attack with it.
 *  4. The token is minted READY and in BASE ("to your base"), regardless of anything at battlefields.
 *  5. Cost: 2 energy AND a [mind] pip; the play trigger is a chain item P2 may respond to, but the
 *     gear itself is already on the board while it is pending.
 *  6. Turn to Dust on an already-Temporary Fountain is redundant (816.2.a): still ONE kill, ONE
 *     Deathknell, ONE replacement Sprite.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-078-219";
const DETONATE = "sfd-005-221"; // 1 + [fury], standard: Kill a gear. Its controller draws 2.
const TURN_TO_DUST = "unl-070-219"; // 2 mind: Give a gear [Temporary].

const sprites = (game: Game, seat: "p1" | "p2" = "p1") => game[seat].units().filter((id) => game.state(id).name === "Sprite");
const TOKEN = { keywords: ["Temporary"], might: 3, name: "Sprite", type: "unit" };

function inHand() {
  return scenario().resources(P1, { energy: 2, power: { mind: 1 } }).hand(P1, CARD, "fountain");
}

describe("Sprite Fountain (unl-078-219)", () => {
  test("registry payload: 2+[mind] mind gear; abilities = [Temporary keyword, play-self trigger → ready Sprite token to base, Deathknell keyword carrying the SAME effect]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "gear", domain: "mind", energyCost: 2, name: "Sprite Fountain" });
    expect(def?.powerCost).toEqual(["mind"]);
    const effect = { location: "base", ready: true, token: TOKEN, type: "create-token" };
    expect(def?.abilities).toEqual([
      { keyword: "Temporary", type: "keyword" },
      { effect, trigger: { event: "play-self" }, type: "triggered" },
      { effect, keyword: "Deathknell", type: "keyword" },
      // rule 808.1 — `expandHuntKeywords` gives the Deathknell keyword its
      // `triggered` sibling; the trigger matcher only walks those.
      { effect, trigger: { event: "die", on: "self" }, type: "triggered" },
    ]);
  });

  test("cost: 2 energy + 1 mind; the gear is in base at once and its play trigger sits on the chain (no Sprite yet); no [mind] / 1 energy → unplayable", async () => {
    const game = await inHand().build();
    await game.p1.play("fountain");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.zoneOf("fountain")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fountain", controller: P1, triggered: true })]);
    expect(sprites(game)).toEqual([]);
    expect((await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "f").build()).p1.can("play", "f")).toBe(false);
    expect((await scenario().resources(P1, { energy: 2, power: { fury: 1 } }).hand(P1, CARD, "f").build()).p1.can("play", "f")).toBe(false);
    expect((await scenario().resources(P1, { energy: 1, power: { mind: 1 } }).hand(P1, CARD, "f").build()).p1.can("play", "f")).toBe(false);
  });

  test("play effect resolves → exactly one READY 3-Might Sprite unit TOKEN with [Temporary], controlled by me, in my BASE (not at my battlefield)", async () => {
    const game = await inHand().battlefield("bf1", { controller: P1 }).unit(P1, "bf1", { might: 2, name: "Holder" }, "holder").build();
    await game.p1.play("fountain");
    await game.settle();
    const [tok, ...rest] = sprites(game);
    expect(rest).toEqual([]);
    expect(tok).toBeDefined();
    expect(game.state(tok!)).toMatchObject({ baseMight: 3, controller: P1, isReady: true, isToken: true, might: 3, name: "Sprite", zone: "base" });
    expect(game.state(tok!).keywords).toEqual(["Temporary"]);
    expect(game.p1.units("bf1")).toEqual(["holder"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("P2 gets priority on the play trigger but passing just lets it resolve; the Fountain itself was never on the chain", async () => {
    const game = await inHand().build();
    await game.p1.play("fountain");
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.zoneOf("fountain")).toBe("base");
    expect(sprites(game)).toEqual([]);
    await game.p2.passPriority();
    expect(sprites(game)).toHaveLength(1);
    expect(game.chain()).toEqual([]);
  });

  test("controller's Beginning Phase only: across the OPPONENT's turn start nothing dies — Fountain in base, Sprite A still a ready 3", async () => {
    const game = await inHand().build();
    await game.p1.play("fountain");
    await game.settle();
    const [a] = sprites(game);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("fountain")).toBe("base");
    expect(sprites(game)).toEqual([a!]);
    expect(game.state(a!)).toMatchObject({ isReady: true, might: 3 });
  });

  test("my next Beginning Phase: Temporary kills the Fountain AND Sprite A; Deathknell is on the chain during 'beginning' and mints Sprite B — by main phase: Fountain in trash, A gone (186.1), exactly one NEW ready Sprite", async () => {
    const game = await inHand().build();
    await game.p1.play("fountain");
    await game.settle();
    const [a] = sprites(game);
    await game.advanceTurn(); // → P2
    await game.p2.endTurn(); // → P1 beginning
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    // rule 816.1 — [Temporary] is a triggered ability: at the start of the
    // Beginning Phase both kills go on the chain and nothing has died yet.
    expect(game.zoneOf("fountain")).toBe("base");
    expect(game.chain().map((i) => i.cardId).sort()).toEqual([a!, "fountain"].sort());
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.trash()).toEqual(["fountain"]); // the token did not go to the trash — it ceased to exist
    expect(game.has(a!) && game.zoneOf(a!) !== "trash" && game.p1.units().includes(a!)).toBe(false);
    const now = sprites(game);
    expect(now).toHaveLength(1);
    expect(now[0]).not.toBe(a);
    expect(game.state(now[0]!)).toMatchObject({ controller: P1, isReady: true, isToken: true, might: 3, zone: "base" });
  });

  test("Sprite B (minted during that Beginning Phase) survives to the Beginning Phase AFTER it; then it dies too and the dead Fountain triggers nothing more → 0 Sprites, trash still just the Fountain", async () => {
    const game = await inHand().build();
    await game.p1.play("fountain");
    await game.settle();
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1: A + Fountain die, B minted
    const [b] = sprites(game);
    expect(b).toBeDefined();
    await game.advanceTurn(); // → P2: B still there
    expect(sprites(game)).toEqual([b!]);
    await game.advanceTurn(); // → P1: B dies
    expect(game.turnPlayer()).toBe(P1);
    expect(sprites(game)).toEqual([]);
    expect(game.p1.units()).toEqual([]);
    expect(game.p1.trash()).toEqual(["fountain"]);
    expect(game.violations()).toEqual([]);
  });

  test("[Deathknell] on a spell kill: P2 Detonates it on their turn → Fountain to trash, ITS CONTROLLER (P1) draws 2 and gets the Sprite in P1's base — P2 gets nothing", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { fury: 1 } })
      .gear(P1, CARD, "fountain")
      .hand(P2, DETONATE, "det")
      .build();
    const p1Hand = game.p1.hand().length;
    await game.p2.cast("det", { targets: "fountain" });
    await game.settle();
    expect(game.zoneOf("fountain")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(p1Hand + 2);
    const mine = sprites(game, "p1");
    expect(mine).toHaveLength(1);
    expect(game.state(mine[0]!)).toMatchObject({ controller: P1, isReady: true, owner: P1, zone: "base" });
    expect(sprites(game, "p2")).toEqual([]);
    expect(game.p2.units()).toEqual([]);
  });

  test("…and a Sprite minted on the OPPONENT's turn is dead on arrival for offence: it is killed at the start of my very next turn, before my main phase", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { fury: 1 } })
      .gear(P1, CARD, "fountain")
      .hand(P2, DETONATE, "det")
      .build();
    await game.p2.cast("det", { targets: "fountain" });
    await game.settle();
    expect(sprites(game)).toHaveLength(1);
    await game.advanceTurn(); // P2 ends → P1's Beginning Phase kills it
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(sprites(game)).toEqual([]);
  });

  test("816.2.a — a second Temporary (Turn to Dust on the Fountain) is redundant: still one kill, ONE Deathknell, ONE replacement Sprite at my next Beginning Phase", async () => {
    const game = await inHand().resources(P1, { energy: 4, power: { mind: 1 } }).hand(P1, TURN_TO_DUST, "dust").build();
    await game.p1.play("fountain");
    await game.settle();
    await game.p1.cast("dust", { targets: "fountain" });
    await game.settle();
    expect(game.zoneOf("dust")).toBe("trash");
    expect(sprites(game)).toHaveLength(1);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("fountain")).toBe("trash");
    expect(sprites(game)).toHaveLength(1);
    expect(game.violations()).toEqual([]);
  });

  test("an opponent's Fountain: MY turn start kills nothing of theirs; THEIR next turn start kills their Fountain + Sprite and mints their replacement in THEIR base", async () => {
    const game = await scenario().turn(2).active(P2).resources(P2, { energy: 2, power: { mind: 1 } }).hand(P2, CARD, "theirs").build();
    await game.p2.play("theirs");
    await game.settle();
    expect(sprites(game, "p2")).toHaveLength(1);
    const [a] = sprites(game, "p2");
    await game.advanceTurn(); // → P1
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("theirs")).toBe("base");
    expect(sprites(game, "p2")).toEqual([a!]);
    await game.advanceTurn(); // → P2
    expect(game.zoneOf("theirs")).toBe("trash");
    const b = sprites(game, "p2");
    expect(b).toHaveLength(1);
    expect(b[0]).not.toBe(a);
    expect(game.state(b[0]!)).toMatchObject({ controller: P2, zone: "base" });
    expect(sprites(game, "p1")).toEqual([]);
  });
});
