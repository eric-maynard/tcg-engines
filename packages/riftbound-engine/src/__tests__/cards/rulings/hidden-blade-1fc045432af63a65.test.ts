/**
 * Ruling 1fc045432af63a65 — Hidden Blade (OGN-213 → ogn-213-298, Action, 2 + [order]) "Kill a unit at a battlefield.
 *   Its controller draws 2."
 *   × Baited Hook (ogn-242-298, Gear) "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 cards of your Main
 *     Deck. You may banish a unit from among them that has Might up to 1 more than the killed unit and play it, ignoring
 *     its cost. Then recycle the rest."
 *   × Zhonya's Hourglass (ogn-077-298, Gear) "If a friendly unit would die, kill this instead. Heal that unit, exhaust
 *     it, and recall it."
 *
 * Q: If the unit Hidden Blade / Baited Hook would kill is saved by Zhonya's, do the draw / the summon still happen?
 * A: Hidden Blade still draws 2 — "its controller" only needs the target to have been valid, not to have died.
 *    Baited Hook does NOT summon — it keys off "the killed unit"'s Might and nothing was killed; the look at the top
 *    cards (and recycle) still happens.
 * Rules: 369–370 (replacement: the unit never died), 359.3.e.14 (linked instruction referencing the unit vs the kill).
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const BAITED_HOOK = "ogn-242-298";
const ZHONYAS = "ogn-077-298";

describe("Ruling 1fc045432af63a65 — Hidden Blade into Zhonya's: no death, but 'its controller' (P2) still draws 2", () => {
  /** P1's turn. P2's damaged Victim (3, 1 damage) at P2's bf1; P2's Hourglass face up in base. P1: Hidden Blade + exactly 2 + [order]. */
  function board(withHourglass: boolean) {
    const s = scenario()
      .resources(P1, { energy: 2, power: { order: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Victim" }, "victim", { damage: 1 })
      .deck(P2, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["p2a", "p2b", "p2c"])
      .hand(P1, HIDDEN_BLADE, "blade");
    return withHourglass ? s.gear(P2, ZHONYAS, "zh") : s;
  }

  test("control (no Hourglass): Victim dies and P2 — its controller — draws 2; the caster draws nothing", async () => {
    const game = await board(false).build();
    await game.p1.cast("blade", { targets: "victim" });
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.p2.hand()).toEqual(["p2a", "p2b"]);
    expect(game.p1.hand()).toEqual([]);
  });

  test("with Zhonya's: the Hourglass is killed instead; Victim is healed, exhausted and recalled to base — it did NOT die …", async () => {
    const game = await board(true).build();
    await game.p1.cast("blade", { targets: "victim" });
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.state("victim")).toMatchObject({ damage: 0, isExhausted: true, location: "base" });
    expect(game.p2.trash()).not.toContain("victim");
  });

  test("… and P2 STILL draws 2 ('its controller' only needed a valid target at resolution); Hidden Blade → trash", async () => {
    const game = await board(true).build();
    await game.p1.cast("blade", { targets: "victim" });
    await game.settle();
    expect(game.p2.hand()).toEqual(["p2a", "p2b"]);
    expect(game.p1.hand()).toEqual([]);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});

describe("Ruling 1fc045432af63a65 — Baited Hook into your own Zhonya's: nothing was killed → no Might to compare → no unit is played", () => {
  /**
   * P1's turn. P1: Baited Hook ready, exactly [1][order], a damaged 3-Might Bait in base, optionally Zhonya's face up.
   * P1's deck top→: Two(2) Three(3) Four(4) One(1) Junk(spell), then Six(1) as the 6th card.
   */
  function board(withHourglass: boolean) {
    const s = scenario()
      .resources(P1, { energy: 1, power: { order: 1 } })
      .battlefield("bf1", { controller: P2 })
      .gear(P1, BAITED_HOOK, "hook")
      .unit(P1, "base", { might: 3, name: "Bait" }, "bait", { damage: 1 })
      .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
      .deck(
        P1,
        [
          { cardType: "unit", energyCost: 2, might: 2, name: "Two" },
          { cardType: "unit", energyCost: 3, might: 3, name: "Three" },
          { cardType: "unit", energyCost: 4, might: 4, name: "Four" },
          { cardType: "unit", energyCost: 1, might: 1, name: "One" },
          { cardType: "spell", energyCost: 1, name: "Junk" },
          { cardType: "unit", energyCost: 1, might: 1, name: "Six" },
        ],
        ["two", "three", "four", "one", "junk", "six"],
      );
    return withHourglass ? s.gear(P1, ZHONYAS, "zh") : s;
  }

  const LOOKED = ["two", "three", "four", "one", "junk"];

  test("control (no Hourglass): Bait (3) dies → P1 is offered the units of Might ≤ 4 among the top 5 (a 'you may' pick)", async () => {
    const game = await board(false).build();
    await game.p1.activate("hook", 0, { targets: "bait" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    const stop = await game.settle();
    expect(game.zoneOf("bait")).toBe("trash");
    expect(stop.reason).toBe("unanswered");
    const d = game.decision() as Extract<Decision, { kind: "pick" }>;
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["four", "one", "three", "two"]);
    await game.p1.pick("four");
    await game.settle({ policy: "first" });
    expect(["base", "battlefield-bf1"]).toContain(game.zoneOf("four")); // played, ignoring its cost
  });

  test("with Zhonya's: the Hourglass dies instead, Bait lives (healed, exhausted, in base) — and NO unit is offered/played: the top 5 are looked at and all recycled", async () => {
    const game = await board(true).build();
    await game.p1.activate("hook", 0, { targets: "bait" });
    const stop = await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("bait")).toBe("base");
    expect(game.state("bait")).toMatchObject({ damage: 0, isExhausted: true });
    // No "killed unit" → no Might ceiling exists → nothing may be banished/played. Either no prompt at all, or an
    // empty/decline-only one.
    if (stop.reason === "unanswered" && game.decision()?.kind === "pick") {
      const d = game.decision() as Extract<Decision, { kind: "pick" }>;
      expect(d.options.filter((o) => LOOKED.includes(String(o.card ?? o.key)))).toEqual([]);
      await game.p1.decline();
      await game.settle();
    }
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    for (const c of LOOKED) {
      expect(game.zoneOf(c)).toBe("mainDeck"); // none played, none banished
    }
    expect(game.p1.banishment()).toEqual([]);
    // "Then recycle the rest": the five looked-at cards went to the bottom — the 6th card is now on top.
    expect(game.p1.deck()[0]).toBe("six");
    expect(game.p1.deck().slice(-5).sort()).toEqual([...LOOKED].sort());
    expect(game.state("hook").isExhausted).toBe(true); // cost stays paid
    expect(game.violations()).toEqual([]);
  });
});
