/**
 * Ruling dc3652d20f7a2004 — (scraped under "Shadow" UNL-194, but the cards are:)
 *   Rek'Sai, Breacher (SFD-029 → sfd-029-221) · Unit · Fury · 3 · "[Accelerate] [Assault] Friendly units played from anywhere
 *     other than a player's hand have [Accelerate]."
 *   × Death Mark (VEN-144 → ven-144-166) · Spell · 2 + [rainbow] · "[Burn 3]. Play a 0 [Might] Shadow Clone unit token. … [Flow]"
 *
 * Q: Does "red Rek'Sai" work for Shadow Clone tokens such as Death Mark's — can the token Accelerate?
 * A: Yes. The token is played from somewhere other than a hand, so Rek'Sai grants it Accelerate; during that play you may
 *    pay the optional 1 Energy + 1 Power and it enters READY; if you don't, it enters exhausted as normal.
 *    (The ruling's aside that the Power must be "Shadow" Power is moot here: engine tokens are domainless → any Power, 805.1.a.2.)
 * Rules: 805.1.a / 805.2 / 805.6 (Accelerate = optional additional cost at play → enters ready), 143.4, 185.2.a / 350.2
 *        (tokens are PLAYED), 356.1.b.3.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const REKSAI_BREACHER = "sfd-029-221";
const DEATH_MARK = "ven-144-166";

/** P1's turn: Death Mark in hand; [3] + 1 rainbow (the spell's 2+[rainbow]) + 1 fury (exactly one Accelerate payment). */
function board(opts: { reksai?: boolean } = {}) {
  const s = scenario().resources(P1, { energy: 3, power: { fury: 1, rainbow: 1 } }).hand(P1, DEATH_MARK, "dm");
  return opts.reksai === false ? s : s.unit(P1, "base", REKSAI_BREACHER, "reksai");
}

const clones = (game: Game) => game.findAll({ name: "Shadow Clone", owner: P1 }).filter((id) => game.zoneOf(id) !== "gone");

describe("Ruling dc3652d20f7a2004 — Rek'Sai, Breacher lets Death Mark's Shadow Clone token Accelerate", () => {
  test("control (no Rek'Sai): Death Mark burns 3 and plays the 0-Might Shadow Clone EXHAUSTED with no Accelerate question; the spare [1]+fury is untouched", async () => {
    const game = await board({ reksai: false }).build();
    const deckBefore = game.p1.deck().length;
    await game.p1.cast("dm");
    expect([game.p1.energy(), game.p1.power()]).toEqual([1, 1]);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.p1.deck()).toHaveLength(deckBefore - 3); // [Burn 3]
    const [tok] = clones(game);
    expect(tok).toBeDefined();
    expect(game.state(tok as string)).toMatchObject({ isExhausted: true, isToken: true, might: 0, zone: "base" });
    expect([game.p1.energy(), game.p1.power()]).toEqual([1, 1]);
    expect(game.zoneOf("dm")).toBe("trash");
  });

  test("with Rek'Sai out, Death Mark's resolution pauses at the token's play to ask P1 whether to pay Accelerate — the token is played from no hand", async () => {
    const game = await board().build();
    await game.p1.cast("dm");
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    expect(game.decision()?.prompt ?? "").toMatch(/Accelerate/i);
    expect(clones(game)).toHaveLength(0); // still mid-play: the election is part of the token's own play
    expect([game.p1.energy(), game.p1.power()]).toEqual([1, 1]);
  });

  test("paying it (1 Energy + 1 Power): the Shadow Clone enters READY and the pool is empty", async () => {
    const game = await board().build();
    await game.p1.cast("dm");
    await game.settle();
    await game.p1.yes();
    await game.settle();
    const [tok] = clones(game);
    expect(game.state(tok as string)).toMatchObject({ isReady: true, isToken: true, might: 0, zone: "base" });
    expect([game.p1.energy(), game.p1.power()]).toEqual([0, 0]);
    expect(game.zoneOf("dm")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("declining it: the token enters EXHAUSTED as normal and nothing extra is spent", async () => {
    const game = await board().build();
    await game.p1.cast("dm");
    await game.settle();
    await game.p1.no();
    await game.settle();
    const [tok] = clones(game);
    expect(game.state(tok as string)).toMatchObject({ isExhausted: true, isToken: true, zone: "base" });
    expect([game.p1.energy(), game.p1.power()]).toEqual([1, 1]);
  });
});
