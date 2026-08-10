/**
 * Ruling 7cd58df39d839b48 — Akshan, Mischievous (SFD-109 → sfd-109-221) · [4] · 4 Might "[Weaponmaster] You may pay [body][body] as an
 *   additional cost to play me. When you play me, if you paid the additional cost, move an enemy gear to your base…"
 *   × Yordle Explorer (SFD-100 → sfd-100-221) · 4 Might "When you play a card with Power cost [rainbow][rainbow] or more, draw 1."
 *
 * Q: Does paying an additional cost (Akshan's [body][body]) raise the card's cost for Yordle Explorer, or does it read printed cost?
 * A: Printed cost only. Additional costs feed the Total Cost paid, but "cost" in card text is always the printed cost — Akshan's
 *    printed Power cost is zero, so Yordle Explorer does not draw even when [body][body] was paid.
 * Rules: 206.1 (cost = printed), 356.4 (additional costs → total cost only).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const AKSHAN = "sfd-109-221";
const YORDLE_EXPLORER = "sfd-100-221";
const YASUO = "ogn-076-298"; // 6 + [calm][calm] — printed Power cost 2, no play trigger (control)
const GARBAGE_GRABBER = "ogn-099-298"; // an enemy gear for Akshan to take

describe("Ruling 7cd58df39d839b48 — Yordle Explorer reads printed Power cost; Akshan's paid [body][body] doesn't count", () => {
  test("control: playing Yasuo (printed [calm][calm]) with Yordle Explorer out draws 1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { calm: 2 } })
      .unit(P1, "base", YORDLE_EXPLORER, "explorer")
      .hand(P1, YASUO, "yasuo")
      .build();
    const hand = game.p1.hand().length;
    await game.p1.play("yasuo");
    await game.settle();
    expect(game.zoneOf("yasuo")).toBe("base");
    expect(game.p1.hand()).toHaveLength(hand); // −1 played, +1 drawn
  });

  test("Akshan played WITH the additional [body][body] (2 Power actually paid; the steal trigger proves it): printed Power cost is 0 → NO draw", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { body: 2 } })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", YORDLE_EXPLORER, "explorer")
      .gear(P2, GARBAGE_GRABBER, "grabber")
      .hand(P1, AKSHAN, "akshan")
      .build();
    const hand = game.p1.hand().length;
    const deck = game.p1.deck().length;
    await game.p1.play("akshan", { payOptional: true, to: "base" });
    for (let i = 0; i < 6; i++) {
      const r = await game.settle();
      const d = game.decision();
      if (r.reason === "unanswered" && d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick("grabber");
      } else {
        break;
      }
    }
    expect(game.zoneOf("akshan")).toBe("base");
    expect(game.p1.power("body")).toBe(0); // the additional cost WAS paid …
    expect(game.state("grabber").controller).toBe(P1); // … (its "if you paid" trigger fired)
    expect(game.p1.hand()).toHaveLength(hand - 1); // … but Yordle Explorer did not draw
    expect(game.p1.deck()).toHaveLength(deck);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("and of course Akshan played plain ([4], no Power) does not draw either", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .unit(P1, "base", YORDLE_EXPLORER, "explorer")
      .hand(P1, AKSHAN, "akshan")
      .build();
    const hand = game.p1.hand().length;
    await game.p1.play("akshan");
    await game.settle();
    expect(game.zoneOf("akshan")).toBe("base");
    expect(game.p1.hand()).toHaveLength(hand - 1);
  });
});
