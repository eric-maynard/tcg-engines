/**
 * Ruling 75426f2a3c0f910d — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · 2 · [Hidden]
 *   "(Hide now for [rainbow] to react with later for [0].) If a friendly unit would die, kill this instead. …"
 *   × Fire Below the Mountain (sfd-189-221, the Ornn legend) "[Exhaust]: [Reaction] — [Add] [rainbow]. Use only to play
 *     gear or use gear abilities."
 *
 * Q: Does the Ornn legend's gear-only Power apply to the cost of HIDING a gear like Zhonya's Hourglass?
 * A: No. Hiding a card is not playing it, so the "only to play gear / use gear abilities" resource cannot pay the [rainbow]
 *    hide cost.
 * Rules: 811.1.a (Hide: pay [rainbow] to put the card facedown — a distinct action from playing), 356/160 (restricted
 *        resources may only be spent as stated).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const FIRE_BELOW_THE_MOUNTAIN = "sfd-189-221";

/** P1's turn: holds bf1 (Holder), Ornn legend ready, Zhonya's in hand, Zhonya's [2] in energy but NO power. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .legend(P1, FIRE_BELOW_THE_MOUNTAIN, "ornn")
    .hand(P1, ZHONYAS, "zh");
}

describe("Ruling 75426f2a3c0f910d — Ornn's gear-only [rainbow] cannot pay Zhonya's hide cost", () => {
  test("baseline: with no power at all P1 cannot hide Zhonya's at bf1 (hide costs [rainbow]) — but could PLAY it as a gear for [2]", async () => {
    const game = await board().build();
    expect(game.p1.can("hide", "zh")).toBe(false);
    expect(game.p1.can("play", "zh")).toBe(true);
  });

  test("exhausting the Ornn legend adds 1 rainbow power earmarked for gear plays/abilities — and hiding is STILL not legal: hiding is not playing a gear", async () => {
    const game = await board().build();
    await game.p1.activate("ornn");
    await game.settle();
    expect(game.state("ornn").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 1 } });
    expect(game.p1.can("hide", "zh")).toBe(false);
    expect(game.p1.legal().some((o) => o.verb === "hide")).toBe(false);
    const r = await game.p1.try((p) => p.hide("zh", "bf1"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("zh")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 1 } }); // nothing spent
    expect(game.p1.can("play", "zh")).toBe(true); // the gear PLAY remains available
    expect(game.violations()).toEqual([]);
  });

  test("control: one ordinary power of any domain DOES pay the hide — Zhonya's goes face down at bf1 and the power is spent", async () => {
    const game = await scenario()
      .resources(P1, { energy: 0, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .legend(P1, FIRE_BELOW_THE_MOUNTAIN, "ornn")
      .hand(P1, ZHONYAS, "zh")
      .build();
    expect(game.p1.can("hide", "zh")).toBe(true);
    await game.p1.hide("zh", "bf1");
    expect(game.zoneOf("zh")).toBe("facedown-bf1");
    expect(game.state("zh").isHidden).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });
});
