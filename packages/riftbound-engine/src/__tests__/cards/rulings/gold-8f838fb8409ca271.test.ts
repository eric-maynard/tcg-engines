/**
 * Ruling 8f838fb8409ca271 — Gold token (SFD-T03 → sfd-t03) "Kill this, [Exhaust]: [Reaction] — [Add] [rainbow]."
 *   × Sigil of the Storm (OGN-287 → ogn-287-298) · Battlefield · "When you conquer here, you must recycle one of your runes."
 *
 * Q: Can you recycle a Gold gear for Sigil of the Storm?
 * A: No. The Sigil requires recycling one of your RUNES; a Gold token is a gear token, not a rune, and cannot be
 *    substituted. With no runes to recycle the trigger still resolves and simply does nothing.
 * Rules: 403.1.b (runes recycle to the rune deck), 416.4 (recycle as much as you can), 182 (tokens), 159/160.
 */
import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GOLD = "sfd-t03";
const SIGIL = "ogn-287-298";

/** P1's turn. P2 holds a LIVE Sigil of the Storm with a 1-Might Watchman; P1: Raider (3) in base, a ready Gold, `runes` fury runes. */
function board(runes: number) {
  const s = scenario()
    .battlefield("sigil", { controller: P2, def: SIGIL, inert: false })
    .unit(P2, "sigil", { might: 1, name: "Watchman" }, "watch")
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
    .gear(P1, GOLD, "gold")
    .rune(P2, "calm", { alias: "p2rune" });
  for (let i = 1; i <= runes; i++) {
    s.rune(P1, "fury", { alias: `r${i}` });
  }
  return s;
}

describe("Ruling 8f838fb8409ca271 — a Gold gear can't be recycled for Sigil of the Storm", () => {
  test("P1 conquers the Sigil: the mandatory 'recycle one of your runes' pick offers ONLY P1's runes — never the Gold token (nor P2's rune, nor a unit)", async () => {
    const game = await board(2).build();
    expect(game.state("gold")).toMatchObject({ cardType: "gear", isToken: true });
    await game.p1.move("raider", "sigil");
    const stop = await game.settle();
    expect(game.gameState.battlefields.sigil?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(stop.reason).toBe("unanswered");
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P1 });
    expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["r1", "r2"]);
    expect(d.options.some((o) => (o.card ?? o.key) === "gold")).toBe(false);
    const forced = await game.p1.try((p) => p.pick("gold"));
    expect(forced.ok).toBe(false);
    await game.p1.pick("r2");
    await game.settle();
    expect(game.zoneOf("r2")).toBe("runeDeck");
    expect(game.p1.runes()).toEqual(["r1"]);
    expect(game.state("gold")).toMatchObject({ isReady: true, location: "base" }); // untouched
    expect(game.violations()).toEqual([]);
  });

  test("ruling 8f838fb8409ca271 — with NO runes the trigger resolves doing nothing: no prompt (none offering the Gold), the Gold stays, the conquer point stands", async () => {
    const game = await board(0).build();
    expect(game.p1.runes()).toEqual([]);
    await game.p1.move("raider", "sigil");
    const stop = await game.settle();
    expect(stop.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.chain()).toEqual([]);
    expect(game.gameState.battlefields.sigil?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("gold")).toMatchObject({ isReady: true, location: "base" });
    expect(game.p1.gear()).toEqual(["gold"]);
    expect(game.p2.runes()).toEqual(["p2rune"]);
    expect(game.violations()).toEqual([]);
  });

  test("cashing the Gold in ([Reaction] — Add [rainbow]) while the Sigil trigger waits does not satisfy it: the Power floats unspent and the lone rune is STILL recycled", async () => {
    const game = await board(1).build();
    await game.p1.move("raider", "sigil");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sigil", controller: P1, triggered: true })]);
    expect(game.p1.can("activate", "gold")).toBe(true);
    await game.p1.activate("gold");
    expect(game.has("gold")).toBe(false);
    expect(game.p1.power("rainbow")).toBe(1);
    await game.settle();
    expect(game.zoneOf("r1")).toBe("runeDeck");
    expect(game.p1.runes()).toEqual([]);
    expect(game.p1.power("rainbow")).toBe(1);
  });
});
