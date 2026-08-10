/**
 * Ruling bd838974a96d04d0 — Yordle Explorer (SFD-100 → sfd-100-221) · 4 Might · "When you play a card with Power cost [rainbow][rainbow]
 *     or more, draw 1."
 *   × Akshan, Mischievous (SFD-109 → sfd-109-221) · [4] · "[Weaponmaster] You may pay [body][body] as an additional cost to play me.
 *     When you play me, if you paid the additional cost, move an enemy gear to your base…"
 *
 * Q: Can Yordle Explorer draw for Akshan if you pay the additional [body][body] cost?
 * A: No. Yordle Explorer reads the PRINTED Power cost (the Power symbols in the cost box). Akshan has none; the optional additional
 *    [body][body] is not part of the printed cost, so the Explorer does not trigger whether or not it is paid.
 * Rules: 206.1 (a card's cost = printed cost), 356.4 (additional costs only change the total paid).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const YORDLE_EXPLORER = "sfd-100-221";
const AKSHAN = "sfd-109-221";
const FALLING_STAR = "ogn-029-298"; // [2]+[fury][fury] — a printed two-Power card (control)
const GARBAGE_GRABBER = "ogn-099-298"; // an enemy gear so Akshan's paid trigger visibly fires

describe("Ruling bd838974a96d04d0 — Yordle Explorer ignores Akshan's paid additional [body][body]", () => {
  test("control: a card with PRINTED Power cost 2 (Falling Star, [2]+[fury][fury]) does make Yordle Explorer draw 1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 2 } })
      .unit(P1, "base", YORDLE_EXPLORER, "explorer")
      .unit(P2, "base", { might: 7, name: "Dummy" }, "dummy")
      .hand(P1, FALLING_STAR, "star")
      .deck(P1, ["ogn-175-298"], ["d1"])
      .build();
    expect(game.state("star").powerCost).toHaveLength(2);
    await game.p1.cast("star", { targets: ["dummy", "dummy"] });
    await game.settle();
    expect(game.zoneOf("star")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1"]);
  });

  test("Akshan's printed Power cost is empty — the [body][body] is an optional ADDITIONAL cost", async () => {
    const game = await scenario().hand(P1, AKSHAN, "akshan").build();
    expect(game.state("akshan")).toMatchObject({ energyCost: 4, powerCost: [] });
  });

  test("Akshan played WITH the additional [body][body] actually paid (his steal trigger fires to prove it): Yordle Explorer does NOT draw", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { body: 2 } })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", YORDLE_EXPLORER, "explorer")
      .gear(P2, GARBAGE_GRABBER, "grabber")
      .hand(P1, AKSHAN, "akshan")
      .deck(P1, ["ogn-175-298"], ["d1"])
      .build();
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
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } }); // the additional cost WAS paid …
    expect(game.state("grabber").controller).toBe(P1); // … its "if you paid" trigger fired …
    expect(game.p1.hand()).toEqual([]); // … yet no Explorer draw
    expect(game.p1.deck()[0]).toBe("d1");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("and (trivially) Akshan played WITHOUT the additional cost doesn't draw either", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { body: 2 } })
      .unit(P1, "base", YORDLE_EXPLORER, "explorer")
      .gear(P2, GARBAGE_GRABBER, "grabber")
      .hand(P1, AKSHAN, "akshan")
      .deck(P1, ["ogn-175-298"], ["d1"])
      .build();
    await game.p1.play("akshan", { payOptional: false, to: "base" });
    await game.settle();
    expect(game.zoneOf("akshan")).toBe("base");
    expect(game.p1.power("body")).toBe(2);
    expect(game.state("grabber").controller).toBe(P2);
    expect(game.p1.hand()).toEqual([]);
  });
});
