/**
 * Ruling 06508e420823f192 — Deceiver (UNL-199 → unl-199-219) · Legend (LeBlanc) · Mind/Order
 *   "When you conquer or hold, you may discard 1 and exhaust me to play a ready Reflection unit token there.
 *    It becomes a copy of another unit there. Give it [Temporary]."
 *   × Reflection token (unl-t06): 0-Might unit token that becomes a copy of something when played.
 *
 * Q: When can LeBlanc's Legend ability be used?
 * A: Only when its trigger condition is met — when you conquer or hold. It is a triggered (not activated)
 *    ability: optional ("you may"); its cost (discard 1 + exhaust the legend) must be paid in full to put it on
 *    the chain (no cards in hand → cannot use it); once on the chain the state is Closed so both players may
 *    React; the copy source is chosen when that part resolves (reflexive), and with no other unit there the
 *    token simply has nothing to copy.
 * Rules: 383.3.a (optional trigger), 383.3.b/.b.1 (cost within instructions = base cost, paid to finalize),
 *        469.1/469.2 (conquer / hold), 330–332 (Closed state, Reactions), 359.2 (referents on resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DECEIVER = "unl-199-219";
const GUST = "ogn-169-298"; // P2's Reaction: "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
const FODDER = "ogn-175-298"; // vanilla card to discard

/** P1's turn. Deceiver legend; open bf1; Walker (3) ready in base; `hand` fodder cards; P2 holds Gust + [1]. */
function conquerBoard(hand = 1) {
  const b = scenario()
    .legend(P1, DECEIVER, "leblanc")
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 3, name: "Walker" }, "walker")
    .resources(P2, { energy: 1 })
    .hand(P2, GUST, "gust");
  for (let i = 0; i < hand; i++) {
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

/** Accept the offer and answer P1's immediate cost picks (the discard), preferring `prefs`. */
async function accept(game: Game, prefs: string[] = []): Promise<string[]> {
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  await game.p1.yes();
  const asked: string[] = [];
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind !== "pick" || d.seat !== P1 || d.options.length === 0) {
      break;
    }
    asked.push(d.options.map((o) => o.card ?? o.key).sort().join("|"));
    const want = prefs.find((p) => d.options.some((o) => (o.card ?? o.key) === p)) ?? (d.options[0]?.key as string);
    await game.p1.pick(want);
  }
  return asked;
}

const tokensAt = (game: Game, loc: string) => game.cardsAt(loc).filter((id) => game.state(id).isToken);

