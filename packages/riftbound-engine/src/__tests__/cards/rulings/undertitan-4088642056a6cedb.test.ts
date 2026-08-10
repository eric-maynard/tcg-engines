/**
 * Ruling 4088642056a6cedb — Undertitan (SFD-175 → sfd-175-221) 6+[order], 5 Might "When you play me, give your other units
 *   +2 [Might] this turn. As I'm revealed from your deck, [Add] [2]."
 *   × Baited Hook (OGN-242 → ogn-242-298) "[1][order], [Exhaust]: Kill a friendly unit. LOOK at the top 5 cards of your Main
 *     Deck. You may banish a unit … and play it … Then recycle the rest."
 *   Nuance cards: Nocturne, Horrifying (OGN-194 → ogn-194-298 "As you LOOK AT or reveal me from the top of your deck, you may
 *   banish me …") with Stacked Deck (OGN-183 → ogn-183-298 "Look at the top 3 cards … Put 1 into your hand and recycle the rest").
 *
 * Q: If Hook lets me look at the top of my deck and I see Undertitan, do I get to float 2 energy?
 * A: No. Looking is not revealing; Undertitan only adds [2] when REVEALED from the deck. (Nocturne works off Stacked Deck only
 *    because it says "look at or reveal".)
 * Rules: 409 (Look) vs 410 (Reveal) are distinct game actions; 762-style "As I'm revealed" replacement-timed effects.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const UNDERTITAN = "sfd-175-221";
const BAITED_HOOK = "ogn-242-298";
const STACKED_DECK = "ogn-183-298";
const NOCTURNE = "ogn-194-298";
const APPRENTICE_SMITH = "sfd-041-221"; // "When I move, REVEAL the top card of your Main Deck. If it's a gear, draw it. Otherwise, recycle it."
const SKULKER = "ogn-175-298";

describe("Ruling 4088642056a6cedb — looking at Undertitan (Baited Hook / Stacked Deck) is not revealing it: no [Add] [2]", () => {
  test("control: an actual REVEAL from the deck (Apprentice Smith moves) does add 2 energy for Undertitan", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", APPRENTICE_SMITH, "smith")
      .deck(P1, [UNDERTITAN, SKULKER], ["titan", "f1"])
      .build();
    expect(game.p1.energy()).toBe(0);
    await game.p1.move("smith", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority(); // Smith's trigger resolves: reveals Undertitan (not a gear → recycled)
    expect(game.p1.energy()).toBe(2);
    expect(game.zoneOf("titan")).toBe("mainDeck");
  });

  test("Baited Hook LOOKS at the top 5 with Undertitan among them: Undertitan is seen (even offered as the pick) but P1's energy never rises — 0 at the look, 0 after declining and recycling", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { order: 1 } })
      .battlefield("bf1", { controller: null })
      .gear(P1, BAITED_HOOK, "hook")
      .unit(P1, "base", { might: 4, name: "Bait" }, "bait")
      .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
      .deck(P1, [UNDERTITAN, SKULKER, SKULKER, SKULKER, SKULKER, SKULKER], ["titan", "f1", "f2", "f3", "f4", "below"])
      .build();
    await game.p1.activate("hook");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.p1.passPriority();
    await game.p2.passPriority();
    if (game.decision()?.kind === "pick" && game.decision()?.source?.pendingChoiceType === "choose-target") {
      await game.p1.pick("bait");
    }
    expect(game.zoneOf("bait")).toBe("trash");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const seen = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(seen).toContain("titan"); // P1 is looking right at it (5 Might ≤ 4+1, so it is even selectable)
    expect(game.p1.energy()).toBe(0); // looking ≠ revealing
    await game.p1.decline();
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("titan")).toBe("mainDeck"); // recycled with the rest
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("Stacked Deck likewise only LOOKS: taking Undertitan into hand from the top 3 yields no energy", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: null })
      .hand(P1, STACKED_DECK, "sd")
      .deck(P1, [UNDERTITAN, SKULKER, SKULKER, SKULKER], ["titan", "f1", "f2", "below"])
      .build();
    await game.p1.cast("sd");
    expect(game.p1.energy()).toBe(0);
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(game.p1.energy()).toBe(0);
    await game.p1.pick("titan");
    await game.settle();
    expect(game.p1.hand()).toEqual(["titan"]);
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.deck()[0]).toBe("below"); // f1/f2 recycled under
  });

  test("nuance: Nocturne DOES work off Stacked Deck's look ('as you look at OR reveal me') — P1 is asked about Nocturne while merely looking, whereas Undertitan in the same look adds nothing", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: null })
      .hand(P1, STACKED_DECK, "sd")
      .deck(P1, [UNDERTITAN, NOCTURNE, SKULKER, SKULKER], ["titan", "noc", "f1", "below"])
      .build();
    await game.p1.cast("sd");
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(d?.source?.cardId ?? d?.prompt).toMatch(/noc/i);
    expect(game.p1.energy()).toBe(0);
    await game.p1.no();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    expect(game.p1.energy()).toBe(0);
  });
});
