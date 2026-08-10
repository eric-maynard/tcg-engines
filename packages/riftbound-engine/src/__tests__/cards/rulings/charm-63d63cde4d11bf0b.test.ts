/**
 * Ruling 63d63cde4d11bf0b — Charm (OGN-043 → ogn-043-298) · spell · Calm · [1][calm] — "Move an enemy unit."
 *   × Tideturner (OGN-199 → ogn-199-298) · Unit · 2 Might · [Hidden] — "When you play me, you may choose a unit you
 *     control at another location. Move me to its location and it to my original location."
 *   (Miss Fortune, Buccaneer ogn-193-298 stands in for "my Miss Fortune".)
 *
 * Q: My Miss Fortune and a hidden Tideturner share a battlefield; the opponent Charms Miss Fortune away. If I flip
 *    Tideturner in response, can I swap her back onto the battlefield?
 * A: No. (1) Tideturner must be played as a Reaction while Charm is on the chain — if Charm resolves first and MF was
 *    my only unit there, I lose control and the hidden Tideturner is trashed in the cleanup. (2) Even in time,
 *    Tideturner can only choose a unit at ANOTHER location, never MF at its own battlefield; the swap happens with
 *    some other unit and Charm then still moves MF.
 * Rules: 107.3.d / 190.4.c (lose control with no units → facedown card removed at cleanup), 811 (hidden → Reaction),
 *        Tideturner's "another location" targeting restriction.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";
const TIDETURNER = "ogn-199-298";
const MISS_FORTUNE = "ogn-193-298";

/**
 * P2's turn. P1 controls bfA (Miss Fortune alone + Tideturner facedown there) and bfB (Sailor 2); Deckhand (2) in
 * P1's base. P2: Charm + [1][calm].
 */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P1 })
    .unit(P1, "bfA", MISS_FORTUNE, "mf")
    .facedown(P1, "bfA", TIDETURNER, "tt")
    .unit(P1, "bfB", { might: 2, name: "Sailor" }, "sailor")
    .unit(P1, "base", { might: 2, name: "Deckhand" }, "deckhand")
    .hand(P2, CHARM, "charm")
    .resources(P2, { energy: 1, power: { calm: 1 } });
}

/** P2 Charms Miss Fortune (destination: her base); P2 passes so P1 holds priority with Charm on the chain. */
async function charmOnMfP1HasPriority(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("charm", { targets: "mf" });
  if (game.decision()?.kind === "pick") {
    await game.p2.pick("base");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "charm", controller: P2, targets: ["mf"] })]);
  if (game.actingSeat() === P2) {
    await game.p2.passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 63d63cde4d11bf0b — a hidden Tideturner can't swap Miss Fortune back: wrong timing or illegal target", () => {
  test("waiting is fatal: if Charm resolves, MF leaves bfA, P1 (no units left) loses control and the still-hidden Tideturner is trashed in the cleanup — it can no longer be played", async () => {
    const game = await charmOnMfP1HasPriority();
    await game.p1.passPriority(); // let Charm resolve
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("mf")).toBe("base");
    expect(game.gameState.battlefields.bfA?.controller).toBe(null);
    expect(game.zoneOf("tt")).toBe("trash");
    expect(game.p1.can("reveal", "tt")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("reacting in time: P1 may flip Tideturner while Charm is on the chain, but its 'another location' choice does NOT offer Miss Fortune (same battlefield) — only Sailor (bfB) / Deckhand (base)", async () => {
    const game = await charmOnMfP1HasPriority();
    expect(game.p1.can("reveal", "tt")).toBe(true);
    await game.p1.reveal("tt");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "tt" } });
    await game.p1.yes();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    const d = game.decision();
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["deckhand", "sailor"]);
    expect(offered).not.toContain("mf");
    const r = await game.p1.try((p) => p.pick("mf"));
    expect(r.ok).toBe(false);
  });

  test("full correct sequence: Tideturner swaps with Sailor (TT → bfB, Sailor → bfA); then Charm resolves and STILL moves Miss Fortune off bfA (she was never a legal swap partner)", async () => {
    const game = await charmOnMfP1HasPriority();
    await game.p1.reveal("tt");
    await game.p1.yes();
    await game.p1.pick("sailor");
    expect(game.chain().map((c) => c.cardId)).toEqual(["charm", "tt"]);
    expect(game.chain()[1]).toMatchObject({ controller: P1, targets: ["sailor"], triggered: true });
    await game.acting().passPriority();
    await game.acting().passPriority(); // Tideturner's swap resolves (LIFO)
    expect(game.locationOf("tt")).toBe("bfB");
    expect(game.locationOf("sailor")).toBe("bfA");
    expect(game.locationOf("mf")).toBe("bfA"); // untouched by the swap
    expect(game.chain().map((c) => c.cardId)).toEqual(["charm"]);
    await game.settle(); // Charm resolves
    expect(game.zoneOf("mf")).toBe("base"); // Charm still moved her
    expect(game.locationOf("sailor")).toBe("bfA"); // so bfA stays P1's thanks to Sailor, not MF
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
