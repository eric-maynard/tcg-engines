/**
 * Ruling 403fb927d954c6c8 — Black Market Broker (SFD-121 → sfd-121-221) · Unit · Chaos · 3 · 3 Might
 *   "When you play a card from face down, play a Gold gear token exhausted."
 *   (exercised with Teemo, Scout ogn-197-298 — a [Hidden] unit)
 *
 * Q: Does the Broker apply to HIDDEN cards, since they are face down?
 * A: Yes. Hiding puts the card in the facedown zone of that battlefield; you later PLAY it from that facedown zone,
 *    which is exactly "play a card from face down". ("Hidden" is a mechanic, not a zone; hiding itself is not playing.)
 * Rules: 811.1.c (hide = put facedown; not a play), 811.1.d (play from facedown), 187 (Gold token).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BROKER = "sfd-121-221";
const TEEMO = "ogn-197-298";

const golds = (game: Game, seat: "p1" | "p2") => game[seat].gear().filter((id) => game.state(id).isToken && game.state(id).name === "Gold");

/** P1's turn: Broker in base, bf1 held by P1's Holder, one power of any domain floating, Teemo (Hidden) in hand. */
function board() {
  return scenario()
    .resources(P1, { power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 3, name: "Their Holder" }, "theirs")
    .unit(P1, "base", BROKER, "broker")
    .hand(P1, TEEMO, "teemo");
}

/** Hide Teemo at bf1, go round to P1's next turn (a hidden card can be played from a later turn on). */
async function hiddenAndRipe(): Promise<Game> {
  const game = await board().build();
  await game.p1.hide("teemo", "bf1");
  await game.advanceTurn();
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.zoneOf("teemo")).toBe("facedown-bf1");
  return game;
}

describe("Ruling 403fb927d954c6c8 — a Hidden card is played from the facedown zone, so the Broker pays out", () => {
  test("hiding Teemo puts it in bf1's FACEDOWN zone (isHidden) — that is not a play: no chain, no Gold", async () => {
    const game = await board().build();
    await game.p1.hide("teemo", "bf1");
    expect(game.zoneOf("teemo")).toBe("facedown-bf1");
    expect(game.state("teemo").isHidden).toBe(true);
    expect(game.p1.facedown("bf1")).toEqual(["teemo"]);
    expect(game.chain()).toEqual([]);
    expect(golds(game, "p1")).toHaveLength(0);
  });

  test("playing Teemo FROM face down later: the Broker's trigger joins that chain and resolves into one exhausted Gold gear token in P1's base", async () => {
    const game = await hiddenAndRipe();
    await game.p1.reveal("teemo");
    expect(game.chain().some((c) => c.cardId === "broker" && c.triggered && c.controller === P1)).toBe(true);
    expect(golds(game, "p1")).toHaveLength(0); // not before the trigger resolves
    await game.settle();
    expect(game.zoneOf("teemo")).toBe("battlefield-bf1");
    expect(game.state("teemo").isHidden).toBe(false);
    const mine = golds(game, "p1");
    expect(mine).toHaveLength(1);
    expect(game.state(mine[0]!)).toMatchObject({ cardType: "gear", controller: P1, isExhausted: true, isToken: true, name: "Gold", zone: "base" });
    expect(golds(game, "p2")).toHaveLength(0);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — playing the same Hidden card normally from HAND is not 'from face down': no Gold", async () => {
    const game = await board().resources(P1, { energy: 2, power: { rainbow: 1 } }).build();
    await game.p1.play("teemo", { to: "base" });
    await game.settle();
    expect(game.zoneOf("teemo")).toBe("base");
    expect(golds(game, "p1")).toHaveLength(0);
  });
});
