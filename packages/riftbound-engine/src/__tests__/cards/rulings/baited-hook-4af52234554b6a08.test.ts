/**
 * Ruling 4af52234554b6a08 — Baited Hook (OGN-242 → ogn-242-298) · Gear · [3]
 *     "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 cards of your Main Deck. You may banish a
 *      unit from among them that has Might up to 1 more than the killed unit and play it, ignoring its cost.
 *      Then recycle the rest."
 *   × Stupefy (OGN-095 → ogn-095-298) · [Reaction] · [1] "Give a unit -1 [Might] this turn…"
 *
 * Q: When Baited Hook kills a buffed unit, does it read the buffed Might or the printed Might?
 * A: The unit's CURRENT Might at the moment of death, every modification included — you never get to pick
 *    the printed value. And because the value is locked in only when the ability resolves, the opponent may
 *    respond first and shrink the unit to lower the ceiling.
 * Rules: 359.3.f.2 (referents are read on execution), 359.3.e.13 (last known information of the killed unit),
 *        745 (a buff adds to current Might), 340.1 (LIFO — reactions resolve before the ability).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BAITED_HOOK = "ogn-242-298";
const STUPEFY = "ogn-095-298";

type Pick = Extract<Decision, { kind: "pick" }>;
const offered = (d: Pick) => d.options.map((o) => o.card ?? o.key).toSorted();

/** P1's turn. Bait (printed 3, optionally buffed) in P1's base; the Hook is ready with exactly [1][order]. */
function board(buffed: boolean) {
  return scenario()
    .resources(P1, { energy: 1, power: { order: 1 } })
    .resources(P2, { energy: 1 })
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, "base", { might: 3, name: "Bait" }, "bait", buffed ? { buffed: true } : undefined)
    .hand(P2, STUPEFY, "stupefy")
    .deck(
      P1,
      [
        { cardType: "unit", energyCost: 5, might: 5, name: "Five" },
        { cardType: "unit", energyCost: 6, might: 6, name: "Six" },
        { cardType: "unit", energyCost: 4, might: 4, name: "Four" },
        { cardType: "spell", energyCost: 1, name: "Junk" },
        { cardType: "unit", energyCost: 2, might: 2, name: "Two" },
      ],
      ["five", "six", "four", "junk", "two"],
    )
    .script(P1, [(d) => (d.kind === "pick" && /target/i.test(d.prompt) && d.options.some((o) => o.key === "bait") ? "bait" : undefined)]);
}

/** Activate the Hook on the Bait and drive to the look-at-5 offer. */
async function hookBait(game: Game): Promise<Pick> {
  const field = game.p1.option("activate", "hook")?.fields.find((f) => f.name === "targets");
  await (field ? game.p1.activate("hook", 0, { targets: "bait" }) : game.p1.activate("hook"));
  await game.settle();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  return d as Pick;
}

describe("Ruling 4af52234554b6a08 — Baited Hook reads the killed unit's CURRENT (buffed) Might", () => {
  test("premise: the buff makes the printed-3 Bait a 4-Might unit", async () => {
    const game = await board(true).build();
    expect(game.state("bait")).toMatchObject({ baseMight: 3, isBuffed: true, might: 4 });
  });

  test("ruling: killing the BUFFED Bait sets the ceiling at 4 + 1 = 5 — Five, Four and Two are offered, Six is not", async () => {
    const game = await board(true).build();
    const d = await hookBait(game);
    expect(game.zoneOf("bait")).toBe("trash");
    expect(offered(d)).toEqual(["five", "four", "two"]);
    expect(offered(d)).not.toContain("six");
    expect(offered(d)).not.toContain("junk"); // "a unit"
    await game.p1.pick("five");
    await game.settle({ policy: "first" });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("five")).toBe("base"); // played, ignoring its cost
    expect(game.violations()).toEqual([]);
  });

  test("there is no choosing the PRINTED value: the same Bait unbuffed gives a ceiling of 4 and Five drops out", async () => {
    const game = await board(false).build();
    expect(game.state("bait")).toMatchObject({ isBuffed: false, might: 3 });
    const d = await hookBait(game);
    expect(offered(d)).toEqual(["four", "two"]);
    expect(offered(d)).not.toContain("five");
  });

  test("nuance: the value is read when the ability RESOLVES, so a Reaction that shrinks the Bait first lowers the ceiling (4 → 3 ⇒ Four drops out)", async () => {
    const game = await board(true).build();
    const field = game.p1.option("activate", "hook")?.fields.find((f) => f.name === "targets");
    await (field ? game.p1.activate("hook", 0, { targets: "bait" }) : game.p1.activate("hook"));
    expect(game.chain()).toHaveLength(1);
    await game.p1.passPriority();
    await game.p2.cast("stupefy", { targets: "bait" });
    expect(game.state("bait").might).toBe(4); // not yet — the Stupefy is still on the chain
    for (let i = 0; i < 4 && game.chain().length > 1 && game.decision()?.kind === "action"; i++) {
      await game.acting().passPriority();
    }
    expect(game.state("bait").might).toBe(3); // 4 - 1
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(offered(d as Pick)).toEqual(["four", "two"]); // ceiling 3 + 1 = 4
    expect(game.violations()).toEqual([]);
  });
});
