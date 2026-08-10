/**
 * Ruling 028ba84facdccc50 — Promising Future (OGN-115 → ogn-115-298) · Spell · Mind · [5][mind] · [Action]
 *     "Each player looks at the top 5 cards of their Main Deck, banishes one of them, then recycles the rest. Starting with
 *      the next player, each player plays those cards, ignoring Energy costs."
 *   (Exercised with Cleave OGN-004 → ogn-004-298, an [Action] spell, and vanilla units.)
 *
 * Q: If something restricts playing "action" cards, does Promising Future still let you play any card type — or only
 *    reactions and units?
 * A: When a spell/effect INSTRUCTS you to play a card, timing restrictions and similar limitations do not apply; those only
 *    govern discretionary plays. Promising Future instructs the play, so any card type can be played off it.
 * Rules: 346/145 (timing classes govern discretionary plays), 356.1.b (playing a card as instructed by an effect).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PROMISING_FUTURE = "ogn-115-298";
const CLEAVE = "ogn-004-298"; // [1] [Action] "Give a unit [Assault 3] this turn."
const U = (n: number) => ({ cardType: "unit", energyCost: 3, might: n, name: `Future ${n}` });

const keysOf = (d: Decision | null) => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []);

/**
 * P1's turn with exactly [5][mind]. P1's top 5: Cleave + four units. P2's top 5: a 4-Might unit "bigUnit" + Cleave + three
 * units. P2 has NO resources and it is NOT P2's turn. Each side has a unit on board for a Cleave to target.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { mind: 1 } })
    .unit(P1, "base", { might: 2, name: "P1 Body" }, "p1body")
    .unit(P2, "base", { might: 2, name: "P2 Body" }, "p2body")
    .deck(P1, [CLEAVE, U(2), U(3), U(4), U(5), U(6)], ["cleaveA", "a2", "a3", "a4", "a5", "a6"])
    .deck(P2, [U(4), CLEAVE, U(3), U(5), U(6), U(7)], ["bigUnit", "cleaveB", "b3", "b5", "b6", "b7"])
    .hand(P1, PROMISING_FUTURE, "pf");
}

/** Cast Promising Future and resolve to P1's look-at-5 prompt. */
async function castToLook(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("pf", { answers: [] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
  const stop = await game.settle();
  expect(stop.reason).toBe("unanswered");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  expect(keysOf(game.decision()).sort()).toEqual(["a2", "a3", "a4", "a5", "cleaveA"]);
  return game;
}

/** Drive every remaining prompt: destinations → base, spell targets → own body, priority → pass. */
async function playItOut(game: Game): Promise<void> {
  for (let i = 0; i < 40; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      return;
    }
    if (d.kind === "action") {
      await game.seat(d.seat).pass();
    } else if (d.kind === "pick") {
      const keys = d.options.map((o) => o.key);
      const own = d.seat === P1 ? "p1body" : "p2body";
      const choice = keys.includes("base") ? "base" : keys.includes(own) ? own : keys[0]!;
      await game.seat(d.seat).pick(choice);
    } else if (d.kind === "yes-no") {
      await game.seat(d.seat).yes();
    } else {
      return;
    }
  }
}

describe("Ruling 028ba84facdccc50 — cards played off Promising Future ignore discretionary timing restrictions", () => {
  test("baseline: on P1's turn, with a chain open, P2 could not normally play a unit at all (units are discretionary Main-Phase plays of the turn player)", async () => {
    const game = await castToLook();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p2.legal().some((o) => o.verb === "play")).toBe(false);
  });

  test("P2 (the next player) banishes a UNIT and it IS played — on P1's turn, mid-resolution, for no Energy: it ends up in P2's base as a 4-Might unit", async () => {
    const game = await castToLook();
    await game.p1.pick("a2"); // P1 takes a unit too
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
    expect(keysOf(game.decision()).sort()).toEqual(["b3", "b5", "b6", "bigUnit", "cleaveB"]);
    await game.p2.pick("bigUnit");
    await playItOut(game);
    expect(game.zoneOf("bigUnit")).toBe("base");
    expect(game.state("bigUnit")).toMatchObject({ controller: P2, might: 4, zone: "base" });
    expect(game.zoneOf("a2")).toBe("base");
    expect(game.state("a2").controller).toBe(P1);
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} }); // Energy cost ignored
    expect(game.zoneOf("pf")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("an [Action] spell works just as well for the non-turn player: P2 banishes Cleave and plays it (onto its own unit) during P1's turn — Assault 3 lands, Cleave to P2's trash", async () => {
    const game = await castToLook();
    await game.p1.pick("cleaveA"); // P1 also takes the Action spell
    await game.p2.pick("cleaveB");
    await playItOut(game);
    expect(game.zoneOf("cleaveB")).toBe("trash");
    expect(game.zoneOf("cleaveA")).toBe("trash");
    expect(game.state("p2body").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    expect(game.state("p1body").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    expect(game.p2.banishment()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
