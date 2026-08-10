/**
 * Ruling 0a4bec1f1fc5ac3c — Sigil of the Storm (OGN-287 → ogn-287-298, Battlefield) "When you conquer here, you must recycle one of
 *     your runes." — illustrating how SEALS work: Seal of Discord (ogn-204-298, Gear, cost [chaos]) "[Exhaust]: [Reaction] — [Add] [chaos]."
 *   × Fading Memories (ogn-180-298) · [4][chaos] "Give a unit at a battlefield or a gear [Temporary]." — a card with a Power cost
 *
 * Q: How do seals work — cost, resource generation, reaction timing?
 * A: Playing a seal from hand costs 1 Power of its colour (recycle one matching rune, once). On board, exhausting it each turn is
 *    free and Adds 1 Power of that colour, which pays Power costs on cards (no further rune recycling needed). Seals can't pay for
 *    effects that specifically RECYCLE runes (Sigil of the Storm). Their [Add] is Reaction-speed and can't be reacted to.
 * Rules: 429 ([Add]: resources added immediately, no chain), 159 / 416 (recycling a rune ≠ spending Power), 357 (paying Power costs).
 */
import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SIGIL = "ogn-287-298";
const SEAL_OF_DISCORD = "ogn-204-298";
const FADING_MEMORIES = "ogn-180-298";

describe("Ruling 0a4bec1f1fc5ac3c — seals: pay 1 matching Power once to play, then a free un-reactable [Add] each turn that pays Power costs (but never 'recycle a rune')", () => {
  test("playing the seal from hand: its cost is [0] + one [chaos] — recycle ONE chaos rune (→ 1 chaos), play it (→ 0); the seal is on the board", async () => {
    const game = await scenario().rune(P1, "chaos", { alias: "cr1" }).rune(P1, "chaos", { alias: "cr2" }).hand(P1, SEAL_OF_DISCORD, "seal").build();
    expect(game.state("seal")).toMatchObject({ energyCost: 0, powerCost: ["chaos"] });
    expect(game.p1.can("play", "seal")).toBe(false); // nothing floating yet
    await game.p1.recycleRune("cr1");
    expect(game.zoneOf("cr1")).toBe("runeDeck");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 1 } });
    await game.p1.play("seal");
    await game.settle();
    expect(game.zoneOf("seal")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.p1.runes()).toEqual(["cr2"]); // only one rune was recycled, once
  });

  test("on board: exhausting the seal is FREE and immediately Adds 1 chaos — no chain item, no priority for the opponent (can't be reacted to)", async () => {
    const game = await scenario().gear(P1, SEAL_OF_DISCORD, "seal").build();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.p1.activate("seal");
    expect(game.state("seal").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 1 } });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // straight back to P1's open main phase
    expect(game.p2.legal()).toEqual([]);
  });

  test("that Power pays a card's Power cost: Fading Memories ([4][chaos]) is uncastable on 4 energy alone, castable once the seal has added [chaos] — no rune recycled", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .rune(P1, "chaos", { alias: "cr" })
      .gear(P1, SEAL_OF_DISCORD, "seal")
      .hand(P1, FADING_MEMORIES, "fade")
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Foe" }, "foe")
      .build();
    expect(game.p1.can("cast", "fade")).toBe(false);
    await game.p1.activate("seal");
    expect(game.p1.can("cast", "fade")).toBe(true);
    await game.p1.cast("fade", { targets: "foe" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.zoneOf("cr")).toBe("runePool"); // the rune stayed put
    await game.settle();
    expect(game.zoneOf("fade")).toBe("trash");
    expect(game.state("foe").keywords).toContain("Temporary");
  });

  test("it readies with everything else, so it can be tapped again on P1's next turn (once 'each turn')", async () => {
    const game = await scenario().gear(P1, SEAL_OF_DISCORD, "seal").build();
    await game.p1.activate("seal");
    expect(game.p1.can("activate", "seal")).toBe(false); // exhausted for this turn
    await game.advanceToTurnOf(P2);
    await game.advanceToTurnOf(P1);
    expect(game.state("seal").isReady).toBe(true);
    await game.p1.activate("seal");
    expect(game.p1.power("chaos")).toBe(1);
  });

  test("Sigil of the Storm's 'recycle one of your runes' cannot be satisfied by a seal or its Power: on conquering, the forced pick offers ONLY P1's runes; the floating seal Power is untouched", async () => {
    const game = await scenario()
      .battlefield("sigil", { controller: P2, def: SIGIL, inert: false, owner: P2 })
      .unit(P2, "sigil", { might: 1, name: "Defender" }, "def")
      .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
      .gear(P1, SEAL_OF_DISCORD, "seal")
      .rune(P1, "chaos", { alias: "r1" })
      .rune(P1, "chaos", { alias: "r2", exhausted: true })
      .build();
    await game.p1.activate("seal");
    expect(game.p1.power("chaos")).toBe(1);
    await game.p1.move("raider", "sigil");
    const r = await game.settle();
    expect(game.gameState.battlefields.sigil?.controller).toBe(P1);
    expect(r.reason).toBe("unanswered");
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", seat: P1 });
    expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["r1", "r2"]);
    expect((await game.p1.try((p) => p.pick("seal"))).ok).toBe(false);
    await game.p1.pick("r1");
    await game.settle();
    expect(game.zoneOf("r1")).toBe("runeDeck");
    expect(game.zoneOf("seal")).toBe("base");
    expect(game.p1.power("chaos")).toBe(1); // the seal's Power was not (and could not be) spent on the recycle
    expect(game.violations()).toEqual([]);
  });
});
