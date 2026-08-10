/**
 * Ruling 77d71cb8c4b4e70e — Hidden Blade (OGN-213 → ogn-213-298) · [Hidden][Action] · 2+[order] "Kill a unit at a battlefield. Its
 *     controller draws 2."
 *   × The Boss (OGN-269 → ogn-269-298, Legend · Sett) "If a buffed unit you control would die, you may pay [rainbow], exhaust me, and
 *     spend its buff to heal it, exhaust it, and recall it instead."
 *
 * Q: I Hidden Blade my own buffed unit and use Sett to spend the buff and save it. Do I still draw 2?
 * A: Yes. The Boss is a replacement effect applied during the "kill": it only changes what happens to the unit (recalled instead
 *    of trashed). The unit was a legal target when the Blade began resolving and its controller is still identifiable, so the
 *    "its controller draws 2" instruction executes.
 * Rules: 366 / 371–372 (replacement effects), 359.3.e.5 (independent instructions), 359.3.e.9 (legality checked as resolution begins).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const THE_BOSS = "ogn-269-298";

/**
 * P1's turn, legend The Boss (ready). P1 controls bf1 with a BUFFED Brawler (3+1) and a Sentry (2, keeps bf1 afterwards).
 * Hidden Blade in hand; 2 energy + [order] for it and one spare [body] for the Boss's [rainbow]. Known deck top d1, d2, d3.
 */
function board(withBoss = true) {
  const s = scenario()
    .resources(P1, { energy: 2, power: { body: 1, order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Brawler" }, "brawler", { buffed: true })
    .unit(P1, "bf1", { might: 2, name: "Sentry" }, "sentry")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .hand(P1, HIDDEN_BLADE, "blade")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
  return withBoss ? s.legend(P1, THE_BOSS, "boss") : s;
}

/** Cast Hidden Blade (from hand, on P1's turn) at P1's own Brawler and let it start resolving. */
async function bladeOwnBrawler(withBoss = true): Promise<Game> {
  const game = await board(withBoss).build();
  expect(game.state("brawler")).toMatchObject({ isBuffed: true, might: 4 });
  await game.p1.cast("blade", { targets: "brawler" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 1, order: 0 } });
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

describe("Ruling 77d71cb8c4b4e70e — saving your Hidden-Bladed unit with The Boss still draws you 2", () => {
  test("the Blade's kill is a 'would die' for the buffed Brawler: P1 is asked whether to apply The Boss (a replacement decision from the legend, not a chain item)", async () => {
    const game = await bladeOwnBrawler();
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "boss" } });
    expect(game.chain().some((c) => c.cardId === "boss")).toBe(false);
    expect(game.zoneOf("brawler")).toBe("battlefield-bf1");
  });

  test("YES: the death is replaced — Boss exhausted, [rainbow] paid, buff spent; the Brawler is healed, exhausted and recalled to base (never in the trash) — AND P1 still draws 2 (d1, d2)", async () => {
    const game = await bladeOwnBrawler();
    const hand0 = game.p1.hand().length;
    await game.p1.yes();
    await game.settle();
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, order: 0 } });
    expect(game.zoneOf("brawler")).toBe("base");
    expect(game.p1.trash()).not.toContain("brawler");
    expect(game.state("brawler")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true, might: 3 });
    expect(game.zoneOf("blade")).toBe("trash");
    // The ruling: "Its controller draws 2" still executes.
    expect(game.p1.hand()).toHaveLength(hand0 + 2);
    expect(game.p1.hand()).toEqual(expect.arrayContaining(["d1", "d2"]));
    expect(game.p1.deck()[0]).toBe("d3");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("NO (decline the Boss): the Brawler really dies to the trash and P1 draws 2 all the same", async () => {
    const game = await bladeOwnBrawler();
    const hand0 = game.p1.hand().length;
    await game.p1.no();
    await game.settle();
    expect(game.state("boss").isExhausted).toBe(false);
    expect(game.zoneOf("brawler")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand0 + 2);
  });

  test("control (no legend): Hidden Blade on your own unit kills it and you, its controller, draw 2", async () => {
    const game = await bladeOwnBrawler(false); // no replacement to ask about: it has already resolved
    await game.settle();
    expect(game.zoneOf("brawler")).toBe("trash");
    expect(game.p1.hand().toSorted()).toEqual(["d1", "d2"]);
    expect(game.p2.hand()).toHaveLength(0);
  });
});
