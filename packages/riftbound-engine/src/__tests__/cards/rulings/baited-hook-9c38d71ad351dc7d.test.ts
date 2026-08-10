/**
 * Ruling 9c38d71ad351dc7d — Baited Hook (OGN-242 → ogn-242-298) · Gear · Order · 3
 *     "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 cards of your Main Deck. You may banish a unit from
 *      among them that has Might up to 1 more than the killed unit and play it, ignoring its cost. Then recycle the rest."
 *   × Soraka, Wanderer (SFD-173 → sfd-173-221) · 4 Might "If another unit you control here would die, if it has less
 *     Might than me, instead heal it, exhaust it, and recall it."
 *
 * Q: Soraka, Baited Hook and my 3-Might unit are all in base; I Hook the 3-Might unit. Do I keep it AND get the Hook?
 * A: You keep the unit (Soraka's replacement saves it: healed, exhausted, "recalled" to base) but the Hook has no
 *    "killed unit" to compare against — you still look at the top 5, may play nothing, and recycle all 5.
 * Rules: 366–373 (replacement effects, "instead"), 415.2 (kill = board → trash), 359.3.e.12 (missing referent → null).
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BAITED_HOOK = "ogn-242-298";
const SORAKA = "sfd-173-221";
const LOOKED = ["one", "two", "three", "four", "junk"];

/** P1's turn. Base: Soraka (4), a damaged 3-Might Brawler, Baited Hook (ready); [1][order]. Deck top→: One Two Three Four Junk(spell), then Six. */
function board(withSoraka: boolean) {
  const s = scenario()
    .resources(P1, { energy: 1, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Onlooker" }, "onlooker")
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, "base", { might: 3, name: "Brawler" }, "brawler", { damage: 1 })
    .deck(
      P1,
      [
        { cardType: "unit", energyCost: 1, might: 1, name: "One" },
        { cardType: "unit", energyCost: 2, might: 2, name: "Two" },
        { cardType: "unit", energyCost: 3, might: 3, name: "Three" },
        { cardType: "unit", energyCost: 4, might: 4, name: "Four" },
        { cardType: "spell", energyCost: 1, name: "Junk" },
        { cardType: "unit", energyCost: 1, might: 1, name: "Six" },
      ],
      [...LOOKED, "six"],
    );
  return withSoraka ? s.unit(P1, "base", SORAKA, "soraka") : s;
}

describe("Ruling 9c38d71ad351dc7d — Soraka saves the Hooked unit, so Baited Hook finds no unit to play", () => {
  test("control (no Soraka): the Brawler (3) is killed and P1 is offered the looked-at units with Might ≤ 4", async () => {
    const game = await board(false).build();
    await game.p1.activate("hook", 0, { targets: "brawler" });
    const stop = await game.settle();
    expect(game.zoneOf("brawler")).toBe("trash");
    expect(stop.reason).toBe("unanswered");
    const d = game.decision() as Extract<Decision, { kind: "pick" }>;
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["four", "one", "three", "two"]);
  });

  test("with Soraka (4 > 3, same location): activation is legal and paid; on resolution the Brawler is NOT killed — healed, exhausted, still in base", async () => {
    const game = await board(true).build();
    expect(game.state("brawler").damage).toBe(1);
    await game.p1.activate("hook", 0, { targets: "brawler" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.state("hook").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hook", targets: ["brawler"] })]);
    await game.settle();
    expect(game.zoneOf("brawler")).toBe("base");
    expect(game.p1.trash()).not.toContain("brawler");
    expect(game.state("brawler")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.zoneOf("soraka")).toBe("base");
  });

  test("…and the Hook only partially resolves: the top 5 are looked at but NO unit may be played (no killed unit → null Might); all 5 are recycled, Six is the new top", async () => {
    const game = await board(true).build();
    await game.p1.activate("hook", 0, { targets: "brawler" });
    await game.settle();
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      // If the look step is surfaced at all it must offer none of the looked-at cards.
      expect(d.allowDecline).toBe(true);
      expect(d.options.filter((o) => LOOKED.includes(String(o.card ?? o.key)))).toEqual([]);
      await game.p1.decline();
      await game.settle();
    }
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.units().sort()).toEqual(["brawler", "soraka"]); // nothing new was played
    for (const c of LOOKED) {
      expect(game.zoneOf(c)).toBe("mainDeck");
    }
    expect(game.p1.deck()[0]).toBe("six");
    expect(game.p1.deck().slice(-5).sort()).toEqual([...LOOKED].sort());
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } }); // costs stay paid
    expect(game.violations()).toEqual([]);
  });
});
