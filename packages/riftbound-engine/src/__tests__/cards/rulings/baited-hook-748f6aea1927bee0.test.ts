/**
 * Ruling 748f6aea1927bee0 — Baited Hook (OGN-242 → ogn-242-298, Gear) "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5
 *     cards of your Main Deck. You may banish a unit from among them that has Might up to 1 more than the killed unit and play it,
 *     ignoring its cost. Then recycle the rest."
 *   × The Boss (OGN-269 → ogn-269-298, Sett legend) "If a buffed unit you control would die, you may pay [rainbow], exhaust me, and spend
 *     its buff to heal it, exhaust it, and recall it instead."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, recall it."
 *
 * Q: Baited Hook my unit, then save it with the Sett legend / Zhonya's — do I still get to play a unit off the Hook?
 * A: No — the unit must actually be killed. You still look at ("excavate") 5 cards but play nothing: there is no killed
 *    unit's Might to compare to. Nuances: the looked-at units are compared by PRINTED Might; the killed unit by its CURRENT
 *    Might on the board (buffs count); Assault never counts (only attackers in combat have it).
 * Rules: 415.2 (killed = board → trash), 371–373 (replacements), 140.x (Might on board vs in other zones), 803 (Assault only while attacking).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BAITED_HOOK = "ogn-242-298";
const THE_BOSS = "ogn-269-298";
const ZHONYAS = "ogn-077-298";

type Bait = { might: number; buffed?: boolean; assault?: number };

/**
 * P1's turn. P1: Baited Hook ready, [1][order] + 1 body (the Boss's [rainbow]), the Bait in base.
 * Deck top→: One(1) Two(2) Three(3) Four(4) Five(5), then Six as the 6th card.
 */
function board(bait: Bait, saver: "none" | "boss" | "zhonyas") {
  const def = {
    abilities: bait.assault ? [{ keyword: "Assault", type: "keyword", value: bait.assault }] : [],
    cardType: "unit",
    energyCost: 1,
    keywords: bait.assault ? ["Assault"] : [],
    might: bait.might,
    name: "Bait",
  };
  let s = scenario()
    .resources(P1, { energy: 1, power: { body: 1, order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, "base", def, "bait", bait.buffed ? { buffed: true } : {})
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .deck(
      P1,
      [
        { cardType: "unit", energyCost: 1, might: 1, name: "One" },
        { cardType: "unit", energyCost: 2, might: 2, name: "Two" },
        { cardType: "unit", energyCost: 3, might: 3, name: "Three" },
        { cardType: "unit", energyCost: 4, might: 4, name: "Four" },
        { cardType: "unit", energyCost: 5, might: 5, name: "Five" },
        { cardType: "unit", energyCost: 1, might: 1, name: "Six" },
      ],
      ["one", "two", "three", "four", "five", "six"],
    );
  if (saver === "boss") {
    s = s.legend(P1, THE_BOSS, "boss");
  } else if (saver === "zhonyas") {
    s = s.gear(P1, ZHONYAS, "zh");
  }
  return s;
}

const LOOKED = ["one", "two", "three", "four", "five"];

/** Hook the Bait and settle to the "you may banish/play" pick; return the offered card ids. */
async function hookAndOffered(game: Game): Promise<string[]> {
  await game.p1.activate("hook", 0, { targets: "bait" });
  const stop = await game.settle();
  expect(game.zoneOf("bait")).toBe("trash");
  expect(stop.reason).toBe("unanswered");
  const d = game.decision() as Extract<Decision, { kind: "pick" }>;
  expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
  return d.options.map((o) => String(o.card ?? o.key)).sort();
}

async function expectLookedAndRecycledNothingPlayed(game: Game): Promise<void> {
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    expect(d.options.filter((o) => LOOKED.includes(String(o.card ?? o.key)))).toEqual([]);
    await game.p1.decline();
    await game.settle();
  }
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  for (const c of LOOKED) {
    expect(game.zoneOf(c)).toBe("mainDeck");
  }
  expect(game.p1.banishment()).toEqual([]);
  expect(game.p1.deck()[0]).toBe("six"); // all five looked-at cards recycled under it
  expect(game.p1.deck().slice(-5).sort()).toEqual([...LOOKED].sort());
}

describe("Ruling 748f6aea1927bee0 — no kill, no Might to compare: a saved Bait means Baited Hook plays nothing", () => {
  test("Sett (The Boss): P1 is asked, says yes and pays — the buffed Bait is healed/exhausted/recalled instead of dying; Hook still looks at 5 but offers nothing and recycles all", async () => {
    const game = await board({ buffed: true, might: 2 }, "boss").build();
    await game.p1.activate("hook", 0, { targets: "bait" });
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "boss" } });
    await game.p1.yes();
    await game.settle();
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, order: 0 } });
    expect(game.zoneOf("bait")).toBe("base");
    expect(game.state("bait")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true });
    await expectLookedAndRecycledNothingPlayed(game);
    expect(game.violations()).toEqual([]);
  });

  test("Zhonya's: the Hourglass dies instead, Bait lives — Hook looks at 5, offers nothing, recycles all", async () => {
    const game = await board({ might: 2 }, "zhonyas").build();
    await game.p1.activate("hook", 0, { targets: "bait" });
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("bait")).toBe("base");
    expect(game.state("bait")).toMatchObject({ damage: 0, isExhausted: true });
    await expectLookedAndRecycledNothingPlayed(game);
    expect(game.violations()).toEqual([]);
  });

  test("nuance — the killed unit counts by CURRENT Might: a buffed 2-Might Bait (= 3) unlocks printed Might ≤ 4 (One…Four, not Five)", async () => {
    const game = await board({ buffed: true, might: 2 }, "none").build();
    expect(game.state("bait").might).toBe(3);
    expect(await hookAndOffered(game)).toEqual(["four", "one", "three", "two"]);
  });

  test("nuance — an unbuffed 2-Might Bait unlocks printed Might ≤ 3 only (One, Two, Three)", async () => {
    const game = await board({ might: 2 }, "none").build();
    expect(await hookAndOffered(game)).toEqual(["one", "three", "two"]);
  });

  test("nuance — Assault does not count outside an attack: a 1-Might [Assault 3] Bait unlocks printed Might ≤ 2 only (One, Two)", async () => {
    const game = await board({ assault: 3, might: 1 }, "none").build();
    expect(game.state("bait").might).toBe(1);
    expect(await hookAndOffered(game)).toEqual(["one", "two"]);
    await game.p1.pick("two");
    await game.settle({ policy: "first" });
    expect(["base", "battlefield-bf1"]).toContain(game.zoneOf("two")); // played, ignoring cost
    expect(game.p1.energy()).toBe(0);
  });
});
