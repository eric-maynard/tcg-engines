/**
 * Ruling 09719f79f4d5ade0 — Nocturne, Horrifying (OGN-194 → ogn-194-298, 4, [Ganking])
 *   "As you look at or reveal me from the top of your deck, you may banish me. If you do, you may play me for [rainbow]."
 *   × Traveling Merchant (ogn-185-298, 2 Might) "When I move, discard 1, then draw 1."
 *
 * Q: Can you play Nocturne off Traveling Merchant's discard effect?
 * A: No. Nocturne only replaces LOOKING AT / REVEALING him from the top of your deck. Discarding (hand → trash) and
 *    drawing (deck → hand) are neither, so Merchant's "discard 1, then draw 1" never gives a Nocturne offer.
 * Rules: 369.1/370.1 ("as you …" replacement on look/reveal), 424.1 (reveal), 427 (draw is its own action),
 *        423 (discard: hand → trash).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const NOCTURNE = "ogn-194-298";
const MERCHANT = "ogn-185-298";
const SKULKER = "ogn-175-298"; // vanilla filler

/** Any prompt that offers to banish / play Nocturne. */
function nocturneOffer(d: Decision | null): boolean {
  if (!d) {
    return false;
  }
  if (d.kind === "yes-no") {
    return /nocturne|banish/i.test(`${d.prompt} ${d.consequence ?? ""}`) || d.source?.cardId === "noc";
  }
  if (d.kind === "pick") {
    return /banish/i.test(d.prompt) && d.options.some((o) => (o.card ?? o.key) === "noc");
  }
  return false;
}

/** Move the Merchant onto empty bf1 and drive its move trigger, discarding `discard`; fail on any Nocturne offer. */
async function moveMerchantDiscarding(game: Game, discard: string): Promise<void> {
  await game.p1.move("merchant", "bf1");
  for (let i = 0; i < 20; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      return;
    }
    expect(nocturneOffer(d)).toBe(false);
    if (d.kind === "pick" && d.seat === P1 && d.options.some((o) => (o.card ?? o.key) === discard)) {
      await game.p1.pick(discard);
    } else if (d.kind === "pick" && d.options.length === 1 && d.min === 1) {
      await game.seat(d.seat).pick(d.options[0]?.key as string);
    } else if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else {
      return; // leave anything unexpected for the test to inspect
    }
  }
}

describe("Ruling 09719f79f4d5ade0 — Traveling Merchant's discard/draw never wakes Nocturne", () => {
  test("DISCARDING Nocturne to Merchant's 'When I move': Nocturne goes hand → trash, no banish/play offer, [rainbow] unspent; then P1 draws 1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 0, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", MERCHANT, "merchant")
      .hand(P1, NOCTURNE, "noc")
      .deck(P1, [SKULKER, SKULKER], ["top", "next"])
      .build();
    expect(game.p1.hand()).toEqual(["noc"]);
    await moveMerchantDiscarding(game, "noc");
    expect(nocturneOffer(game.decision())).toBe(false);
    expect(game.locationOf("merchant")).toBe("bf1");
    expect(game.zoneOf("noc")).toBe("trash");
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.units()).not.toContain("noc");
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.p1.hand()).toEqual(["top"]); // "then draw 1"
    await game.settle();
    expect(nocturneOffer(game.decision())).toBe(false);
    expect(game.zoneOf("noc")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("DRAWING Nocturne off the top with Merchant's 'then draw 1' is not a look/reveal either: Nocturne simply arrives in hand, no offer", async () => {
    const game = await scenario()
      .resources(P1, { energy: 0, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", MERCHANT, "merchant")
      .hand(P1, SKULKER, "fodder")
      .deck(P1, [NOCTURNE, SKULKER], ["noc", "next"])
      .build();
    expect(game.p1.deck()[0]).toBe("noc");
    await moveMerchantDiscarding(game, "fodder");
    expect(nocturneOffer(game.decision())).toBe(false);
    expect(game.zoneOf("fodder")).toBe("trash");
    expect(game.zoneOf("noc")).toBe("hand");
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.power("rainbow")).toBe(1);
    await game.settle();
    expect(nocturneOffer(game.decision())).toBe(false);
    expect(game.zoneOf("noc")).toBe("hand");
    expect(game.p1.deck()[0]).toBe("next");
  });
});
