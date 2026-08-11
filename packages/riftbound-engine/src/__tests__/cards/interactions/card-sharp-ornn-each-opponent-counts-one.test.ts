/**
 * Interaction: Card Sharp (sfd-081-221) · Unit · Mind · 3 · 3 Might
 *     "When you play me, you and each opponent may play a Gold gear token exhausted. For each opponent
 *      who did, you play a Gold gear token exhausted."
 *   × Ornn, Forge God (sfd-085-221) · Champion unit · Mind · 6 · 4 Might
 *     "[Deflect 2] [Weaponmaster] I have +1 [Might] for each friendly gear."
 *   × Gold token (sfd-t01) · gear token · "[Reaction] Kill this, [Exhaust]: [Add] [rainbow]"
 *
 * Rules: 485.2 / 483.2.b (a Duel has exactly ONE opponent — "each opponent" = {P2}, never nobody and
 * never "each player"), 383.3 (the play effect is one triggered chain item), 383.3.a.3 (a "may" that is
 * not a bare leading "you may" — here it is distributed over "you and each opponent" — is a per-player
 * optional instruction decided as the ability resolves), 398, 136 / 187.5 (a Gold token is a gear, so it
 * counts for "each friendly gear"), 740.1.a (friendly = same controller).
 *
 * Question — P1 controls Ornn (4) and no gear; P2 has no gear. P1 plays Card Sharp:
 *  (a) P1 accepts, P2 accepts: token counts, Ornn's Might, and whose Decision was the opponent's accept?
 *  (b) P1 accepts, P2 declines.
 *  (c) P1 declines, P2 accepts.
 * Guard against the 2-player shortcuts: P2 never asked / bonus never paid; "for each opponent who did"
 * counting P1's own acceptance; the bonus token going to P2.
 *
 * Expected: two independent may-choices (P1's, then P2's — P2's OWN Decision), each making that player's
 * own exhausted Gold; then P1 alone gets one more per opponent who accepted (0 or 1 in a Duel).
 *  (a) P1 2 Gold, P2 1 Gold, Ornn 4 + 2 = 6.  (b) P1 1, P2 0, Ornn 5.  (c) P1 1 (the bonus only), P2 1, Ornn 5.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CARD_SHARP = "sfd-081-221";
const ORNN = "sfd-085-221";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** P1's turn: Ornn (4, no gear around) in P1's base, Card Sharp in hand with exactly 3 energy; P2 has a vanilla bystander and no gear. */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .unit(P1, "base", ORNN, "ornn")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .hand(P1, CARD_SHARP, "sharp");
}

const goldOf = (game: Game, seat: string) => game.seat(seat).base().filter((id) => game.state(id).name === "Gold");

/** Play Card Sharp and answer every yes/no (any seat) with `accept(seat)`; returns the seats asked, in order. */
async function playSharp(game: Game, accept: (seat: string) => boolean): Promise<string[]> {
  const asked: string[] = [];
  await game.p1.play("sharp");
  for (let i = 0; i < 8; i++) {
    await game.settle();
    const d = game.decision();
    if (d?.kind !== "yes-no") {
      break;
    }
    asked.push(d.seat);
    await (accept(d.seat) ? game.seat(d.seat).yes() : game.seat(d.seat).no());
  }
  await game.settle();
  return asked;
}

describe("setup", () => {
  test("Ornn with no friendly gear is a plain 4; Card Sharp costs exactly 3 and its play effect is ONE triggered chain item (383.3)", async () => {
    const game = await board().build();
    expect(game.state("ornn").might).toBe(4);
    expect(game.p1.gear()).toEqual([]);
    expect(game.p2.gear()).toEqual([]);
    await game.p1.play("sharp");
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("sharp")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sharp", controller: P1, triggered: true })]);
    expect(goldOf(game, P1)).toEqual([]);
  });
});

