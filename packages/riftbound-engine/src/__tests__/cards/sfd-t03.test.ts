/**
 * Gold — sfd-t03 · Gear Token · no domain · no cost
 *
 *   Kill this, [Exhaust]: [Reaction] — [Add] [rainbow].
 *   (Abilities that add resources can't be reacted to.)
 *
 * Rules: 429.2 (Add abilities resolve as soon as they are finalized — they never wait on the
 * chain), 429.3 (Reaction Add abilities may be activated whenever costs are paid / any time),
 * 135.2.e.5.b ([rainbow] = one Power usable as any domain).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const GOLD = "sfd-t03";

describe("Gold (sfd-t03)", () => {
  test("is a costless, domainless gear token", async () => {
    const game = await scenario().gear(P1, GOLD, "gold").build();
    expect(game.state("gold")).toMatchObject({ cardType: "gear", energyCost: 0, name: "Gold" });
    expect(game.state("gold").powerCost).toEqual([]);
    expect(game.state("gold").domains).toEqual([]);
    expect(game.zoneOf("gold")).toBe("base");
  });

  test("Kill this, [Exhaust]: activating kills Gold (to trash) and adds 1 [rainbow] power immediately (429.2)", async () => {
    const game = await scenario().gear(P1, GOLD, "gold").build();
    expect(game.p1.can("activate", "gold")).toBe(true);
    await game.p1.activate("gold");
    // Add abilities resolve on finalize: nothing lingers on the chain, no priority window opens.
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("gold")).toBe("trash");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power()).toBe(1);
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("[Exhaust] is part of the cost: an exhausted Gold cannot be activated", async () => {
    const game = await scenario().gear(P1, GOLD, "gold", { exhausted: true }).build();
    expect(game.state("gold").isExhausted).toBe(true);
    expect(game.p1.can("activate", "gold")).toBe(false);
    const r = await game.p1.try((p) => p.activate("gold"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("gold")).toBe("base");
    expect(game.p1.power()).toBe(0);
  });

  test("[Reaction]: usable on the opponent's turn while P1 holds priority on a chain", async () => {
    const bolt = {
      abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
      cardType: "spell",
      domain: "fury",
      energyCost: 1,
      name: "Test Bolt",
      timing: "action",
    };
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .unit(P1, "base", { might: 3 }, "mine")
      .hand(P2, bolt, "bolt")
      .gear(P1, GOLD, "gold")
      .build();
    await game.p2.cast("bolt", { targets: "mine" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("activate", "gold")).toBe(true);
    await game.p1.activate("gold");
    expect(game.zoneOf("gold")).toBe("trash");
    expect(game.p1.power()).toBe(1);
    // The bolt is still the only chain item — Gold's Add never joined it.
    expect(game.chain().map((i) => i.cardId)).toEqual(["bolt"]);
  });

  test("the added [rainbow] pays a domain power pip (e.g. a 1-energy + [calm] spell)", async () => {
    const calmSpell = {
      abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
      cardType: "spell",
      domain: "calm",
      energyCost: 1,
      name: "Calm Cantrip",
      powerCost: ["calm"],
      timing: "action",
    };
    const game = await scenario().resources(P1, { energy: 1 }).gear(P1, GOLD, "gold").hand(P1, calmSpell, "cantrip").build();
    expect(game.p1.can("cast", "cantrip")).toBe(false);
    await game.p1.activate("gold");
    expect(game.p1.can("cast", "cantrip")).toBe(true);
    await game.p1.cast("cantrip");
    expect(game.p1.resources().energy).toBe(0);
    expect(game.p1.power()).toBe(0);
  });
});