describe("Ruling 06508e420823f192 — Deceiver is a conquer/hold TRIGGER with an up-front cost, not an activated ability", () => {
  test("it cannot be activated manually: in P1's open main phase there is no 'activate' option on the legend", async () => {
    const game = await conquerBoard().build();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.legal().some((o) => o.verb === "activate" && o.card === "leblanc")).toBe(false);
    expect(game.p1.can("activate", "leblanc")).toBe(false);
  });

  test("trigger condition — CONQUER: walking onto open bf1 conquers (+1) and puts Deceiver's trigger on the chain as an optional 'you may' for P1 (383.3.a)", async () => {
    const game = await conquerBoard().build();
    await game.p1.move("walker", "bf1");
    await untilPrompt(game);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "leblanc", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
  });

  test("trigger condition — HOLD: controlling bf1 into P1's Beginning Phase scores and raises the same optional trigger", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .legend(P1, DECEIVER, "leblanc")
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .hand(P1, FODDER, "fodder0")
      .build();
    await game.p2.endTurn();
    await untilPrompt(game);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "leblanc", triggered: true })]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  });

  test("optional: declining removes the trigger — nothing discarded, legend ready, no token", async () => {
    const game = await conquerBoard().build();
    await game.p1.move("walker", "bf1");
    await untilPrompt(game);
    await game.p1.no();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toEqual(["fodder0"]);
    expect(game.state("leblanc").isExhausted).toBe(false);
    expect(tokensAt(game, "bf1")).toEqual([]);
  });

  test("cost: accepting discards 1 (P1 picks which) and exhausts Deceiver UP FRONT; the item then sits on a Closed chain where P2 holds priority and may React (383.3.b.1)", async () => {
    const game = await conquerBoard(2).build();
    await game.p1.move("walker", "bf1");
    await untilPrompt(game);
    const asked = await accept(game, ["fodder1"]);
    expect(asked[0]).toBe("fodder0|fodder1"); // the discard is a real choice among hand cards
    if (game.decision()?.kind === "action" && game.decision()?.seat === P1) {
      await game.p1.pass();
    }
    expect(game.zoneOf("fodder1")).toBe("trash");
    expect(game.p1.hand()).toEqual(["fodder0"]);
    expect(game.state("leblanc").isExhausted).toBe(true);
    // Closed state: the trigger is still pending and P2 may respond with a Reaction (Gust is legal here).
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "leblanc", triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "gust")).toBe(true);
    expect(tokensAt(game, "bf1")).toEqual([]); // nothing has resolved yet
  });

  test("cost must be payable in full: with NO cards in hand the option cannot be taken (absent or canAccept:false), and settling makes no token", async () => {
    const game = await conquerBoard(0).build();
    await game.p1.move("walker", "bf1");
    await untilPrompt(game);
    const d = game.decision();
    const acceptable = d?.kind === "yes-no" && d.seat === P1 && d.canAccept !== false;
    expect(acceptable).toBe(false);
    await game.settle();
    await game.settle();
    expect(game.state("leblanc").isExhausted).toBe(false);
    expect(tokensAt(game, "bf1")).toEqual([]);
    expect(game.p1.points()).toBe(1);
  });

  test("resolution: a READY Reflection token appears AT bf1 as a 3-Might 'Walker' copy with [Temporary]; the Walker itself is untouched", async () => {
    const game = await conquerBoard().build();
    await game.p1.move("walker", "bf1");
    await untilPrompt(game);
    await accept(game, ["fodder0"]);
    await game.settle({ policy: "first" }); // P2 passes; copy source (only Walker) taken if asked
    const toks = tokensAt(game, "bf1");
    expect(toks).toHaveLength(1);
    expect(game.state(toks[0] as string)).toMatchObject({ controller: P1, isReady: true, isToken: true, might: 3, name: "Walker" });
    expect(game.state(toks[0] as string).keywords).toContain("Temporary");
    expect(game.state("walker").keywords).not.toContain("Temporary");
    expect(tokensAt(game, "base")).toEqual([]);
  });

  // rule 359.2 / 387 — "It becomes a copy of another unit there" is a REFLEXIVE follow-up sentence, so its
  // object is named only as that instruction resolves; 383.3.b.1 finalization locks in the base cost (the
  // discard) and nothing else, and P2 gets its React window in between (ruling 40ecc1be71f6fc76 covers what
  // happens when P2 removes the intended source in that window).
  test("copy source is chosen at RESOLUTION (359.2) — finalization asks only the discard, and P2 Reacts before the pick", async () => {
    const game = await conquerBoard().unit(P1, "base", { might: 5, name: "Brute" }, "brute").build();
    await game.p1.move(["walker", "brute"], "bf1");
    await untilPrompt(game);
    const asked = await accept(game, ["fodder0"]);
    expect(asked.some((a) => a.includes("walker") && a.includes("brute"))).toBe(false);
    if (game.decision()?.kind === "action" && game.decision()?.seat === P1) {
      await game.p1.pass();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.settle();
    const copyPick = game.decision();
    expect(copyPick).toMatchObject({ kind: "pick", seat: P1 });
    expect(copyPick?.kind === "pick" ? copyPick.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["brute", "walker"]);
    await game.p1.pick("brute");
    await game.settle();
    const toks = tokensAt(game, "bf1");
    expect(toks).toHaveLength(1);
    expect(game.state(toks[0] as string)).toMatchObject({ isReady: true, might: 5, name: "Brute" });
  });

  test("no other unit there at resolution (P2 Gusts the Walker home in response): the token still enters at bf1 but has nothing to copy — a 0-Might Reflection with [Temporary]", async () => {
    const game = await conquerBoard().build();
    await game.p1.move("walker", "bf1");
    await untilPrompt(game);
    await accept(game, ["fodder0"]);
    if (game.decision()?.kind === "action" && game.decision()?.seat === P1) {
      await game.p1.pass();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.cast("gust", { targets: "walker" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["leblanc", "gust"]);
    await game.settle({ policy: "first" });
    expect(game.zoneOf("walker")).toBe("hand");
    const toks = tokensAt(game, "bf1");
    expect(toks).toHaveLength(1);
    expect(game.state(toks[0] as string)).toMatchObject({ controller: P1, isToken: true, might: 0, name: "Reflection" });
    expect(game.state(toks[0] as string).keywords).toContain("Temporary");
    expect(game.violations()).toEqual([]);
  });
});
