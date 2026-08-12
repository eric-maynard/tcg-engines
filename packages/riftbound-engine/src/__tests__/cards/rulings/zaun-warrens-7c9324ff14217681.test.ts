/**
 * Ruling 7c9324ff14217681 — Zaun Warrens (OGN-298 → ogn-298-298) · Battlefield
 *     "When you conquer here, discard 1, then draw 1."
 *   × Super Mega Death Rocket! (OGN-252 → ogn-252-298) · Spell · [4][rainbow] · "Deal 5 to a unit. When you
 *     conquer, you may discard 1 to return this from your trash to your hand."
 *
 * Q: I conquer Zaun Warrens with 0 cards in hand and a Rocket in my trash. Can I draw off the Warrens and then
 *    discard that card to bring the Rocket back?
 * A (riftjudge): yes — order the two conquer triggers so the Warrens resolves first, draw, then pay the Rocket's
 *    discard out of the card just drawn.
 * ENGINE (current Core Rules): the Rocket's leading "you may [discard 1] to …" is its BASE COST, opted into and
 *    PAID at FINALIZATION — before anything resolves. With an empty hand it is unpayable, so the item is removed
 *    without asking and the Warrens' later draw can never fund it. See the cost-at-finalization model.
 * Rules: 383.3.a/b + 204.3.a + 404.1 (a leading "you may [cost] to" is opted into and paid at finalization),
 *        404.2 (an unpayable cost ⇒ the item is removed unasked), 383.3.d (simultaneous triggers are ordered).
 */
import { describe, expect, test } from "bun:test";
import type { Game, OrderDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZAUN_WARRENS = "ogn-298-298";
const ROCKET = "ogn-252-298";
const SKULKER = "ogn-175-298";

/** P1's turn. bf1 IS Zaun Warrens (live text) and is open; a Rocket sits in P1's trash. `spare` = a card in hand. */
function board(spare: boolean) {
  const s = scenario()
    .battlefield("bf1", { controller: null, def: ZAUN_WARRENS, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 2, name: "Their Guard" }, "theirs")
    .unit(P1, "base", { might: 3, name: "Scout" }, "scout")
    .trash(P1, ROCKET, "rocket")
    .deck(P1, [SKULKER, SKULKER], ["d1", "d2"]);
  if (spare) {
    s.hand(P1, SKULKER, "spare");
  }
  return s;
}

const chainIds = (game: Game) => game.chain().map((c) => c.cardId);

/** P1 walks into the open Warrens and both players pass Focus, closing the showdown into the conquest. */
async function conquer(game: Game): Promise<void> {
  await game.p1.move("scout", "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
}

describe("Ruling 7c9324ff14217681 — conquering Zaun Warrens with the Rocket in the trash", () => {
  // RULING-CONFLICT: riftjudge 7c9324ff14217681 says the Warrens' draw can pay the Rocket's discard afterwards;
  // CR 383.3.b + 204.3.a + 404.1/404.2 make that discard the trigger's BASE COST, decided and paid at
  // FINALIZATION — engine follows CR, so an empty hand kills the Rocket trigger before anything resolves.
  test("empty hand: the Rocket's trigger is dropped unasked at finalization — only the Warrens' trigger reaches the chain", async () => {
    const game = await board(false).build();
    expect(game.p1.hand()).toEqual([]);
    await game.p1.move("scout", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(chainIds(game)).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("… so the Warrens still resolves in full (nothing to discard, then draw 1) and the Rocket simply stays in the trash", async () => {
    const game = await board(false).build();
    await game.p1.move("scout", "bf1");
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]); // the draw happened
    expect(game.zoneOf("rocket")).toBe("trash");
    expect(game.p1.trash()).toEqual(["rocket"]);
    expect(game.violations()).toEqual([]);
  });

  test("with one card in hand the Rocket's cost IS offered — as a finalization Pay prompt, before any trigger resolves", async () => {
    const game = await board(true).build();
    await conquer(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
    expect(game.decision()?.prompt).toMatch(/discard/i);
    expect(game.p1.hand()).toEqual(["spare"]); // nothing resolved yet
  });

  test("paying it discards the spare card at once, and P1 is then asked to ORDER the two simultaneous conquer triggers", async () => {
    const game = await board(true).build();
    await conquer(game);
    await game.p1.yes();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("spare"); // which card the cost discards
    }
    expect(game.zoneOf("spare")).toBe("trash");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "order", seat: P1 });
    expect((d as OrderDecision).items.map((i) => i.card ?? i.key)).toEqual(expect.arrayContaining(["bf1", "rocket"]));
  });

  test("ruling 7c9324ff14217681 — after the discard is paid the Rocket's own trigger must return it from the trash to hand; the engine resolves the item but leaves the Rocket in the trash", async () => {
    const game = await board(true).build();
    await conquer(game);
    await game.p1.yes();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("spare");
    }
    // rule 383.3.d — the ruling's whole point: P1 ORDERS the two conquer triggers
    // so the Warrens resolves first (first key = bottom of the Chain).
    await game.p1.order(["rocket", "bf1"]);
    await game.settle();
    expect(chainIds(game)).toEqual([]);
    expect(game.zoneOf("rocket")).toBe("hand");
    expect(game.p1.hand()).toContain("rocket");
    expect(game.p1.points()).toBe(1);
  });
});
