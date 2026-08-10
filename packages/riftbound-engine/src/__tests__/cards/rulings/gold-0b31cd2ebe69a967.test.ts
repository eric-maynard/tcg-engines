/**
 * Ruling 0b31cd2ebe69a967 — Gold token (SFD-T03 → sfd-t03) "Kill this, [Exhaust]: [Reaction] — [Add] [rainbow]."
 *   × Sigil of the Storm (OGN-287 → ogn-287-298) "When you conquer here, you must recycle one of your runes."
 *
 * Q: Can you pay for Sigil of the Storm's requirement with a Gold token?
 * A: No. The Sigil demands the specific game action "recycle one of your runes", not a generic Power
 *    payment; Gold's ability ADDS Power (by killing/exhausting the token), it never recycles a rune, so it
 *    cannot substitute. With no runes to recycle the trigger simply resolves and does nothing — no
 *    alternative payment is asked for.
 * Rules: 416 (Recycle as an effect; 416.4 recycle as many as possible; 416.6 doesn't target), 429 (Add
 *        abilities put resources in the Rune Pool), 159/160 (Rune Pool ≠ rune cards).
 */
import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GOLD = "sfd-t03";
const SIGIL = "ogn-287-298";

/** P1's turn. P2 holds a live Sigil with a 1-Might defender; P1 has a Raider (3), `runes` fury runes and a ready Gold. */
function board(runes = 1) {
  const s = scenario()
    .battlefield("sigil", { controller: P2, def: SIGIL, inert: false, owner: P2 })
    .unit(P2, "sigil", { might: 1, name: "Defender" }, "def")
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
    .gear(P1, GOLD, "gold")
    .rune(P2, "calm", { alias: "theirs" });
  for (let i = 1; i <= runes; i++) {
    s.rune(P1, "fury", { alias: `r${i}` });
  }
  return s;
}

describe("Ruling 0b31cd2ebe69a967 — a Gold token cannot stand in for the Sigil's 'recycle one of your runes'", () => {
  test("P1 conquers the Sigil: the trigger's mandatory pick offers ONLY P1's runes — the Gold token is not an option (nor is P2's rune)", async () => {
    const game = await board(2).build();
    await game.p1.move("raider", "sigil");
    const r = await game.settle();
    expect(game.gameState.battlefields.sigil?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(r.reason).toBe("unanswered");
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P1 });
    expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["r1", "r2"]);
    expect(d.options.some((o) => (o.card ?? o.key) === "gold")).toBe(false);
    await game.p1.pick("r1");
    await game.settle();
    expect(game.zoneOf("r1")).toBe("runeDeck");
    expect(game.p1.runes()).toEqual(["r2"]);
    // The Gold was never touched.
    expect(game.state("gold")).toMatchObject({ isReady: true, location: "base" });
    expect(game.violations()).toEqual([]);
  });

  test("ruling 0b31cd2ebe69a967 — cashing the Gold in for [rainbow] while the trigger is pending pays for nothing: the Power just floats and the rune is STILL recycled", async () => {
    const game = await board().build();
    await game.p1.move("raider", "sigil");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sigil", controller: P1, triggered: true })]);
    // P1 has priority with the Sigil trigger on the chain — a Reaction [Add] is legal here.
    expect(game.p1.can("activate", "gold")).toBe(true);
    await game.p1.activate("gold");
    expect(game.has("gold")).toBe(false);
    expect(game.p1.power("rainbow")).toBe(1);
    await game.settle(); // trigger resolves: the only rune is recycled regardless
    expect(game.zoneOf("r1")).toBe("runeDeck");
    expect(game.p1.runes()).toEqual([]);
    expect(game.p1.power("rainbow")).toBe(1); // unspent — nothing consumed it
    expect(game.p2.runes()).toEqual(["theirs"]);
  });

  test("ruling 0b31cd2ebe69a967 — with NO runes at all the trigger resolves doing nothing: no prompt (in particular none offering the Gold), the Gold stays, the conquer point stands, play continues", async () => {
    const game = await board(0).build();
    expect(game.p1.runes()).toEqual([]);
    await game.p1.move("raider", "sigil");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.chain()).toEqual([]);
    expect(game.gameState.battlefields.sigil?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("gold")).toMatchObject({ isReady: true, location: "base" });
    expect(game.p1.power()).toBe(0);
    expect(game.p2.runes()).toEqual(["theirs"]);
    expect(game.violations()).toEqual([]);
  });
});
