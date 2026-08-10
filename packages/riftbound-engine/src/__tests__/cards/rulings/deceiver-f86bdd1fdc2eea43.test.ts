/**
 * Ruling f86bdd1fdc2eea43 — Deceiver (UNL-199 → unl-199-219) · Legend (LeBlanc)
 *   "When you conquer or hold, you may discard 1 and exhaust me to play a ready Reflection unit token there. It
 *    becomes a copy of another unit there. Give it [Temporary]."
 *   × Gust (OGN-169 → ogn-169-298) · Reaction [1] — "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   × Reflection token (unl-t06).
 *
 * Q: Can you react to LeBlanc, Deceiver's ability? When?
 * A: Yes — it is a triggered ability, so it goes on the chain (Closed state) and Reactions can be played before it
 *    resolves. The discard + exhaust are COSTS paid when the trigger is taken (unpayable ⇒ never chained). The token
 *    entering play itself cannot be reacted to. The ruling additionally describes a SECOND window: a "reflexive
 *    trigger" for "It becomes a copy…" placed on the chain after the token exists.
 * Rules: 383.3.a/b (optional trigger, base cost at finalization), 330–332 (Closed state / Reactions), 359.2 (permanents
 *        finalize immediately), 387.1 (Reflexive Triggers are written "Do this:").
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DECEIVER = "unl-199-219";
const GUST = "ogn-169-298";
const FODDER = "ogn-175-298";

/** P1's turn. Deceiver legend (ready); open bf1; Walker (3) + Brute (5) ready in base; `hand` fodder; P2 has Gust + [1]. */
function board(hand = 1) {
  const b = scenario()
    .legend(P1, DECEIVER, "leblanc")
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: null })
    .unit(P1, "base", { might: 3, name: "Walker" }, "walker")
    .unit(P1, "base", { might: 5, name: "Brute" }, "brute")
    .resources(P2, { energy: 1 })
    .hand(P2, GUST, "gust");
  for (let i = 0; i < hand; i++) {
    b.hand(P1, FODDER, `fodder${i}`);
  }
  return b;
}

const tokensAt = (game: Game, loc: string) => game.cardsAt(loc).filter((id) => game.state(id).isToken);

/** Pass focus/priority until a non-action prompt or the open main phase. */
async function untilPrompt(game: Game): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context === "main") {
      return;
    }
    await game.seat(d.seat).pass();
  }
}

/** Walker + Brute conquer bf1; P1 accepts Deceiver (discarding fodder0); returns with the item on the chain. */
async function conquerAndAccept(): Promise<Game> {
  const game = await board().build();
  await game.p1.move(["walker", "brute"], "bf1");
  await untilPrompt(game);
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.p1.points()).toBe(1);
  expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, timing: "FIN" });
  await game.p1.yes();
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind !== "pick" || d.seat !== P1) {
      break;
    }
    await game.p1.pick(d.options[0]?.key as string);
  }
  if (game.decision()?.kind === "action" && game.decision()?.seat === P1) {
    await game.p1.passPriority();
  }
  return game;
}

describe("Ruling f86bdd1fdc2eea43 — Deceiver's trigger uses the chain: costs up front, then a Reaction window before it resolves", () => {
  test("conquering raises the optional trigger; accepting PAYS the costs immediately (fodder discarded, legend exhausted) and leaves the ability on a Closed chain", async () => {
    const game = await conquerAndAccept();
    expect(game.zoneOf("fodder0")).toBe("trash");
    expect(game.p1.hand()).toEqual([]);
    expect(game.state("leblanc").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "leblanc", controller: P1, triggered: true, type: "ability" })]);
    expect(tokensAt(game, "bf1")).toEqual([]); // nothing resolved yet
  });

  test("window 1: with the trigger on the chain P2 holds priority and CAN react — Gust (Reaction) on the 3-Might Walker is legal and stacks on top", async () => {
    const game = await conquerAndAccept();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "walker" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["leblanc", "gust"]);
    await game.settle({ policy: "first" }); // Gust first (Walker home), then the token copies what is left (Brute)
    expect(game.zoneOf("walker")).toBe("hand");
    const toks = tokensAt(game, "bf1");
    expect(toks).toHaveLength(1);
    expect(game.state(toks[0] as string)).toMatchObject({ controller: P1, isReady: true, isToken: true, might: 5, name: "Brute" });
    expect(game.state(toks[0] as string).keywords).toContain("Temporary");
  });

  test("costs gate the trigger: with NO card to discard the offer cannot be accepted, nothing is chained for P2 to react to, legend stays ready, no token", async () => {
    const game = await board(0).build();
    await game.p1.move(["walker", "brute"], "bf1");
    await untilPrompt(game);
    const d = game.decision();
    expect(d?.kind === "yes-no" && d.seat === P1 && d.canAccept !== false).toBe(false);
    await game.settle();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("leblanc").isExhausted).toBe(false);
    expect(tokensAt(game, "bf1")).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // RULING-CONFLICT: riftjudge f86bdd1fdc2eea43 says "It becomes a copy of another unit there" is a separate REFLEXIVE
  // trigger placed on the chain after the token is created, giving a second Reaction window before the copy happens;
  // CR 387.1 says Reflexive Triggers are recognised by "Do this:" (Deceiver has none) — the engine resolves the copy as
  // part of the same ability (source chosen at resolution, 359.2), so once the item resolves the chain is EMPTY and the
  // token is already the copy. Engine follows CR (see also ruling test deceiver-06508e420823f192).
  test("no second chain item: when the ability resolves P1 picks the copy source at resolution and the token is at once a ready 'Brute' copy — the chain is empty, P2 gets no further window before the copy", async () => {
    const game = await conquerAndAccept();
    await game.p2.passPriority(); // both passed → the ability resolves now
    // The token entering play is not a chain event; the only thing asked is P1's resolution-time copy source.
    const pick = game.decision();
    expect(pick).toMatchObject({ kind: "pick", seat: P1 });
    expect(pick?.kind === "pick" ? pick.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["brute", "walker"]);
    expect(game.p2.can("cast", "gust")).toBe(false); // not P2's window
    await game.p1.pick("brute");
    expect(game.chain()).toEqual([]);
    const toks = tokensAt(game, "bf1");
    expect(toks).toHaveLength(1);
    expect(game.state(toks[0] as string)).toMatchObject({ isReady: true, isToken: true, might: 5, name: "Brute" });
    expect(game.state(toks[0] as string).keywords).toContain("Temporary");
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
