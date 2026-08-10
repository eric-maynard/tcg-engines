/**
 * Ruling df43b6d64b02bd4b — Lightning Rush (VEN-156 → ven-156-166) · Spell · 1
 *     "Look at the top 3 cards of your Main Deck. You may choose a card from among them and draw it. Put the rest into
 *      your trash."
 *   × Undertitan (SFD-175 → sfd-175-221) · 6+[order] · 5 Might · "As I'm revealed from your deck, [Add] [2]."
 *   (contrast) Apprentice Smith (SFD-041 → sfd-041-221) · "When I move, reveal the top card of your Main Deck. …"
 *
 * Q: Lightning Rush looks at the top 3 and I see Undertitan — does that add 2 energy?
 * A: No. "Look at" is not "reveal"; Undertitan's [Add] [2] fires only for effects that literally reveal. You may still
 *    choose and draw the Undertitan, but you get no energy. Only a real reveal (e.g. a "reveal the top card" trigger)
 *    sets it off.
 * Rules: 128.4 / 424 (looking is private, not a reveal), 416.1 (look-and-pick), 429.2 ([Add] on reveal).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const LIGHTNING_RUSH = "ven-156-166";
const UNDERTITAN = "sfd-175-221";
const APPRENTICE_SMITH = "sfd-041-221";
const FILLER = "ogn-175-298";

/** P1's turn with exactly [1] for Lightning Rush; deck top = Undertitan, then two fillers, then a fourth card. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .hand(P1, LIGHTNING_RUSH, "rush")
    .deck(P1, [UNDERTITAN, FILLER, FILLER, FILLER], ["ut", "c2", "c3", "c4"]);
}

describe("Ruling df43b6d64b02bd4b — Lightning Rush LOOKS (no reveal): seeing Undertitan adds no energy", () => {
  test("Lightning Rush resolves into a PRIVATE look-and-pick offering the top 3 (Undertitan among them); P1's energy is still 0 at that point — nothing was revealed", async () => {
    const game = await board().build();
    await game.p1.cast("rush");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(offered.sort()).toEqual(["c2", "c3", "ut"]);
    const pending = game.gameState.pendingChoice as { private?: boolean; type?: string } | undefined;
    expect(pending?.private).toBe(true); // 128.4 — a look, not a reveal
    expect(game.p1.energy()).toBe(0); // no [Add] [2]
  });

  test("P1 chooses the Undertitan and draws it: it is in hand, the other two looked-at cards are trashed — and P1 STILL has 0 energy", async () => {
    const game = await board().build();
    await game.p1.cast("rush");
    await game.settle();
    await game.p1.pick("ut");
    await game.settle();
    expect(game.zoneOf("ut")).toBe("hand");
    expect(game.p1.hand()).toEqual(["ut"]);
    expect(game.zoneOf("c2")).toBe("trash");
    expect(game.zoneOf("c3")).toBe("trash");
    expect(game.p1.deck()[0]).toBe("c4");
    expect(game.zoneOf("rush")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — an effect that literally REVEALS the top card (Apprentice Smith's move trigger) does fire Undertitan's [Add] [2]", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", APPRENTICE_SMITH, "smith")
      .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
      .deck(P1, [UNDERTITAN, FILLER], ["ut", "d2"])
      .build();
    expect(game.p1.energy()).toBe(0);
    await game.p1.move("smith", "bf1");
    await game.settle();
    expect(game.p1.energy()).toBe(2);
    expect(game.zoneOf("ut")).toBe("mainDeck"); // not a gear → recycled, still in the deck
  });
});
