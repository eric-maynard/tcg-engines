/**
 * Ruling f5c658515e622844 — Void Burrower (SFD-187 → sfd-187-221, Rek'Sai's Legend)
 *   "When you conquer, you may exhaust me to reveal the top 2 cards of your Main Deck. You may banish one,
 *    then play it. Recycle the rest."
 *   × Tideturner (OGN-199 → ogn-199-298) — a [Hidden] unit sitting on top of the Main Deck.
 *
 * Q: Can a card revealed by Rek'Sai's Legend be put down HIDDEN instead of played?
 * A: No. "Hide" is its own Discretionary Action and the [Hidden] keyword only allows it from your HAND or Champion
 *    Zone. Rek'Sai's ability says "play it" and the card is coming from the Main Deck, so it is played (paying its
 *    cost) — hiding is never on offer.
 * Rules: 421.2 / 811.1.c.1 (Hide is a Discretionary Action, not "playing"), 811.1.b ([Hidden] works from hand or
 *        Champion Zone), 419 (an ability that says "play" grants only that), FAQ #9502 / #10392.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOID_BURROWER = "sfd-187-221";
const TIDETURNER = "ogn-199-298"; // [Hidden] 2-Might unit, [2]
const SKULKER = "ogn-175-298"; // vanilla filler

/** P1's turn (Rek'Sai's Legend). P1 conquers an empty bf1; deck top is the [Hidden] Tideturner. */
function board() {
  return scenario()
    .legend(P1, VOID_BURROWER, "reksai")
    .resources(P1, { energy: 4, power: { rainbow: 2, chaos: 2 } })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 3, name: "Vanguard" }, "vanguard")
    .deck(P1, [TIDETURNER, SKULKER, SKULKER, SKULKER], ["tide", "d2", "d3", "d4"]);
}

/** Walk onto the empty bf1, conquer, opt into the Legend, and let it resolve to the "banish one" pick. */
async function conquerAndReveal(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("vanguard", "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "reksai" } });
  await game.p1.yes();
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

describe("Ruling f5c658515e622844 — a card revealed off the Main Deck can be PLAYED, never hidden", () => {
  test("premise: Tideturner really carries [Hidden] and starts on top of P1's Main Deck", async () => {
    const game = await board().build();
    expect(game.p1.deck()[0]).toBe("tide");
    expect(game.state("tide").keywords).toContain("Hidden");
  });

  test("the resolution offers exactly the two revealed cards for banish-and-PLAY — with no hide option anywhere", async () => {
    const game = await conquerAndReveal();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const keys = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(keys).toEqual(expect.arrayContaining(["tide", "d2"]));
    expect(d?.prompt.toLowerCase()).not.toContain("hide");
    expect(game.p1.legal().some((o) => o.verb === "hide")).toBe(false);
  });

  test("naming the Tideturner PLAYS it onto the board — it does not become a facedown card", async () => {
    const game = await conquerAndReveal();
    await game.p1.pick("tide");
    await game.settle();
    for (let i = 0; i < 6 && game.zoneOf("tide") === "banishment"; i++) {
      const d = game.decision();
      if (!d || (d.kind !== "pick" && d.kind !== "yes-no")) break;
      if (d.kind === "yes-no") await game.seat(d.seat).no();
      else await game.seat(d.seat).pick(d.options[0]!.key);
      await game.settle();
    }
    expect(game.zoneOf("tide")).not.toBe("facedown-bf1");
    expect(game.zoneOf("tide")).not.toBe("hand");
    expect(game.p1.facedown("bf1")).toEqual([]);
    expect(game.state("tide").isHidden).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("hiding really is a hand-only action: the very same Tideturner IS hideable from P1's hand", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { rainbow: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .hand(P1, TIDETURNER, "tideInHand")
      .build();
    await game.p1.hide("tideInHand", "bf1");
    await game.settle();
    expect(game.p1.facedown("bf1")).toContain("tideInHand");
  });
});
