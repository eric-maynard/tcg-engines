/**
 * Ruling b00c4ecfdf39532d — Hexdrinker (SFD-102 → sfd-102-221) · Equipment · Body · [2]
 *   "[Equip] [body] · [Deflect]"  — the [Deflect] sits in the EFFECT box, not the rules-text box.
 *   × Turn to Dust (UNL-070 → unl-070-219) · [2] "Give a gear [Temporary]."
 *
 * Q: If my opponent targets my UNATTACHED Hexdrinker, do they have to pay the Deflect cost?
 * A: No. Effect Text is inactive while the equipment is unattached, so a Hexdrinker lying on the board as a
 *    plain Gear has no [Deflect] at all — it can be chosen for free. Attaching it turns the Effect Text on
 *    (and the wearer is then the one that costs extra to choose).
 * Rules: 718 / 136 (Equipment Effect Text is conferred only while attached; inactive otherwise),
 *        809.1.c.1 ([Deflect] surcharge is owed only by a card that actually has the keyword).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HEXDRINKER = "sfd-102-221";
const TURN_TO_DUST = "unl-070-219";

const WEARER = { cardType: "unit", energyCost: 3, might: 3, name: "Hex Bearer" } as const;

/** P2's turn with [2] and `power` spare rainbow. P1 owns a Hexdrinker, attached or loose. */
function board(power: number, attached: boolean) {
  const s = scenario()
    .active(P2)
    .resources(P2, { energy: 2, power: { rainbow: power } })
    .unit(P1, "base", WEARER, "wearer", attached ? ({ equippedWith: ["hex"] } as Record<string, unknown>) : undefined)
    .hand(P2, TURN_TO_DUST, "dust");
  return attached
    ? s.card("hex", { def: HEXDRINKER, meta: { attachedTo: "wearer" } as Record<string, unknown>, owner: P1, zone: "base" })
    : s.gear(P1, HEXDRINKER, "hex");
}

describe("Ruling b00c4ecfdf39532d — an UNATTACHED Hexdrinker has no [Deflect]: choosing it costs nothing extra", () => {
  test("ruling: unattached, the Gear does not carry the keyword at all", async () => {
    const game = await board(0, false).build();
    expect(game.state("hex").attachedTo).toBeUndefined();
    expect(game.state("hex").keywords).not.toContain("Deflect");
  });

  test("ruling: with ZERO spare power the opponent may still choose the loose Hexdrinker — no surcharge is offered or owed", async () => {
    const game = await board(0, false).build();
    const targets = game.p2.option("cast", "dust")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(targets.flat()).toContain("hex");
    expect(game.p2.can("cast", "dust")).toBe(true);
    await game.p2.cast("dust", { targets: "hex" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } }); // only the printed [2]
    await game.settle();
    expect(game.state("hex").keywords).toContain("Temporary");
    expect(game.violations()).toEqual([]);
  });

  test("ruling: attaching it switches the Effect Text on — the wearer is now the Deflect-protected object", async () => {
    const game = await board(0, true).build();
    expect(game.state("hex").attachedTo).toBe("wearer");
    expect(game.state("wearer").attachments).toEqual(["hex"]);
    expect(game.state("wearer").keywords).toContain("Deflect");
  });

  test("contrast: choosing the WEARER of an attached Hexdrinker with no spare power is illegal; one power makes it legal", async () => {
    const broke = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .unit(P1, "base", WEARER, "wearer", { equippedWith: ["hex"] } as Record<string, unknown>)
      .card("hex", { def: HEXDRINKER, meta: { attachedTo: "wearer" } as Record<string, unknown>, owner: P1, zone: "base" })
      .hand(P2, { abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }], cardType: "spell", energyCost: 1, name: "Test Ping", timing: "action" }, "ping")
      .build();
    expect((await broke.p2.try((p) => p.cast("ping", { targets: "wearer" }))).ok).toBe(false);

    const funded = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { rainbow: 1 } })
      .unit(P1, "base", WEARER, "wearer", { equippedWith: ["hex"] } as Record<string, unknown>)
      .card("hex", { def: HEXDRINKER, meta: { attachedTo: "wearer" } as Record<string, unknown>, owner: P1, zone: "base" })
      .hand(P2, { abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }], cardType: "spell", energyCost: 1, name: "Test Ping", timing: "action" }, "ping")
      .build();
    await funded.p2.cast("ping", { targets: "wearer" });
    expect(funded.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } }); // [1] + the Deflect pip
  });
});
