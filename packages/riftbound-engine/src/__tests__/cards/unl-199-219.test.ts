/**
 * Deceiver — unl-199-219 · Legend (LeBlanc) · Mind/Order
 *
 *   When you conquer or hold, you may discard 1 and exhaust me to play a ready Reflection unit token
 *   there. It becomes a copy of another unit there. Give it [Temporary].
 *
 * Rules: 469.1/469.2 (Conquer = take control of a battlefield; Hold = control it as your Beginning Phase
 * starts), 383.3.a (leading "you may": decided at finalization; declining removes the trigger), 383.3.b
 * ("discard 1 and exhaust me TO …" is a cost within instructions right after the "you may" → it is the
 * BASE COST, paid to finalize the trigger, before anyone can respond, 383.3.b.1), 187.6 (Reflection: a
 * domainless 0-Might unit token), 184.1 ("ready" overrides enter-exhausted), "there" = the conquered/held
 * battlefield, 477.1.b (a copy takes the printed name/Might/text of "another unit there"), 816 (Temporary:
 * killed at the start of its controller's Beginning Phase, BEFORE scoring), 186.1 (a token leaving the
 * board ceases to exist), 108.2 ("you" = the legend's controller).
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. The cost is real and up-front: empty hand or an already-exhausted Deceiver → the option cannot be
 *     taken; two conquers in one turn → only the first can pay (the legend is exhausted by then).
 *  2. The token is READY and lands AT THE BATTLEFIELD, copying ANOTHER unit there (the conqueror is a
 *     legal — usually the only — source; with two friendly units there the controller picks). The source
 *     unit itself is untouched: in particular it must NOT pick up [Temporary].
 *  3. Temporary kills the copy at the start of MY next Beginning Phase before scoring, so a lone
 *     Reflection can never hold the battlefield it was made on.
 *  4. Hold fires in the Beginning Phase; conquer fires mid-combat-cleanup; P2's conquers never ask P1.
 *  5. Registry: today's parse is a bare optional "grant Temporary to a unit" — no cost, no token, no copy.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-199-219";
const FODDER = "ogn-175-298"; // vanilla card to discard

/** P1's turn: Deceiver, an open battlefield, a ready 3-Might Walker in base, one card in hand. */
function conquerBoard(handCards = 1) {
  const b = scenario().legend(P1, CARD, "leblanc").battlefield("bf1", { controller: null }).battlefield("bf2", { controller: null }).unit(P1, "base", { might: 3, name: "Walker" }, "walker");
  for (let i = 0; i < handCards; i++) {
    b.hand(P1, FODDER, `fodder${i}`);
  }
  return b;
}

/** Pass focus/priority until a non-action prompt or an open main phase. */
async function untilPrompt(game: Game): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context === "main") {
      return;
    }
    await game.seat(d.seat).pass();
  }
}

/** Say yes to the Deceiver offer and answer any of P1's follow-up picks, preferring `prefs`. */
async function accept(game: Game, prefs: string[] = []): Promise<void> {
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  await game.p1.yes();
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind !== "pick" || d.seat !== P1 || d.options.length === 0) {
      return;
    }
    const want = prefs.find((p) => d.options.some((o) => (o.card ?? o.key) === p)) ?? d.options[0]!.key;
    await game.p1.pick(want);
  }
}

const tokensAt = (game: Game, loc: string) => game.p1.units(loc as "base").filter((id) => game.state(id).isToken);

