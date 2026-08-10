/**
 * Ruling d34196c60ae98794 — Retreat (OGN-104 → ogn-104-298) · Reaction · Mind · [1]
 *     "Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted."
 *   (Cull the Weak OGN-209 / Cull SFD-134 are cited only as contrast: they do not target.)
 *
 * Q: With no units on the board, can I play Retreat anyway — skip the return but still channel 1 rune exhausted?
 * A: No. Retreat targets "a friendly unit"; a spell that targets needs a legal target to be played at all. And if
 *    its target becomes illegal on resolution the whole spell whiffs — the channel references the target's owner, so
 *    it is not an independent instruction; the target cannot be shifted to another unit.
 * Rules: 355.2 / 355.8 (targets are required choices made when the spell is played — no legal choice ⇒ can't play),
 *        359.3.e.5 / 359.3.e.14 (instructions tied to an illegal target are ignored), 751 (no re-targeting).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RETREAT = "ogn-104-298";
/** Inline enemy Reaction: "Return a unit to its owner's hand." — used to make Retreat's target illegal mid-chain. */
const BOUNCE = {
  abilities: [{ effect: { target: { type: "unit" }, type: "return-to-hand" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 1,
  name: "Test Bounce",
  timing: "reaction",
};

describe("Ruling d34196c60ae98794 — Retreat needs a friendly unit to be played; no 'channel only' mode", () => {
  test("no friendly units anywhere (an ENEMY unit is on the board): Retreat is not a legal play even with [1] floating; nothing is channeled", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Enemy Scout" }, "scout")
      .hand(P1, RETREAT, "retreat")
      .build();
    const runesBefore = game.p1.runes().length;
    const runeDeckBefore = game.p1.runeDeck().length;
    expect(game.p1.can("cast", "retreat")).toBe(false);
    const r = await game.p1.try((p) => p.cast("retreat"));
    expect(r.ok).toBe(false);
    // an enemy unit is never a legal "friendly unit" target either
    const r2 = await game.p1.try((p) => p.cast("retreat", { targets: "scout" }));
    expect(r2.ok).toBe(false);
    expect(game.zoneOf("retreat")).toBe("hand");
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.runes()).toHaveLength(runesBefore);
    expect(game.p1.runeDeck()).toHaveLength(runeDeckBefore);
    expect(game.chain()).toEqual([]);
  });

  test("control: with a friendly unit on the board Retreat IS legal, returns it to hand and its owner channels 1 rune exhausted", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .hand(P1, RETREAT, "retreat")
      .build();
    const runesBefore = game.p1.runes().length;
    expect(game.p1.can("cast", "retreat")).toBe(true);
    await game.p1.cast("retreat", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("retreat")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("hand");
    expect(game.p1.runes()).toHaveLength(runesBefore + 1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1); // channeled exhausted
    expect(game.violations()).toEqual([]);
  });

  test("target made illegal after finalization (opponent bounces it in response): Retreat still resolves but does NOTHING — no return by Retreat, NO channel, and no prompt to shift the target to the other friendly unit", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .resources(P2, { energy: 1 })
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .unit(P1, "base", { might: 3, name: "Other Ally" }, "other")
      .hand(P1, RETREAT, "retreat")
      .hand(P2, BOUNCE, "bounce")
      .build();
    const runesBefore = game.p1.runes().length;
    const runeDeckBefore = game.p1.runeDeck().length;
    await game.p1.cast("retreat", { targets: "ally" });
    await game.p1.passPriority();
    await game.p2.cast("bounce", { targets: "ally" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["retreat", "bounce"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("ally")).toBe("hand"); // by the Bounce
    expect(game.zoneOf("retreat")).toBe("trash"); // it resolved (was not countered)
    expect(game.zoneOf("other")).toBe("base"); // never re-targeted
    expect(game.p1.runes()).toHaveLength(runesBefore); // the linked channel is skipped too
    expect(game.p1.runeDeck()).toHaveLength(runeDeckBefore);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
