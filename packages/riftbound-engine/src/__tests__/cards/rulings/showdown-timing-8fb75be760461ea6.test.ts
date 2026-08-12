/**
 * Ruling 8fb75be760461ea6 — (general showdown timing; no specific card)
 *   Stand-ins: inline [Action], [Reaction] and base-speed (no timing flag) spells.
 *
 * Q: What can be played during a showdown, on your turn and on the opponent's?
 * A: Both Actions and Reactions, whoever's turn it is. An Action additionally needs an EMPTY chain and Focus
 *    (the attacker has it first, then the defender); a Reaction may go on top of a chain at any time. A
 *    base-speed spell (no [Action]/[Reaction]) is only playable on your own turn, outside a showdown, with an
 *    empty chain — activated abilities follow the same rule unless they say otherwise.
 * Rules: 444.1 (Action timing incl. "a showdown you have Focus in"), 444.2 (Reaction timing), 444.3 (base speed:
 *        your turn, Open State), 347 (Focus alternates in a showdown).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const spell = (name: string, timing: "action" | "reaction" | "standard") =>
  ({
    abilities: [
      {
        effect: { amount: 1, duration: "turn", target: { type: "unit" }, type: "modify-might" },
        ...(timing === "standard" ? {} : { timing }),
        type: "spell",
      },
    ],
    cardType: "spell",
    domain: "fury",
    energyCost: 1,
    name,
    rulesText: `${timing === "standard" ? "" : timing === "action" ? "[Action] " : "[Reaction] "}Give a unit +1 [Might] this turn.`,
    timing,
  }) as const;

/** P1 attacks P2's bf1 with a Bruiser; both seats hold one of each speed. */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { fury: 6 } })
    .resources(P2, { energy: 6, power: { fury: 6 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 3, name: "Defender" }, "def")
    .unit(P1, "base", { might: 4, name: "Bruiser" }, "bruiser")
    .hand(P1, spell("Mine Action", "action"), "a1")
    .hand(P1, spell("Mine Reaction", "reaction"), "r1")
    .hand(P1, spell("Mine Slow", "standard"), "s1")
    .hand(P2, spell("Theirs Action", "action"), "a2")
    .hand(P2, spell("Theirs Reaction", "reaction"), "r2")
    .hand(P2, spell("Theirs Slow", "standard"), "s2");
}

/** Open a combat showdown: the attacker (P1, the turn player) has Focus first. */
async function inShowdown(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("bruiser", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 8fb75be760461ea6 — in a showdown both seats may use Actions and Reactions; base speed never applies there", () => {
  test("the attacker holds Focus first and may play an Action (chain empty) or a Reaction", async () => {
    const game = await inShowdown();
    expect(game.p1.can("cast", "a1")).toBe(true);
    expect(game.p1.can("cast", "r1")).toBe(true);
  });

  test("a base-speed spell is NOT playable in a showdown, not even by the turn player", async () => {
    const game = await inShowdown();
    expect(game.p1.can("cast", "s1")).toBe(false);
    const refused = await game.p1.try((p) => p.cast("s1", { targets: "bruiser" }));
    expect(refused.ok).toBe(false);
  });

  test("with an item on the chain the Action is off — only Reactions may be added — and it is on again once the chain empties", async () => {
    const game = await inShowdown();
    await game.p1.cast("a1", { targets: "bruiser" });
    expect(game.chain()).toHaveLength(1);
    expect(game.p1.can("cast", "r1")).toBe(true); // I keep priority and may still react
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "a2")).toBe(false); // an Action needs an EMPTY chain
    expect(game.p2.can("cast", "r2")).toBe(true); // a Reaction goes on top of one
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
  });

  test("the DEFENDER — not the turn player — may play an Action once Focus passes to them", async () => {
    const game = await inShowdown();
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "a2")).toBe(true);
    expect(game.p2.can("cast", "s2")).toBe(false); // base speed is still barred: not their turn, and a showdown
    await game.p2.cast("a2", { targets: "def" });
    await game.settle();
    expect(game.violations()).toEqual([]);
  });

  test("outside a showdown, base speed IS the turn player's to use in an open state", async () => {
    const game = await board().build();
    expect(game.chain()).toEqual([]);
    expect(game.p1.can("cast", "s1")).toBe(true);
    expect(game.p2.can("cast", "s2")).toBe(false); // not their turn
  });
});
