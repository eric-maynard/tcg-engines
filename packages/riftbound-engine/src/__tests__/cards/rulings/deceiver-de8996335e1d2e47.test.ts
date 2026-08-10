/**
 * Ruling de8996335e1d2e47 — Deceiver (UNL-199 → unl-199-219) · Legend (LeBlanc)
 *     "When you conquer or hold, you may discard 1 and exhaust me to play a ready Reflection unit token there. It becomes
 *      a copy of another unit there. Give it [Temporary]."
 *   × Gust (ogn-169-298) · Reaction · 1 · "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   × Reflection token (unl-t06)
 *
 * Q: How many times can I react during LeBlanc, Deceiver's effect, and in which windows can Gust be played?
 * A: No fixed limit — the trigger uses the chain, and while it is pending players alternate adding Reactions until both
 *    pass. Windows: (1) in response to the trigger before it resolves; the token entering cannot itself be reacted to;
 *    (riftjudge's own reading, self-flagged as interpretation:) (2) "It becomes a copy" would be a reflexive follow-up
 *    item giving a second window before the copy happens.
 * Rules: 383.3.a/b (optional trigger, cost paid to finalize), 330–332 (Closed state / Reactions), 336–339 (LIFO),
 *        387.1 (Reflexive Triggers are recognised by "Do this:"), 359.2.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DECEIVER = "unl-199-219";
const GUST = "ogn-169-298";
const FODDER = "ogn-175-298";

/** P1's turn. Deceiver legend; open bf1; Walker (3) + Pal (2) ready in base; one fodder card to discard. P2: two Gusts + [2]. */
function board() {
  return scenario()
    .legend(P1, DECEIVER, "leblanc")
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 3, name: "Walker" }, "walker")
    .unit(P1, "base", { might: 2, name: "Pal" }, "pal")
    .hand(P1, FODDER, "fodder")
    .resources(P2, { energy: 2 })
    .hand(P2, GUST, "gust1")
    .hand(P2, GUST, "gust2");
}

const tokensAt = (game: Game, loc: string) => game.cardsAt(loc).filter((id) => game.state(id).isToken);

/**
 * Walker + Pal walk onto open bf1; both pass Focus → conquer → Deceiver's optional trigger: P1 accepts, discards the
 * fodder (cost paid at finalization) and passes priority. Stops with the finalized trigger on the chain and P2 to act.
 */
async function triggerPendingP2ToAct(): Promise<Game> {
  const game = await board().build();
  await game.p1.move(["walker", "pal"], "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
  await game.p1.yes();
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick("fodder");
  }
  expect(game.zoneOf("fodder")).toBe("trash");
  expect(game.state("leblanc").isExhausted).toBe(true);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "leblanc", controller: P1, triggered: true })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling de8996335e1d2e47 — window 1: reacting to Deceiver's trigger while it is on the chain", () => {
  test("the trigger is a chain item in a Closed state: P2 holds priority over it and Gust is a legal play right now", async () => {
    const game = await triggerPendingP2ToAct();
    expect(game.p2.can("cast", "gust1")).toBe(true);
    expect(tokensAt(game, "bf1")).toEqual([]); // nothing has resolved yet
  });

  test("no fixed limit on reactions: P2 Gusts the Walker, priority goes round, and P2 may add a SECOND Gust (on Pal) to the same chain — three items deep", async () => {
    const game = await triggerPendingP2ToAct();
    await game.p2.cast("gust1", { targets: "walker" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["leblanc", "gust1"]);
    // After a play the player keeps/gets priority passes around: whoever holds it, get back to P2 without resolving gust1.
    if (game.decision()?.seat === P2) {
      expect(game.p2.can("cast", "gust2")).toBe(true);
    } else {
      await game.p1.passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "gust2")).toBe(true);
    await game.p2.cast("gust2", { targets: "pal" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["leblanc", "gust1", "gust2"]);
  });

  test("LIFO: a Gust played in this window resolves BEFORE the trigger — Walker is back in hand while Deceiver's item is still waiting", async () => {
    const game = await triggerPendingP2ToAct();
    await game.p2.cast("gust1", { targets: "walker" });
    for (let i = 0; i < 6 && game.chain().some((c) => c.cardId === "gust1"); i++) {
      const d = game.decision();
      if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(game.zoneOf("walker")).toBe("hand");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "leblanc", triggered: true })]);
    expect(tokensAt(game, "bf1")).toEqual([]);
  });
});

describe("Ruling de8996335e1d2e47 — resolution: the token's entry is not a window; the copy", () => {
  // RULING-CONFLICT: riftjudge de8996335e1d2e47 (self-described interpretation) says "It becomes a copy of another unit
  // there" is a reflexive trigger that goes on the chain as a separate item, opening a second Gust window before the
  // token copies anything; CR 387.1 says Reflexive Triggers are recognised by "Do this:" / "Do one of the following:",
  // which Deceiver's text does not use — engine follows CR (and ruling 06508e420823f192): the copy source is named as the
  // ONE item resolves, no new chain item is created and P2 gets no priority between the token entering and it copying.
  test("both pass on the trigger: the Reflection enters bf1 and P1 is asked AT RESOLUTION which unit there to copy — the chain is already empty, no reflexive item exists and P2 has nothing legal (no second window)", async () => {
    const game = await triggerPendingP2ToAct();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, timing: "RES" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["pal", "walker"]);
    expect(game.chain()).toEqual([]);
    expect(game.p2.legal()).toEqual([]);
    expect(game.p2.can("cast", "gust1")).toBe(false);
    await game.p1.pick("walker");
    const toks = tokensAt(game, "bf1");
    expect(toks).toHaveLength(1);
    expect(game.state(toks[0] as string)).toMatchObject({ isReady: true, isToken: true, might: 3, name: "Walker" });
    expect(game.state(toks[0] as string).keywords).toContain("Temporary");
    // Straight back to P1's open main phase: the next thing P2 could Gust is in a NEW open-state chain, not "window 2".
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
