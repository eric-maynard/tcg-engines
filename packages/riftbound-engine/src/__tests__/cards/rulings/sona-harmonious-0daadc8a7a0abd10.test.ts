/**
 * Ruling 0daadc8a7a0abd10 — Sona, Harmonious (OGN-073 → ogn-073-298) · Champion Unit · Calm · 4 + [calm] · 4 Might
 *   × Seal of Focus (ogn-081-298) · Gear · Calm · [0] + [calm] "[Exhaust]: [Reaction] — [Add] [calm]."
 *
 * Q: Can Seals let you play a card without enough runes to tap for its Energy cost? Can you float Energy/Power between actions?
 * A: Energy and Power float between actions (a general mechanic, not Seal-specific). But a Seal adds POWER, never Energy —
 *    you still need enough runes to exhaust for the Energy. Valid line: exhaust 4 runes (4 Energy) → recycle a rune for the
 *    Seal's [calm] → play the Seal → exhaust the Seal for [calm] → play Sona (4 + [calm]).
 * Rules: 159–161 (Rune Pool persists between actions), 417.2/417.3 (exhaust rune = +1 Energy; recycle rune = +1 Power),
 *        [Add] abilities (add the stated resource only), 315.4.c / 317.2.e (when pools empty).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const SONA_HARMONIOUS = "ogn-073-298";
const SEAL_OF_FOCUS = "ogn-081-298";

describe("Ruling 0daadc8a7a0abd10 — floating resources are fine, but Seals make Power, not Energy", () => {
  test("the ruling's line with exactly FOUR runes: tap all 4 (4 energy floats) → recycle one of the tapped runes (+[calm]) → play Seal of Focus → exhaust it (+[calm]) → play Sona", async () => {
    const game = await scenario().runes(P1, "calm", 4).hand(P1, SEAL_OF_FOCUS, "seal").hand(P1, SONA_HARMONIOUS, "sona").build();
    expect(game.p1.can("play", "sona")).toBe(false);
    await game.p1.tapRunes(4);
    expect(game.p1.resources()).toEqual({ energy: 4, power: {} });
    const [spent] = game.p1.runes({ ready: false });
    await game.p1.recycleRune(spent as string); // Energy was generated BEFORE the rune left
    expect(game.p1.resources()).toEqual({ energy: 4, power: { calm: 1 } });
    expect(game.p1.runes()).toHaveLength(3);
    await game.p1.play("seal");
    await game.settle();
    expect(game.zoneOf("seal")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 4, power: { calm: 0 } }); // Seal cost only its [calm]; energy still floating
    await game.p1.activate("seal");
    expect(game.state("seal").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 4, power: { calm: 1 } }); // [Add] [calm] — no chain, immediate
    expect(game.chain()).toEqual([]);
    expect(game.p1.can("play", "sona")).toBe(true);
    await game.p1.play("sona");
    await game.settle();
    expect(game.zoneOf("sona")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.violations()).toEqual([]);
  });

  test("Seals give Power, NOT Energy: with only THREE runes (3 energy) plus a ready Seal, Sona's 4 Energy can never be met — the Seal's [calm] doesn't help", async () => {
    const game = await scenario().runes(P1, "calm", 3).gear(P1, SEAL_OF_FOCUS, "seal").hand(P1, SONA_HARMONIOUS, "sona").build();
    await game.p1.tapRunes(3);
    await game.p1.activate("seal");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { calm: 1 } });
    expect(game.p1.can("play", "sona")).toBe(false);
    const r = await game.p1.try((p) => p.play("sona"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("sona")).toBe("hand");
  });

  test("order matters only in that Energy must be made before the rune is recycled: recycling one of four runes FIRST leaves just 3 to tap — 3 energy, Sona unplayable", async () => {
    const game = await scenario().runes(P1, "calm", 4).hand(P1, SEAL_OF_FOCUS, "seal").hand(P1, SONA_HARMONIOUS, "sona").build();
    await game.p1.recycleRune();
    await game.p1.tapRunes(3);
    await game.p1.play("seal");
    await game.settle();
    await game.p1.activate("seal");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { calm: 1 } });
    expect(game.p1.can("play", "sona")).toBe(false);
  });

  test("floating is general: energy and power made now survive unrelated actions and are still spendable later in the turn", async () => {
    const game = await scenario()
      .runes(P1, "calm", 5)
      .hand(P1, SONA_HARMONIOUS, "sona")
      .hand(P1, { cardType: "unit", energyCost: 0, might: 1, name: "Freebie" }, "freebie")
      .build();
    await game.p1.tapRunes(4);
    await game.p1.recycleRune(game.p1.runes({ ready: true })[0] as string);
    expect(game.p1.resources()).toEqual({ energy: 4, power: { calm: 1 } });
    await game.p1.play("freebie"); // something else in between
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 4, power: { calm: 1 } });
    await game.p1.play("sona");
    await game.settle();
    expect(game.zoneOf("sona")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  });
});
