/**
 * Viktor, Innovator — ven-176-166 · Champion Unit (Viktor) · Mind · 4 energy + [mind] · 3 Might
 *
 *   When you play a card on an opponent's turn, play a 1 [Might] Recruit unit token to your base.
 *
 * (VEN reprint of ogn-117-298 — same text; this file goes deeper than the OGN one.)
 *
 * Head-judge notes (the tricky spots this file pins down):
 *  1. "play a card" = any card YOU play (spell from hand, a Hidden card played from facedown…) while it
 *     is NOT your turn. In practice that means a Reaction / a facedown play inside a chain the opponent
 *     opened (316.5.b — you cannot open one yourself on their turn). Your own turn: nothing. The
 *     opponent's plays: nothing. Viktor in HAND (not on the board): nothing.
 *  2. WHEN it triggers (419.4.a): "when you play a card" abilities trigger once the play is COMPLETED by
 *     the card's resolution — not when it is put on the chain. So: your Reaction resolves first, THEN
 *     Viktor's trigger is added (above whatever is still on the chain), P2 may respond to it, and only
 *     then does the Recruit appear. A COUNTERED card never resolved → it was not played (425.1.b /
 *     419.4.a.1) → no token.
 *  3. Tokens are not cards (185): the Recruit entering play is not "playing a card" → exactly ONE token
 *     per card, no self-feeding loop. Two cards played on their turn → two tokens. A Hidden card played
 *     from facedown is ONE card played → one token (the engine fires twice there → BUG).
 *  4. The token: a 1-Might "Recruit" unit token, owned and controlled by you (182/183), played to your
 *     BASE even when Viktor stands at a battlefield, and — like any unit — it enters exhausted (185.2.d).
 *  5. Cost 4 + one [mind] pip; a Viktor champion, playable from the Champion Zone.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-176-166";
const SMOKE_SCREEN = "ogn-093-298"; // Mind Reaction · 2 + [mind] · give a unit −4 Might this turn
const DEFY = "ogn-045-298"; // Calm Reaction · 1 + [calm] · counter a spell costing ≤4 / ≤1 pip
const WIND_WALL = "ogn-064-298"; // Calm Reaction · 3 + [calm]... · Counter a spell.
const CONSULT = "ogn-083-298"; // Mind spell · [Hidden] [Reaction] · Draw 2.
const CLEAVE = "ogn-004-298"; // Fury Action spell P2 opens a chain with · 1 energy

const tokensIn = (ids: readonly string[]) => ids.filter((id) => id.startsWith("token-"));

/** P2's turn. P1: Viktor at `where`, Smoke Screen + Defy in hand, resources for both. P2: Cleave in hand + a 6-Might unit. */
function oppTurn(where: "base" | "bf1" = "base") {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .resources(P1, { energy: 3, power: { calm: 1, mind: 1 } })
    .resources(P2, { energy: 1 })
    .unit(P1, where, CARD, "viktor")
    .unit(P2, "base", { might: 6, name: "Foe" }, "foe")
    .hand(P2, CLEAVE, "cleave")
    .hand(P1, SMOKE_SCREEN, "ss")
    .hand(P1, DEFY, "defy");
}

/** P2 opens a chain with Cleave on their own unit and passes priority to P1. */
async function p2OpensChain(game: Game): Promise<void> {
  await game.p2.cast("cleave", { targets: "foe" });
  await game.p2.passPriority();
  expect(game.actingSeat()).toBe(P1);
}

