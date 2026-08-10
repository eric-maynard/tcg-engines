/**
 * Ruling a98433ee7327d885 — Hwei, Brooding Painter (UNL-080 → unl-080-219) · 5 Might · "When I move, draw 1, then discard 1. …"
 *   × Tideturner (OGN-199 → ogn-199-298) · 2 Might · "[Hidden] When you play me, you may choose a unit you control at another
 *     location. Move me to its location and it to my original location."
 *   (Gust ogn-169-298 is the Reaction I would like to play.)
 *
 * Q: Opponent has Hwei in base and plays Tideturner to base, declining to move anything. Is there still a trigger /
 *    chain I can react to?
 * A: No. Tideturner's leading "you may" is decided during finalization; declined, the ability leaves the chain as if it
 *    never triggered, so no chain exists and there is no reaction window. (With Hwei in base there was no legal
 *    "another location" unit anyway — base is Tideturner's own location.) You also can't react to the unit entering play.
 * Rules: 383.3.a.2 (a leading "you may" declined at finalization ⇒ removed, "considered to have not triggered"), 402.4
 *        ("another location" excludes where I am), 339 (playing a permanent is not itself a chain item).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HWEI = "unl-080-219";
const TIDETURNER = "ogn-199-298";
const GUST = "ogn-169-298";

/** P2 (opponent)'s turn with Tideturner's [2]. P2: Hwei in base, bf1 theirs (optionally with a Scout on it). P1: Gust + [1] ready to react. */
function board(scoutAtBf1: boolean) {
  const b = scenario()
    .active(P2)
    .resources(P2, { energy: 2 })
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "base", HWEI, "hwei")
    .hand(P2, TIDETURNER, "tide")
    .hand(P1, GUST, "gust");
  return scoutAtBf1 ? b.unit(P2, "bf1", { might: 2, name: "Scout" }, "scout") : b;
}

describe("Ruling a98433ee7327d885 — Tideturner played to base with its 'you may' declined creates no chain to react to", () => {
  test("as asked (Hwei in base, nothing of P2's at another location): Tideturner enters base and there is NOTHING — no ask, no chain item, no priority for me; P2 is straight back in their main phase", async () => {
    const game = await board(false).build();
    await game.p2.play("tide", { to: "base" });
    expect(game.zoneOf("tide")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.p1.legal()).toEqual([]);
    expect(game.p1.can("cast", "gust")).toBe(false);
    expect(game.state("hwei")).toMatchObject({ location: "base" }); // nobody moved, Hwei's own trigger never fires
    expect(game.p2.energy()).toBe(0);
  });

  test("with a legal swap partner (Scout at bf1) the 'you may' IS asked — of P2, at finalization, before anyone has priority — and declining removes the ability: empty chain, no window for my Gust", async () => {
    const game = await board(true).build();
    await game.p2.play("tide", { to: "base" });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "tide" } });
    expect(game.p1.legal()).toEqual([]); // I have not been given priority yet
    await game.p2.no();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.p1.legal()).toEqual([]);
    expect(game.p1.can("cast", "gust")).toBe(false);
    expect(game.locationOf("tide")).toBe("base");
    expect(game.locationOf("scout")).toBe("bf1");
  });

  test("contrast: if P2 ACCEPTS, the ability is a finalized chain item — then, and only then, I get priority and may react with Gust", async () => {
    const game = await board(true).build();
    await game.p2.play("tide", { to: "base" });
    await game.p2.yes();
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("scout");
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tide", controller: P2, triggered: true })]);
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "gust")).toBe(true);
  });
});