describe("(a) P1 accepts, P2 accepts", () => {
  test("exactly two may-prompts, P1's then P2's — the opponent's accept is P2's OWN Decision, not P1's (485.2: the opponent set is {P2})", async () => {
    const game = await board().build();
    await game.p1.play("sharp");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    expect(game.actingSeat()).toBe(P2);
    // P1 cannot answer for the opponent.
    expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
    await game.p2.yes();
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("P1 ends with 1 (own) + 1 (one opponent did) = 2 Gold, P2 with exactly 1 — the bonus goes to P1, never to P2, and never counts P1's own acceptance", async () => {
    const game = await board().build();
    const asked = await playSharp(game, () => true);
    expect(asked).toEqual([P1, P2]);
    expect(goldOf(game, P1)).toHaveLength(2);
    expect(goldOf(game, P2)).toHaveLength(1);
    for (const id of [...goldOf(game, P1), ...goldOf(game, P2)]) {
      expect(game.state(id)).toMatchObject({ cardType: "gear", isExhausted: true, isToken: true, name: "Gold" });
    }
    expect(game.state(goldOf(game, P2)[0] as string)).toMatchObject({ controller: P2, owner: P2 });
    expect(goldOf(game, P1).every((id) => game.state(id).controller === P1)).toBe(true);
  });

  test("Ornn counts friendly gear = 2 → 4 + 2 = 6 Might (P2's Gold is not friendly to Ornn, 740.1.a)", async () => {
    const game = await board().build();
    await playSharp(game, () => true);
    expect(game.p1.gear()).toHaveLength(2);
    expect(game.state("ornn").might).toBe(6);
    expect(game.state("bystander").might).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});

describe("(b) P1 accepts, P2 declines", () => {
  test("P2 is still ASKED (each opponent decides for themself) and says no → P1 exactly 1 Gold, P2 none, no bonus token", async () => {
    const game = await board().build();
    const asked = await playSharp(game, (seat) => seat === P1);
    expect(asked).toEqual([P1, P2]);
    expect(goldOf(game, P1)).toHaveLength(1);
    expect(goldOf(game, P2)).toEqual([]);
  });

  test("Ornn: one friendly gear → 5 Might", async () => {
    const game = await board().build();
    await playSharp(game, (seat) => seat === P1);
    expect(game.state("ornn").might).toBe(5);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});

describe("(c) P1 declines, P2 accepts", () => {
  // rule 383.3.a.3 — the "may" is distributed over "you AND EACH OPPONENT", so it is a per-player
  // optional instruction on resolution, not the whole-ability opt-in of 383.3.a: after P1 says no, P2 is
  // still asked; P2 accepts → P2 1 Gold, and "for each opponent who did" pays P1 one bonus Gold → P1 1,
  // Ornn 5.
  test("P2 must still get its own may-prompt after P1 declines (the two choices are independent)", async () => {
    const game = await board().build();
    const asked = await playSharp(game, (seat) => seat === P2);
    expect(asked).toEqual([P1, P2]);
  });

  test("P2 accepting gives P2 its own Gold AND pays P1 the 'for each opponent who did' bonus — P1 1 Gold, P2 1 Gold (P1's own refusal is irrelevant to the count)", async () => {
    const game = await board().build();
    await playSharp(game, (seat) => seat === P2);
    expect(goldOf(game, P2)).toHaveLength(1);
    expect(goldOf(game, P1)).toHaveLength(1);
    expect(game.state(goldOf(game, P1)[0] as string)).toMatchObject({ controller: P1, isExhausted: true, isToken: true });
  });

  test("Ornn should then read 5 (one friendly gear — the bonus Gold)", async () => {
    const game = await board().build();
    await playSharp(game, (seat) => seat === P2);
    expect(game.state("ornn").might).toBe(5);
  });

  test("in no line does P2 ever receive a bonus token: P1 declining leaves P2 with at most its own single Gold", async () => {
    const game = await board().build();
    await playSharp(game, (seat) => seat === P2);
    expect(goldOf(game, P2).length).toBeLessThanOrEqual(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});

describe("(d) both decline — control line", () => {
  test("no Gold anywhere, Ornn stays 4, Card Sharp is simply a 3-Might unit in base", async () => {
    const game = await board().build();
    await playSharp(game, () => false);
    expect(goldOf(game, P1)).toEqual([]);
    expect(goldOf(game, P2)).toEqual([]);
    expect(game.state("ornn").might).toBe(4);
    expect(game.state("sharp")).toMatchObject({ might: 3, zone: "base" });
    expect(game.chain()).toEqual([]);
  });
});