describe("Viktor, Innovator (ven-176-166)", () => {
  test("registry payload: 4 + [mind] Viktor champion, 3 Might; one trigger — you play a card, restricted to the opponent's turn → create a 1-Might Recruit unit token in base", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "mind", energyCost: 4, isChampion: true, might: 3, name: "Viktor, Innovator", powerCost: ["mind"], tags: ["Viktor"] });
    expect(def?.abilities).toEqual([
      {
        effect: { location: "base", token: { might: 1, name: "Recruit", type: "unit" }, type: "create-token" },
        trigger: { event: "play-card", on: "controller", restrictions: [{ type: "on-opponent-turn" }] },
        type: "triggered",
      },
    ]);
  });

  test("cost: exactly 4 energy + 1 mind; a 3-Might unit that enters exhausted; no token for playing Viktor on your own turn; 4 energy without the pip, or 3 + mind, is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { mind: 1 } }).hand(P1, CARD, "viktor").build();
    await game.p1.play("viktor");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.state("viktor")).toMatchObject({ isExhausted: true, might: 3, zone: "base" });
    expect(tokensIn(game.p1.base())).toEqual([]);
    expect((await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "viktor").build()).p1.can("play", "viktor")).toBe(false);
    expect((await scenario().resources(P1, { energy: 3, power: { mind: 2 } }).hand(P1, CARD, "viktor").build()).p1.can("play", "viktor")).toBe(false);
  });

  test("champion zone: playable from the Champion Zone for the same 4 + [mind]", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { mind: 1 } }).champion(P1, CARD, "viktor").build();
    await game.p1.playChampion("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.zoneOf("viktor")).toBe("base");
    expect(game.p1.champion()).toBeUndefined();
  });

  test("419.4.a — a Reaction on their turn: nothing triggers on cast; once Smoke Screen RESOLVES Viktor's trigger is added above their Cleave, P2 may respond, then exactly one Recruit token lands in P1's base", async () => {
    const game = await oppTurn().build();
    await p2OpensChain(game);
    await game.p1.cast("ss", { targets: "foe" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "ss"]); // no trigger yet — the card has not resolved
    await game.p1.passPriority();
    await game.p2.passPriority(); // Smoke Screen resolves → NOW "you played a card"
    expect(game.state("foe").might).toBe(2);
    expect(game.chain().map((c) => [c.cardId, c.controller, c.triggered])).toEqual([["cleave", P2, false], ["viktor", P1, true]]);
    expect(tokensIn(game.p1.base())).toEqual([]); // still a chain item
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2); // response window on the trigger
    await game.p2.passPriority();
    const tokens = tokensIn(game.p1.base());
    expect(tokens).toHaveLength(1);
    expect(game.state(tokens[0] as string)).toMatchObject({ cardType: "unit", controller: P1, isToken: true, might: 1, name: "Recruit", owner: P1, zone: "base" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave"]);
    await game.settle();
    expect(tokensIn(game.p1.base())).toHaveLength(1); // 185 — the token entering was not "playing a card"
    expect(tokensIn(game.p2.base())).toEqual([]);
    expect(game.state("foe").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]); // their Cleave resolved last
  });

  test("185.2.d — the Recruit token is a unit like any other: it enters EXHAUSTED", async () => {
    const game = await oppTurn().build();
    await p2OpensChain(game);
    await game.p1.cast("ss", { targets: "foe" });
    await game.settle();
    const [tok] = tokensIn(game.p1.base());
    expect(tok).toBeDefined();
    expect(game.state(tok as string).isExhausted).toBe(true);
  });

  test("the token goes to your BASE even when Viktor is at a battlefield", async () => {
    const game = await oppTurn("bf1").build();
    await p2OpensChain(game);
    await game.p1.cast("ss", { targets: "foe" });
    await game.settle();
    expect(tokensIn(game.p1.base())).toHaveLength(1);
    expect(tokensIn(game.cardsAt("bf1"))).toEqual([]);
  });

  test("two cards played on their turn → two tokens (Smoke Screen, then Defy countering their Cleave)", async () => {
    const game = await oppTurn().build();
    await p2OpensChain(game);
    await game.p1.cast("ss", { targets: "foe" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Viktor #1 resolves
    await game.p1.passPriority();
    await game.p2.passPriority(); // Smoke Screen resolves; Cleave still on the chain, P2 has priority
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave"]);
    if (game.actingSeat() === P2) {
      await game.p2.passPriority();
    }
    await game.p1.cast("defy", { targets: "cleave" });
    await game.settle();
    expect(tokensIn(game.p1.base())).toHaveLength(2);
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.state("foe").grantedKeywords).toEqual([]); // Cleave was countered
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, mind: 0 } });
  });

  test("negative space — on YOUR OWN turn playing a card (the same Reaction) makes no token", async () => {
    const game = await oppTurn().active(P1).build();
    await game.p1.cast("ss", { targets: "foe" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ss"]);
    await game.settle();
    expect(tokensIn(game.p1.base())).toEqual([]);
  });

  test("negative space — the OPPONENT playing cards on their turn, or Viktor sitting in your HAND while you react, makes no token", async () => {
    const theirs = await oppTurn().build();
    await theirs.p2.cast("cleave", { targets: "foe" });
    await theirs.settle();
    expect(tokensIn(theirs.p1.base())).toEqual([]);
    expect(tokensIn(theirs.p2.base())).toEqual([]);
    const inHand = await scenario()
      .active(P2)
      .resources(P1, { energy: 2, power: { mind: 1 } })
      .resources(P2, { energy: 1 })
      .hand(P1, CARD, "viktor")
      .unit(P2, "base", { might: 6 }, "foe")
      .hand(P2, CLEAVE, "cleave")
      .hand(P1, SMOKE_SCREEN, "ss")
      .build();
    await p2OpensChain(inHand);
    await inHand.p1.cast("ss", { targets: "foe" });
    expect(inHand.chain().map((c) => c.cardId)).toEqual(["cleave", "ss"]);
    await inHand.settle();
    expect(tokensIn(inHand.p1.base())).toEqual([]);
  });

  test("425.1.b / 419.4.a.1 — a COUNTERED card was never played: P2 Wind Walls the Smoke Screen → no −4, and NO Recruit token", async () => {
    const game = await oppTurn().resources(P2, { energy: 4, power: { calm: 2 } }).hand(P2, WIND_WALL, "ww").build();
    await p2OpensChain(game);
    await game.p1.cast("ss", { targets: "foe" });
    await game.p1.passPriority();
    await game.p2.cast("ww", { targets: "ss" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "ss", "ww"]);
    await game.settle();
    expect(game.zoneOf("ss")).toBe("trash");
    expect(game.zoneOf("ww")).toBe("trash");
    expect(game.state("foe").might).toBe(6); // countered — no −4
    expect(tokensIn(game.p1.base())).toEqual([]);
    expect(tokensIn(game.p2.base())).toEqual([]); // and P2's own plays on P2's turn never count
  });

  // 419.4.a / 185: playing ONE Hidden card from facedown is one card played → Viktor
  // triggers once, when Consult the Past resolves → one Recruit.
  test("a [Hidden] card played from facedown on their turn triggers Viktor exactly once — one Recruit", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .resources(P2, { energy: 1 })
      .unit(P1, "bf1", CARD, "viktor")
      .facedown(P1, "bf1", CONSULT, "ctp")
      .unit(P2, "base", { might: 6, name: "Foe" }, "foe")
      .hand(P2, CLEAVE, "cleave")
      .build();
    await p2OpensChain(game);
    expect(game.p1.can("reveal", "ctp")).toBe(true);
    await game.p1.reveal("ctp");
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "ctp"]); // 419.4.a — nothing triggers before it resolves
    const handBefore = game.p1.hand().length;
    await game.settle();
    expect(game.zoneOf("ctp")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(handBefore + 2);
    expect(tokensIn(game.p1.base())).toHaveLength(1);
    expect(tokensIn(game.cardsAt("bf1"))).toEqual([]);
  });

  test("a [Hidden] card played from facedown on their turn IS 'playing a card': Consult the Past draws 2 and at least one Recruit lands in the base (not at Viktor's battlefield)", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .resources(P2, { energy: 1 })
      .unit(P1, "bf1", CARD, "viktor")
      .facedown(P1, "bf1", CONSULT, "ctp")
      .unit(P2, "base", { might: 6, name: "Foe" }, "foe")
      .hand(P2, CLEAVE, "cleave")
      .build();
    await p2OpensChain(game);
    await game.p1.reveal("ctp");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // played for [0] from facedown
    await game.settle();
    expect(game.zoneOf("ctp")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(2);
    expect(tokensIn(game.p1.base()).length).toBeGreaterThanOrEqual(1);
    expect(tokensIn(game.cardsAt("bf1"))).toEqual([]);
  });

  test("the Recruit is a real unit next turn: it readies at P1's Awaken and can make a Standard Move to conquer an open battlefield", async () => {
    const game = await oppTurn().battlefield("bf2", { controller: null }).build();
    await p2OpensChain(game);
    await game.p1.cast("ss", { targets: "foe" });
    await game.settle();
    const [tok] = tokensIn(game.p1.base());
    await game.advanceTurn(); // → P1
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state(tok as string).isReady).toBe(true);
    await game.p1.move(tok as string, "bf2");
    await game.settle();
    expect(game.locationOf(tok as string)).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
