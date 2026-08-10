/**
 * Ruling 96e6ab85ef45d7d2 — Traveling Merchant (OGN-185 → ogn-185-298) · 2 Might · "When I move, discard 1, then draw 1."
 *   × Super Mega Death Rocket! (OGN-252 → ogn-252-298) · Action · 4+[rainbow] "Deal 5 to a unit. When you conquer, you may
 *     discard 1 to return this from your trash to your hand."
 *
 * Q: Must the Merchant discard in order to draw? How does that differ from the Rocket's discard?
 * A: Merchant: mandatory trigger that resolves as much as possible — discard 1 if you have a card, and "then draw 1" happens
 *    regardless (empty hand → still draw). Rocket: "discard 1 TO return this" — the discard is a cost/requirement; if you don't
 *    (or can't) discard, it stays in the trash. The Rocket's trigger still triggers on every conquer; paying is a choice.
 * Rules: 359.3.e ("then" sequences do what they can), 383.3.b / 404.2 (a cost inside a "you may … to …" trigger; declining or
 *        being unable to pay removes the item), 409 (discard).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TRAVELING_MERCHANT = "ogn-185-298";
const SMDR = "ogn-252-298";
const FILLER = "ogn-175-298";

/** P1's turn: ready Merchant in base; bf1 held by P1 (moving there starts no showdown); known deck top d1, d2. */
function merchantBoard() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
    .unit(P1, "base", TRAVELING_MERCHANT, "merchant")
    .unit(P2, "base", { might: 1, name: "Bystander" }, "bystander")
    .deck(P1, [FILLER, FILLER], ["d1", "d2"]);
}

/** P1's turn: SMDR already in P1's trash; a ready Scout (3) in base; bf2 EMPTY and uncontrolled — walking in conquers it. */
function rocketBoard() {
  return scenario()
    .battlefield("bf2", { controller: null })
    .unit(P1, "base", { might: 3, name: "Scout" }, "scout")
    .unit(P2, "base", { might: 1, name: "Bystander" }, "bystander")
    .trash(P1, SMDR, "rocket")
    .deck(P1, [FILLER, FILLER], ["d1", "d2"]);
}

/** Scout takes the empty bf2: both pass Focus → conquer (+1). */
async function conquerBf2(game: Game): Promise<void> {
  await game.p1.move("scout", "bf2");
  await game.p1.passFocus();
  await game.p2.passFocus();
  expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
  expect(game.p1.points()).toBe(1);
}

describe("Ruling 96e6ab85ef45d7d2 — Merchant draws even without a discard; the Rocket only comes back if you DO discard", () => {
  test("Traveling Merchant with ONE card in hand: moving triggers 'discard 1, then draw 1' — Junk is discarded and d1 drawn (hand size stays 1)", async () => {
    const game = await merchantBoard().hand(P1, FILLER, "junk").build();
    await game.p1.move("merchant", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", controller: P1, triggered: true })]);
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick") {
        expect(d.seat).toBe(P1);
        expect(d.options.map((o) => o.card ?? o.key)).toEqual(["junk"]);
        await game.p1.pick("junk");
      } else if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.zoneOf("junk")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.deck()[0]).toBe("d2");
  });

  test("Traveling Merchant with an EMPTY hand: nothing to discard, so that step is skipped — but 'then draw 1' still happens (hand 0 → 1)", async () => {
    const game = await merchantBoard().build();
    expect(game.p1.hand()).toEqual([]);
    await game.p1.move("merchant", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", triggered: true })]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toEqual(["d1"]); // drew regardless
    expect(game.p1.trash()).toEqual([]); // no discard happened
    expect(game.locationOf("merchant")).toBe("bf1");
    expect(game.violations()).toEqual([]);
  });

  test("Super Mega Death Rocket in the trash, ONE card in hand: on conquering P1 is asked (yes/no); YES → the card is discarded and the Rocket returns to hand", async () => {
    const game = await rocketBoard().hand(P1, FILLER, "junk").build();
    await conquerBf2(game);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "rocket" } });
    await game.p1.yes();
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("junk");
    }
    await game.settle();
    expect(game.zoneOf("junk")).toBe("trash");
    expect(game.zoneOf("rocket")).toBe("hand");
    expect(game.p1.hand()).toEqual(["rocket"]);
    expect(game.violations()).toEqual([]);
  });

  test("…NO (choose not to discard) → the Rocket stays in the trash and the card stays in hand: no discard, no return", async () => {
    const game = await rocketBoard().hand(P1, FILLER, "junk").build();
    await conquerBf2(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "rocket" } });
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("rocket")).toBe("trash");
    expect(game.p1.hand()).toEqual(["junk"]);
  });

  test("…and with an EMPTY hand the discard can't be paid at all: whether or not a prompt appears it cannot be accepted, and the Rocket stays in the trash (contrast with the Merchant, which still drew)", async () => {
    const game = await rocketBoard().build();
    expect(game.p1.hand()).toEqual([]);
    await conquerBf2(game);
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      expect(d.canAccept).toBe(false);
      const forced = await game.p1.try((p) => p.yes());
      if (forced.ok) {
        // even a tolerated "yes" must not produce the card
        await game.settle();
      } else {
        await game.p1.no();
      }
    }
    await game.settle();
    expect(game.zoneOf("rocket")).toBe("trash");
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.points()).toBe(1); // the conquer itself was fine
    expect(game.violations()).toEqual([]);
  });
});
