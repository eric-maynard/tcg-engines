/**
 * Ruling f7e485b7c618c478 — Dragon Form (VEN-116 → ven-116-166) · Spell · Order · [3] · "[Flow] [3]"
 *     "Choose a unit. Its base Might becomes 5 this turn."
 *
 * Q: What happens if I Dragon Form a 1-Might Recruit token? And a unit that currently has 18 Might?
 * A: It SETS the base Might (layer 1); arithmetic modifiers (buffs, gear, "+N this turn") still apply on top.
 *    Recruit 1 → 5 for the turn (it is Mighty), reverting to 1 at end of turn. An 18: printed-18 → 5; base 3 + 15 in
 *    buffs → 5 + 15 = 20; base + gear → 5 + the gear bonus (etc.). Only the base is overwritten, never the total.
 * Rules: 472.1.a.1 ("becomes" sets a base trait, layer 1), 472 layer 3 (arithmetic modifiers apply after), 708 (Mighty),
 *        317.2 (this-turn effects expire).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DRAGON_FORM = "ven-116-166";
const DORANS_BLADE = "sfd-095-221"; // Equipment · +2 Might
const RECRUIT_TOKEN = { cardType: "unit", isToken: true, might: 1, name: "Recruit", tags: ["Recruit"] } as const;

function base() {
  return scenario().resources(P1, { energy: 3 }).hand(P1, DRAGON_FORM, "form");
}

describe("Ruling f7e485b7c618c478 — Dragon Form overwrites only the BASE Might; modifiers still stack on top; it lapses at end of turn", () => {
  test("scenario 1 — a 1-Might Recruit token: base becomes 5 → it is a 5-Might (Mighty) unit this turn; after the turn ends it is a 1 again", async () => {
    const game = await base().unit(P1, "base", RECRUIT_TOKEN, "token-recruit").build();
    expect(game.state("token-recruit")).toMatchObject({ baseMight: 1, might: 1 });
    await game.p1.cast("form", { targets: "token-recruit" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("form")).toBe("trash");
    expect(game.state("token-recruit")).toMatchObject({ meta: { baseMightOverride: 5 }, might: 5 }); // printed base stays 1 underneath
    expect(game.state("token-recruit").might).toBeGreaterThanOrEqual(5); // Mighty threshold (708)
    await game.advanceTurn();
    expect(game.state("token-recruit")).toMatchObject({ baseMight: 1, might: 1 });
    expect(game.state("token-recruit").meta.baseMightOverride).toBeUndefined();
    expect(game.violations()).toEqual([]);
  });

  test("scenario 2a — 18 Might that is ALL printed base: it simply becomes 5", async () => {
    const game = await base().unit(P2, "base", { might: 18, name: "Colossus" }, "colossus").build();
    await game.p1.cast("form", { targets: "colossus" }); // "a unit": enemy units are legal too
    await game.settle();
    expect(game.state("colossus")).toMatchObject({ meta: { baseMightOverride: 5 }, might: 5 });
    await game.advanceTurn();
    expect(game.state("colossus").might).toBe(18);
  });

  test("scenario 2b — 18 = base 3 + 15 from '+Might this turn' effects: base becomes 5 and the +15 still applies → 20", async () => {
    const game = await base().unit(P1, "base", { might: 3, name: "Pumped" }, "pumped", { mightModifier: 15 }).build();
    expect(game.state("pumped")).toMatchObject({ baseMight: 3, might: 18 });
    await game.p1.cast("form", { targets: "pumped" });
    await game.settle();
    expect(game.state("pumped")).toMatchObject({ meta: { baseMightOverride: 5 }, might: 20, mightModifier: 15 });
  });

  test("scenario 2c — base + buff + gear: Knight 3 + buff 1 + Doran's Blade 2 = 6 → base 5 + 1 + 2 = 8 (gear and buff bonuses are re-added on top)", async () => {
    const game = await base()
      .unit(P1, "base", { might: 3, name: "Knight" }, "knight", { buffed: true, equippedWith: ["blade"] })
      .gear(P1, DORANS_BLADE, "blade", { attachedTo: "knight" })
      .build();
    expect(game.state("knight")).toMatchObject({ baseMight: 3, isBuffed: true, might: 6 });
    await game.p1.cast("form", { targets: "knight" });
    await game.settle();
    expect(game.state("knight")).toMatchObject({ attachments: ["blade"], isBuffed: true, meta: { baseMightOverride: 5 }, might: 8 });
    await game.advanceTurn();
    expect(game.state("knight")).toMatchObject({ baseMight: 3, might: 6 });
    expect(game.violations()).toEqual([]);
  });
});
