/**
 * Faithful Manufactor — ogn-211-298 · Unit · Order · 3 energy · 2 Might
 *
 *   When you play me, play a 1 [Might] Recruit unit token here.
 *
 * Rules: 383 (play trigger on the chain), 187.1 (a 1 [M] Recruit token is a domainless 1-Might
 * unit token), 439.2.c ("play a token" creates it via the chain to the specified location —
 * "here" = the Manufactor's location), 143.4 (units — tokens included — enter exhausted).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-211-298";

function inHand(energy = 3) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .hand(P1, CARD, "fm");
}

type Built = Awaited<ReturnType<ReturnType<typeof inHand>["build"]>>;
const tokensAt = (game: Built, loc: "base" | "bf1" | "bf2", seat = game.p1) =>
  seat.units(loc).filter((u) => game.state(u).isToken);

describe("Faithful Manufactor (ogn-211-298)", () => {
  test("costs 3 energy (no power); a 2-Might unit; the play trigger goes on the chain; unaffordable at 2", async () => {
    const game = await inHand().build();
    await game.p1.play("fm", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("fm")).toBe("base");
    expect(game.state("fm").might).toBe(2);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fm", controller: P1, triggered: true })]);
    expect((await inHand(2).build()).p1.can("play", "fm")).toBe(false);
  });

  test("played to base: exactly one 1-Might Recruit unit token is played into the base", async () => {
    const game = await inHand().build();
    await game.p1.play("fm", { to: "base" });
    await game.settle();
    const tokens = tokensAt(game, "base");
    expect(tokens).toHaveLength(1);
    const t = game.state(tokens[0] as string);
    expect(t).toMatchObject({ cardType: "unit", controller: P1, isToken: true, might: 1, name: "Recruit" });
    expect(tokensAt(game, "bf1")).toHaveLength(0);
    expect(game.p1.units()).toHaveLength(2);
  });

  test("'here': played to a battlefield you control, the token is played to that battlefield (not base)", async () => {
    const game = await inHand().build();
    await game.p1.play("fm", { to: "bf1" });
    await game.settle();
    expect(game.locationOf("fm")).toBe("bf1");
    expect(tokensAt(game, "bf1")).toHaveLength(1);
    expect(tokensAt(game, "base")).toHaveLength(0);
    expect(tokensAt(game, "bf2", game.p2)).toHaveLength(0);
  });

  test("the token is a played unit: it enters exhausted, like the Manufactor itself", async () => {
    const game = await inHand().build();
    await game.p1.play("fm", { to: "base" });
    await game.settle();
    const [token] = tokensAt(game, "base");
    expect(game.state("fm").isExhausted).toBe(true);
    expect(game.state(token as string).isExhausted).toBe(true);
  });

  test("the trigger can be responded to: the token only appears once the trigger resolves", async () => {
    const game = await inHand().build();
    await game.p1.play("fm", { to: "base" });
    expect(tokensAt(game, "base")).toHaveLength(0);
    await game.p1.passPriority();
    expect(tokensAt(game, "base")).toHaveLength(0);
    await game.p2.passPriority();
    expect(tokensAt(game, "base")).toHaveLength(1);
    expect(game.violations()).toEqual([]);
  });
});
