/**
 * Ruling a9a927a87460fa9c — Bandle Tree (OGN-278 → ogn-278-298) · Battlefield · "You may hide an additional card here."
 *   × Pakaa Cub (ogn-135-298, [Hidden] unit) · Consult the Past (ogn-083-298, [Hidden][Reaction] "Draw 2.")
 *
 * Q: Can you hide a card at a battlefield where you already have a hidden card, to replace / get rid of the old one?
 * A: No. A facedown zone holds ONE hidden card per player (Bandle Tree: two); there is no implicit overwrite. You must
 *    first play (reveal) the existing hidden card and let it resolve, then you may hide a new card there. Also: you may
 *    only hide at a battlefield you control; hiding is a discretionary action that uses no chain; a hidden card can be
 *    played (Reaction timing) starting the turn after it was hidden; revealing a hidden card IS playing it.
 * Rules: 107.3.b / 107.3.b.1 (facedown capacity 1, can be raised), 107.3.c (controller only), 421 / 811.1.b (Hide),
 *        811.1.c (play from facedown next turn, for [0], as a Reaction).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BANDLE_TREE = "ogn-278-298";
const PAKAA_CUB = "ogn-135-298"; // Unit · 3 · 3 Might · [Hidden]
const CONSULT = "ogn-083-298"; // Spell · [Hidden] [Reaction] — Draw 2.

/** P1's turn 2. P1 holds "plain" (ordinary battlefield) with a Holder; P2 holds bf2. P1: 3 rainbow power, Cub + Consult + Cub in hand. */
function board(opts: { tree?: boolean } = {}) {
  return scenario()
    .resources(P1, { power: { rainbow: 3 } })
    .battlefield("plain", opts.tree ? { controller: P1, def: BANDLE_TREE, inert: false } : { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "plain", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 2, name: "Their Holder" }, "theirs")
    .hand(P1, PAKAA_CUB, "cub1")
    .hand(P1, CONSULT, "consult")
    .hand(P1, PAKAA_CUB, "cub2");
}

describe("Ruling a9a927a87460fa9c — no hiding over an existing hidden card; play it first, then hide anew (Bandle Tree allows two)", () => {
  test("with one card already facedown at an ordinary battlefield, a second Hide there is simply illegal — the old card is NOT replaced", async () => {
    const game = await board().build();
    await game.p1.hide("consult", "plain");
    expect(game.zoneOf("consult")).toBe("facedown-plain");
    expect(game.p1.power()).toBe(2); // paid [rainbow]
    expect(game.p1.can("hide", "cub1")).toBe(false);
    const r = await game.p1.try((p) => p.hide("cub1", "plain"));
    expect(r.ok).toBe(false);
    expect(game.p1.facedown("plain")).toEqual(["consult"]); // still the original, untouched
    expect(game.zoneOf("cub1")).toBe("hand");
    expect(game.p1.power()).toBe(2);
  });

  test("hiding uses no chain (stays P1's open main phase), and the freshly hidden card cannot be played the same turn", async () => {
    const game = await board().build();
    await game.p1.hide("consult", "plain");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "consult")).toBe(false); // "beginning on the next turn"
  });

  test("the legal sequence: on a later turn PLAY the existing hidden card (revealing = playing it: Consult resolves and draws 2), and only then hide a new card at that battlefield", async () => {
    const game = await board().build();
    await game.p1.hide("consult", "plain");
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1, turn 4
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.can("hide", "cub1")).toBe(false); // slot still occupied
    const hand0 = game.p1.hand().length;
    expect(game.p1.can("reveal", "consult")).toBe(true);
    await game.p1.reveal("consult");
    await game.settle();
    expect(game.zoneOf("consult")).toBe("trash"); // played and resolved for [0]
    expect(game.p1.hand()).toHaveLength(hand0 + 2); // its effect happened — it was PLAYED
    expect(game.p1.facedown("plain")).toEqual([]);
    // now the slot is free again
    await game.p1.do("addResources", { power: { rainbow: 1 } });
    expect(game.p1.can("hide", "cub1")).toBe(true);
    await game.p1.hide("cub1", "plain");
    expect(game.p1.facedown("plain")).toEqual(["cub1"]);
    expect(game.violations()).toEqual([]);
  });

  test("exception — at Bandle Tree the controller may have TWO cards facedown (but still not three)", async () => {
    const game = await board({ tree: true }).build();
    await game.p1.hide("consult", "plain");
    expect(game.p1.can("hide", "cub1")).toBe(true);
    await game.p1.hide("cub1", "plain");
    expect(game.p1.facedown("plain").toSorted()).toEqual(["consult", "cub1"]);
    expect(game.p1.power()).toBe(1);
    expect(game.p1.can("hide", "cub2")).toBe(false);
    expect((await game.p1.try((p) => p.hide("cub2", "plain"))).ok).toBe(false);
  });

  test("you can only hide at a battlefield YOU control: bf2 (P2's) is never a legal place for P1 to hide", async () => {
    const game = await board().build();
    const r = await game.p1.try((p) => p.hide("consult", "bf2"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("consult")).toBe("hand");
    const dests = game.p1
      .legal()
      .filter((o) => o.verb === "hide")
      .flatMap((o) => o.fields.flatMap((f) => (f.kind === "zone" || f.name === "battlefieldId" || f.arg === "to" ? (f.options ?? []) : [])));
    expect(dests.map(String).some((z) => z.includes("bf2"))).toBe(false);
  });
});
