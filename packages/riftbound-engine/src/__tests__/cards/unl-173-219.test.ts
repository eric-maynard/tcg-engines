/**
 * Sacrifice — unl-173-219 · Spell (Reaction) · Order · 1 energy
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   As an additional cost to play this, kill a friendly [Mighty] unit. (A unit is Mighty while it has
 *   5+ [Might].)
 *   Draw 2 and channel 1 rune exhausted.
 *
 * Rules: 356.2.a.1 (a MANDATORY additional cost — no legal friendly Mighty unit ⇒ the spell cannot be
 * played at all; the kill is paid while playing, before anyone gets priority), 708/710 (Mighty = current
 * Might ≥ 5 on the board, buffs and temporary modifiers count), 740.1.a ("friendly" = you control it),
 * 425 (a countered spell does nothing — but costs already paid stay paid), 430.2/430.3 (channel …
 * exhausted; with an empty rune deck channel as many as possible = 0, the rest still happens), 808
 * (killing the unit is a real death: Deathknell fires; 808.1.d.3 "if I was Mighty" reads it as it died),
 * 309.1.a / 308.1.a / 312 (Reaction: playable in Closed and Showdown states — but only while you
 * actually hold priority/focus).
 *
 * Head-judge corner cases for THIS card:
 *   1. Eligibility is exact and live: a printed 5 qualifies, a printed 4 does not, a buffed 4 (=5) does,
 *      an ENEMY 7 never does; with no eligible unit (or 0 energy) the spell is simply not legal.
 *   2. The kill is a COST: the chosen unit is already in the trash while Sacrifice sits on the chain and
 *      P2 holds priority; if P2 counters it (Wind Wall) the unit stays dead and P1 gets nothing.
 *   3. Resolution: +2 cards, +1 rune that is EXHAUSTED (not usable for energy this turn); with an empty
 *      rune deck still +2 cards and no error.
 *   4. Reaction timing: on P2's turn P1 cannot fire it into a Neutral Open state, nor while P2 still holds
 *      priority over their own spell — only once priority passes; then it resolves BEFORE P2's spell.
 *      Also legal with Focus in a showdown.
 *   5. Synergy: sacrificing a Deathknell unit (buffed Machine Evangel → 3 Recruits; Unsung Hero pumped to
 *      5 → "if I was Mighty" draws 2 more = 4 cards total) — the Deathknell trigger lands above Sacrifice.
 *   6. With two Mighty units the caster picks which one dies; the other is untouched.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-173-219";
const WIND_WALL = "ogn-064-298"; // Calm Reaction · 3 + [calm][calm] · Counter a spell.
const MACHINE_EVANGEL = "ogn-239-298"; // Order unit · 4 Might · Deathknell — play three 1-Might Recruit tokens.
const UNSUNG_HERO = "sfd-167-221"; // Order unit · 2 Might · Deathknell — If I was Mighty, draw 2.
const OPP_DRAW = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Opp Cantrip",
  rulesText: "Draw 1.",
  timing: "action",
};

function board(energy = 1) {
  return scenario()
    .resources(P1, { energy })
    .unit(P1, "base", { might: 5, name: "Big" }, "big")
    .unit(P1, "base", { might: 6, name: "Bigger" }, "bigger")
    .unit(P1, "base", { might: 4, name: "Small" }, "small")
    .unit(P2, "base", { might: 7, name: "Theirs" }, "theirs")
    .hand(P1, CARD, "sac");
}

describe("Sacrifice (unl-173-219)", () => {
  test("registry payload: Reaction spell with a mandatory kill-a-friendly-Mighty-unit additional cost, then draw 2 + channel 1 exhausted", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "order", energyCost: 1, name: "Sacrifice", timing: "reaction" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([
      {
        additionalCost: { kill: { controller: "friendly", filter: "mighty", type: "unit" } },
        effect: { effects: [{ amount: 2, type: "draw" }, { amount: 1, exhausted: true, type: "channel" }], type: "sequence" },
        timing: "reaction",
        type: "spell",
      },
    ]);
  });

  test("eligible sacrifices are exactly the friendly units with 5+ Might: Big (5) and Bigger (6) — not Small (4), not the enemy 7", async () => {
    const game = await board().build();
    const offered = game.p1.option("cast", "sac")?.fields.find((f) => f.arg === "sacrifice")?.options;
    expect([...(offered ?? [])].sort()).toEqual(["big", "bigger"]);
    expect((await game.p1.try((p) => p.play("sac", { sacrifice: "small" }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.play("sac", { sacrifice: "theirs" }))).ok).toBe(false);
    expect(game.zoneOf("sac")).toBe("hand");
    expect(game.p1.energy()).toBe(1);
  });

  test("mandatory cost: with no friendly Mighty unit — or with one but 0 energy — Sacrifice is not playable", async () => {
    const none = await scenario().resources(P1, { energy: 5 }).unit(P1, "base", { might: 4 }, "small").unit(P2, "base", { might: 7 }, "theirs").hand(P1, CARD, "sac").build();
    expect(none.p1.can("cast", "sac")).toBe(false);
    const broke = await board(0).build();
    expect(broke.p1.can("cast", "sac")).toBe(false);
  });

  test("Mighty is CURRENT Might (710): a printed-4 unit carrying a +1 buff is a legal sacrifice", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", { might: 4, name: "Buffed" }, "buffed", { buffed: true }).hand(P1, CARD, "sac").build();
    expect(game.state("buffed").might).toBe(5);
    expect(game.p1.can("cast", "sac")).toBe(true);
    await game.p1.play("sac", { sacrifice: "buffed" });
    expect(game.zoneOf("buffed")).toBe("trash");
  });

  test("the kill is paid on PLAY: 1 energy spent, the chosen unit is in the trash while Sacrifice is on the chain and P2 holds priority; the other Mighty unit is untouched", async () => {
    const game = await board().build();
    await game.p1.play("sac", { sacrifice: "bigger" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("sac")).toBe("chain");
    expect(game.zoneOf("bigger")).toBe("trash");
    expect(game.zoneOf("big")).toBe("base");
    expect(game.p1.hand()).toHaveLength(0); // nothing drawn yet
    expect(game.p1.runes()).toHaveLength(0);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.zoneOf("bigger")).toBe("trash");
  });

  test("resolves: draw 2 and channel 1 rune that enters EXHAUSTED (no energy from it this turn); spell → trash", async () => {
    const game = await board().build();
    await game.p1.play("sac", { sacrifice: "big" });
    await game.settle();
    expect(game.zoneOf("sac")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
    expect(game.state(game.p1.runes()[0]!).isExhausted).toBe(true);
    expect(game.p1.can("tapRune")).toBe(false);
    expect(game.p1.energy()).toBe(0);
    // Next own turn the channeled rune readies like any other (3 runes: it + 2 channeled).
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.p1.runes({ ready: true })).toHaveLength(3);
  });

  test("empty rune deck (430.3): channel as many as possible = 0, but still draw 2 and no error", async () => {
    const game = await scenario().fillDecks({ main: 10, runes: 0 }).resources(P1, { energy: 1 }).unit(P1, "base", { might: 5 }, "big").hand(P1, CARD, "sac").build();
    expect(game.p1.runeDeck()).toHaveLength(0);
    await game.p1.play("sac", { sacrifice: "big" });
    await game.settle();
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.p1.runes()).toHaveLength(0);
    expect(game.violations()).toEqual([]);
  });

  test("countered (Wind Wall): no cards, no rune — and the sacrificed unit stays dead (costs are not refunded)", async () => {
    const game = await board().resources(P2, { energy: 3, power: { calm: 2 } }).hand(P2, WIND_WALL, "ww").build();
    await game.p1.play("sac", { sacrifice: "big" });
    await game.p1.passPriority();
    await game.p2.cast("ww", { targets: "sac" });
    expect(game.chain().map((c) => c.name)).toEqual(["Sacrifice", "Wind Wall"]);
    await game.settle();
    expect(game.zoneOf("big")).toBe("trash");
    expect(game.zoneOf("sac")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(0);
    expect(game.p1.runes()).toHaveLength(0);
    expect(game.p1.energy()).toBe(0);
  });

  test("[Reaction] on the opponent's turn: not into their Neutral Open state, not while THEY hold priority over their spell; once passed, P1 responds and Sacrifice resolves first", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 1 })
      .unit(P1, "base", { might: 5, name: "Big" }, "big")
      .hand(P1, CARD, "sac")
      .hand(P2, OPP_DRAW, "cantrip")
      .build();
    expect(game.p1.can("cast", "sac")).toBe(false); // 316.5.b: only the turn player acts in Neutral Open
    await game.p2.cast("cantrip");
    expect(game.actingSeat()).toBe(P2);
    expect(game.p1.can("cast", "sac")).toBe(false); // P2 still holds priority
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "sac")).toBe(true);
    await game.p1.play("sac", { sacrifice: "big" });
    expect(game.chain().map((c) => c.name)).toEqual(["Opp Cantrip", "Sacrifice"]);
    expect(game.zoneOf("big")).toBe("trash");
    await game.p1.passPriority();
    await game.p2.passPriority(); // Sacrifice (top) resolves first
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    expect(game.p2.hand()).toHaveLength(0); // cantrip still pending underneath
    expect(game.chain().map((c) => c.name)).toEqual(["Opp Cantrip"]);
    await game.settle();
    expect(game.p2.hand()).toHaveLength(1);
  });

  test("[Reaction] with Focus in a showdown on your own turn: legal, and the sacrificed unit may be one sitting safely in base", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 5, name: "Big" }, "big")
      .unit(P1, "base", { might: 1, name: "Scout" }, "scout")
      .unit(P2, "bf1", { might: 1, name: "Foe" }, "foe")
      .hand(P1, CARD, "sac")
      .build();
    await game.p1.move("scout", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "sac")).toBe(true);
    await game.p1.play("sac", { sacrifice: "big" });
    expect(game.zoneOf("big")).toBe("trash");
    await game.settle(); // chain resolves, focus goes round, then the 1-vs-1 combat trades
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("Deathknell synergy: sacrificing a buffed Machine Evangel (4+1 = Mighty) puts its Deathknell above Sacrifice → 3 Recruit tokens, then 2 cards + 1 exhausted rune", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", MACHINE_EVANGEL, "evangel", { buffed: true }).hand(P1, CARD, "sac").build();
    expect(game.state("evangel").might).toBe(5);
    await game.p1.play("sac", { sacrifice: "evangel" });
    expect(game.chain().map((c) => [c.name, c.triggered])).toEqual([
      ["Sacrifice", false],
      ["Machine Evangel", true],
    ]);
    await game.settle();
    expect(game.zoneOf("evangel")).toBe("trash");
    expect(game.p1.base().filter((c) => c.startsWith("token-recruit-"))).toHaveLength(3);
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
  });

  test("LKI (808.1.d.3): Unsung Hero pumped to exactly 5 is a legal sacrifice and 'was Mighty' as it died → its Deathknell draws 2 more (4 cards total)", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", UNSUNG_HERO, "hero", { mightModifier: 3 }).hand(P1, CARD, "sac").build();
    expect(game.state("hero").might).toBe(5);
    await game.p1.play("sac", { sacrifice: "hero" });
    await game.settle();
    expect(game.zoneOf("hero")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(4);
    expect(game.p1.runes()).toHaveLength(1);
    // Negative: an unpumped 2-Might Unsung Hero is not even a legal sacrifice.
    const plain = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", UNSUNG_HERO, "hero").hand(P1, CARD, "sac").build();
    expect(plain.p1.can("cast", "sac")).toBe(false);
  });
});