describe("Deceiver (unl-199-219)", () => {
  // BUG — expected: an optional conquer-or-hold trigger whose payload carries the base cost (discard 1 +
  // exhaust self) and an effect that plays a READY Reflection token at the triggering battlefield, copies
  // another unit there and grants it Temporary. Actual: `{type:"grant-keyword", keyword:"Temporary",
  // target:{type:"unit"}}` — no cost, no token, no copy.
  test("registry payload should model cost {discard 1, exhaust self} + create ready Reflection token 'there' + copy + Temporary; the parse is a bare 'grant Temporary to a unit'", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", championTag: "LeBlanc", domain: ["mind", "order"], name: "Deceiver" });
    expect(def?.abilities).toHaveLength(1);
    const ab = def?.abilities?.[0] as Record<string, unknown>;
    expect(ab).toMatchObject({ optional: true, trigger: { event: "conquer-or-hold", on: "controller" }, type: "triggered" });
    const text = JSON.stringify(ab);
    expect(text).toMatch(/discard/i);
    expect(text).toMatch(/exhaust/i);
    expect(text).toMatch(/Reflection/);
    expect(text).toMatch(/create-token|token/);
    expect(text).toMatch(/copy/i);
    expect(text).toMatch(/Temporary/);
  });

  test("conquering (walk-in on an open battlefield) scores and puts Deceiver's trigger on the chain with a 'you may' for P1", async () => {
    const game = await conquerBoard().build();
    await game.p1.move("walker", "bf1");
    await untilPrompt(game);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "leblanc", controller: P1, name: "Deceiver", triggered: true })]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  });

  test("declining (383.3.a.2): the trigger leaves the chain, hand and legend untouched, no token anywhere, and the Walker gains nothing", async () => {
    const game = await conquerBoard().build();
    await game.p1.move("walker", "bf1");
    await untilPrompt(game);
    await game.p1.no();
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toEqual(["fodder0"]);
    expect(game.state("leblanc").isExhausted).toBe(false);
    expect(tokensAt(game, "bf1")).toEqual([]);
    expect(game.state("walker").keywords).toEqual([]);
    expect(game.p1.points()).toBe(1);
  });

  // BUG — expected (383.3.b.1): accepting pays the base cost at FINALIZATION — the lone hand card is discarded
  // to the trash and Deceiver is exhausted while the item still waits on the chain and P2 holds priority.
  // Actual: nothing is paid at any point.
  test("accepting pays 'discard 1 and exhaust me' up front — hand 1 → 0 (card in trash), legend exhausted, before P2 may respond", async () => {
    const game = await conquerBoard().build();
    await game.p1.move("walker", "bf1");
    await untilPrompt(game);
    await accept(game, ["fodder0"]);
    if (game.decision()?.kind === "action" && game.decision()?.seat === P1) {
      await game.p1.pass();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p1.hand()).toEqual([]);
    expect(game.zoneOf("fodder0")).toBe("trash");
    expect(game.state("leblanc").isExhausted).toBe(true);
  });

  // BUG — expected: on resolution a READY Reflection unit token controlled by P1 appears AT bf1 as a copy of the
  // Walker (name "Walker", 3 Might) carrying [Temporary]. Actual: no token is created at all.
  test("resolving plays a READY Reflection token at the conquered battlefield that is a 3-Might 'Walker' copy with [Temporary]", async () => {
    const game = await conquerBoard().build();
    await game.p1.move("walker", "bf1");
    await untilPrompt(game);
    await accept(game, ["fodder0", "walker"]);
    await game.settle();
    await accept(game, ["walker"]).catch(() => undefined); // a copy-source prompt on resolution, if any
    await game.settle();
    const toks = tokensAt(game, "bf1");
    expect(toks).toHaveLength(1);
    expect(game.state(toks[0]!)).toMatchObject({ controller: P1, isReady: true, isToken: true, might: 3, name: "Walker", zone: "battlefield-bf1" });
    expect(game.state(toks[0]!).keywords).toContain("Temporary");
    expect(tokensAt(game, "base")).toEqual([]); // "there", not the base
  });

  // BUG — expected: "Give IT [Temporary]" refers to the token; the conquering Walker is only the copy SOURCE and
  // is left exactly as it was. Actual: the mis-parsed effect grants [Temporary] to a unit — the Walker — which
  // would then die at the start of P1's next turn.
  test("the source unit is untouched — after accepting, the Walker must NOT have [Temporary] (and must survive P1's next Beginning Phase)", async () => {
    const game = await conquerBoard().build();
    await game.p1.move("walker", "bf1");
    await untilPrompt(game);
    await accept(game, ["fodder0", "walker"]);
    await game.settle({ policy: "first" });
    expect(game.state("walker").keywords).not.toContain("Temporary");
    expect(game.state("walker").grantedKeywords).toEqual([]);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("walker")).toBe("battlefield-bf1");
  });

  // BUG — expected (383.3.b.1): with an EMPTY hand the "discard 1" half of the cost is unpayable, so the offer is
  // absent or cannot be accepted. Actual: a plain yes/no with canAccept true.
  test("empty hand → the option cannot be taken (no prompt, or canAccept:false)", async () => {
    const game = await conquerBoard(0).build();
    await game.p1.move("walker", "bf1");
    await untilPrompt(game);
    const d = game.decision();
    const acceptable = d?.kind === "yes-no" && d.seat === P1 && d.canAccept !== false;
    expect(acceptable).toBe(false);
  });

  // BUG — expected: an already-EXHAUSTED Deceiver cannot pay "exhaust me", so the offer cannot be taken.
  // Actual: canAccept true regardless.
  test("Deceiver already exhausted → the option cannot be taken", async () => {
    const game = await scenario()
      .card("leblanc", { def: CARD, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 3, name: "Walker" }, "walker")
      .hand(P1, FODDER, "fodder0")
      .build();
    expect(game.state("leblanc").isExhausted).toBe(true);
    await game.p1.move("walker", "bf1");
    await untilPrompt(game);
    const d = game.decision();
    const acceptable = d?.kind === "yes-no" && d.seat === P1 && d.canAccept !== false;
    expect(acceptable).toBe(false);
    await game.settle({ policy: "first" });
    expect(game.p1.hand()).toEqual(["fodder0"]);
  });

  // BUG — expected: two conquers in one turn — the first acceptance exhausts Deceiver, so at the second conquer
  // the offer can no longer be taken and the second hand card stays. Actual: no cost is ever paid, both offers
  // are freely acceptable.
  test("once per exhaust — after paying for the first conquer, the second conquer this turn cannot be accepted", async () => {
    const game = await conquerBoard(2).unit(P1, "base", { might: 2, name: "Runner" }, "runner").build();
    await game.p1.move("walker", "bf1");
    await untilPrompt(game);
    await accept(game, ["fodder0", "walker"]);
    await game.settle({ policy: "first" });
    expect(game.state("leblanc").isExhausted).toBe(true);
    expect(game.p1.hand()).toHaveLength(1);
    await game.p1.move("runner", "bf2");
    await untilPrompt(game);
    const d = game.decision();
    const acceptable = d?.kind === "yes-no" && d.seat === P1 && d.canAccept !== false;
    expect(acceptable).toBe(false);
    await game.settle({ policy: "first" });
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.points()).toBe(2);
  });

  test("HOLD (469.2): controlling bf1 into my Beginning Phase scores and raises the same 'you may' during the beginning phase; declining leaves everything as is", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .legend(P1, CARD, "leblanc")
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .hand(P1, FODDER, "fodder0")
      .build();
    await game.p2.endTurn();
    await untilPrompt(game);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "leblanc", triggered: true })]);
    await game.p1.no();
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.hand()).toContain("fodder0");
    expect(game.state("leblanc").isExhausted).toBe(false);
    expect(game.state("holder").keywords).toEqual([]);
  });

  // BUG — expected: accepting on HOLD makes a ready 3-Might "Holder" copy at bf1 (two P1 units there). Actual: no token.
  test("accepting on hold plays the ready Reflection copy AT the held battlefield (bf1 now has Holder + a 3-Might token 'Holder')", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .legend(P1, CARD, "leblanc")
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .hand(P1, FODDER, "fodder0")
      .build();
    await game.p2.endTurn();
    await untilPrompt(game);
    await accept(game, ["fodder0", "holder"]);
    await game.settle({ policy: "first" });
    expect(game.phase()).toBe("main");
    const toks = tokensAt(game, "bf1");
    expect(toks).toHaveLength(1);
    expect(game.state(toks[0]!)).toMatchObject({ isReady: true, might: 3, name: "Holder" });
    expect(game.p1.units("bf1")).toHaveLength(2);
  });

  // BUG — expected: with TWO friendly units at the conquered battlefield (Walker 3 + Brute 5 move in together),
  // "another unit there" is a choice — picking the Brute yields a 5-Might "Brute" token. Actual: no token.
  test("'a copy of ANOTHER unit there' — with Walker (3) and Brute (5) both there, P1 picks the Brute and gets a ready 5-Might 'Brute' token at bf1", async () => {
    const game = await conquerBoard().unit(P1, "base", { might: 5, name: "Brute" }, "brute").build();
    await game.p1.move(["walker", "brute"], "bf1");
    await untilPrompt(game);
    await accept(game, ["fodder0", "brute"]);
    await game.settle();
    await accept(game, ["brute"]).catch(() => undefined);
    await game.settle();
    const toks = tokensAt(game, "bf1");
    expect(toks).toHaveLength(1);
    expect(game.state(toks[0]!)).toMatchObject({ isReady: true, might: 5, name: "Brute" });
    expect(game.state("brute").keywords).not.toContain("Temporary");
    expect(game.state("walker").keywords).not.toContain("Temporary");
  });

  // BUG — expected (816 + 186.1): the Reflection dies at the START of P1's next Beginning Phase, before scoring —
  // so if the Walker walks on to bf2 and leaves the token alone on bf1, P1 does NOT hold bf1 next turn (only bf2),
  // and the token has ceased to exist. Actual: no token is ever made (and the Walker is the one given Temporary).
  test("[Temporary] — the lone Reflection left on bf1 is killed before scoring at P1's next turn start: P1 holds only bf2 (+1, not +2) and the token is gone", async () => {
    const game = await conquerBoard().build();
    await game.p1.move("walker", "bf1");
    await untilPrompt(game);
    await accept(game, ["fodder0", "walker"]);
    await game.settle({ policy: "first" });
    const toks = tokensAt(game, "bf1");
    expect(toks).toHaveLength(1);
    const tok = toks[0]!;
    // Next turn cycle: Walker readies and gank-walks... simpler: it stays; instead check the token's own clock.
    await game.advanceTurn(); // → P2
    expect(game.zoneOf(tok)).toBe("battlefield-bf1"); // survives the opponent's turn
    const pointsBefore = game.p1.points();
    await game.advanceTurn(); // → P1: Temporary kill happens before the Hold is scored
    expect(game.turnPlayer()).toBe(P1);
    expect(game.has(tok) ? game.zoneOf(tok) : "gone").not.toBe("battlefield-bf1");
    expect(game.zoneOf("walker")).toBe("battlefield-bf1"); // the real Walker still holds → exactly +1
    expect(game.p1.points()).toBe(pointsBefore + 1);
  });

  test("only YOUR conquers: P2 walking onto an open battlefield scores for P2 and never asks P1 anything; P1's hand and legend are untouched", async () => {
    const game = await scenario()
      .active(P2)
      .legend(P1, CARD, "leblanc")
      .battlefield("bf1", { controller: null })
      .unit(P2, "base", { might: 3, name: "Their Walker" }, "theirs")
      .hand(P1, FODDER, "fodder0")
      .build();
    await game.p2.move("theirs", "bf1");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.p2.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toEqual(["fodder0"]);
    expect(game.state("leblanc").isExhausted).toBe(false);
  });
});
