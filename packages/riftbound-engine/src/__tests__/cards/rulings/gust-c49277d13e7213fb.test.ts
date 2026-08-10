/**
 * Ruling c49277d13e7213fb — Gust (OGN-169 → ogn-169-298) · Reaction · Chaos · 1
 *     "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   × Deadbloom Predator (OGN-161 → ogn-161-298) · 8 + [body][body] · 8 Might · [Deflect]
 *     "You may play me to an occupied enemy battlefield."
 *
 * Q: Deadbloom is played to an occupied enemy battlefield; can the opponent Gust their own unit away "in
 *    response", so the battlefield is empty before Deadbloom resolves — and does Deadbloom still arrive?
 * A: The scenario cannot happen. A unit does not linger on the chain: it is finalized and resolves as one
 *    uninterrupted play, arriving on the battlefield before any opponent may react. Reactions are only
 *    possible once the unit is already there.
 * Rules: 338–340 (a permanent finalizes and resolves immediately), 355.2.b, 323.13 (combat then begins).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const DEADBLOOM = "ogn-161-298";

/** P1's turn with exactly 8 + [body][body]. P2 holds bf1 with a 2-Might Scout and has Gust + 1 energy. */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { body: 2 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Scout" }, "scout")
    .hand(P1, DEADBLOOM, "deadbloom")
    .hand(P2, GUST, "gust");
}

describe("Ruling c49277d13e7213fb — a played unit never waits on the chain; Gust cannot pre-empt Deadbloom's arrival", () => {
  test("the moment P1 plays Deadbloom to the occupied enemy bf1 it is ON the battlefield — not a chain item — before P2 has had any decision at all", async () => {
    const game = await board().build();
    await game.p1.play("deadbloom", { to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    // Already a permanent at bf1; nothing of it remains on the chain.
    expect(game.zoneOf("deadbloom")).toBe("battlefield-bf1");
    expect(game.chain().map((c) => c.cardId)).not.toContain("deadbloom");
    // Both units share bf1: the Scout was never given a window to leave first.
    expect(game.zoneOf("scout")).toBe("battlefield-bf1");
  });

  test("P2's first opportunity to cast Gust comes only with Deadbloom already at bf1 (the showdown it provoked); Gust can bounce the Scout then, but Deadbloom stays and takes the battlefield", async () => {
    const game = await board().build();
    await game.p1.play("deadbloom", { to: "bf1" });
    // Walk forward until P2 is the acting seat for the first time.
    for (let i = 0; i < 6 && game.actingSeat() !== P2; i++) {
      await game.p1.pass();
    }
    expect(game.actingSeat()).toBe(P2);
    expect(game.zoneOf("deadbloom")).toBe("battlefield-bf1"); // already there when P2 may first react
    expect(game.p2.can("cast", "gust")).toBe(true);
    const offered = (game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toContain("scout");
    expect(offered).not.toContain("deadbloom"); // 8 Might — not a legal Gust target anyway
    await game.p2.cast("gust", { targets: "scout" });
    await game.settle();
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.zoneOf("deadbloom")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("control: with no reaction at all, combat resolves — Deadbloom (8) kills the Scout (2) and conquers bf1", async () => {
    const game = await board().build();
    await game.p1.play("deadbloom", { to: "bf1" });
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.zoneOf("deadbloom")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
