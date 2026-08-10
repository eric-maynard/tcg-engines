/**
 * Ruling a685b3e3ead14fd1 — Mirror Image (UNL-200 → unl-200-219) · Spell · Mind/Order · [3]
 *   × Decree of Strength (VEN-085 → ven-085-166) · Spell · Body · [1] · "Choose an opponent. They reveal their hand and you choose a
 *     Mind ([mind]) card from it. They recycle that card."
 *
 * Q: Can Mirror Image be "discarded" with Decree of Strength?
 * A: It can be CHOSEN (it is a Mind card), but it is recycled — put on the bottom of its owner's Main Deck — not discarded to the
 *    trash.
 * Rules: 416.1.a (Recycle → bottom of Main Deck), 422.1 (Discard = hand → trash), domain identity of dual-domain cards.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MIRROR_IMAGE = "unl-200-219";
const DECREE_OF_STRENGTH = "ven-085-166";
const CLEAVE = "ogn-004-298"; // Fury — not a Mind card

/** P1's turn with [1]. P2's hand: Mirror Image (Mind/Order) + Cleave (Fury); P2's deck top is known. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .hand(P2, MIRROR_IMAGE, "mirror")
    .hand(P2, CLEAVE, "cleave")
    .deck(P2, ["ogn-175-298", "ogn-175-298"], ["p2d1", "p2d2"])
    .hand(P1, DECREE_OF_STRENGTH, "decree");
}

async function decreeResolving(): Promise<Game> {
  const game = await board().build();
  expect(game.state("mirror").domains.sort()).toEqual(["mind", "order"]);
  await game.p1.cast("decree");
  expect(game.p1.energy()).toBe(0);
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

describe("Ruling a685b3e3ead14fd1 — Decree of Strength can pick Mirror Image, which is recycled (not discarded)", () => {
  test("on resolution P1 chooses from P2's revealed hand: Mirror Image (a Mind card) is offered, the Fury Cleave is not", async () => {
    const game = await decreeResolving();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(offered).toEqual(["mirror"]);
    expect(offered).not.toContain("cleave");
  });

  test("picking it: Mirror Image goes to the BOTTOM of P2's Main Deck — not to any trash — and Cleave stays in hand", async () => {
    const game = await decreeResolving();
    await game.p1.pick("mirror");
    await game.settle();
    expect(game.zoneOf("mirror")).toBe("mainDeck");
    expect(game.p2.deck().at(-1)).toBe("mirror"); // recycled = bottom
    expect(game.p2.deck().slice(0, 2)).toEqual(["p2d1", "p2d2"]);
    expect(game.p2.trash()).toEqual([]);
    expect(game.p1.trash()).toEqual(["decree"]);
    expect(game.p2.hand()).toEqual(["cleave"]);
    expect(game.state("mirror").owner).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
