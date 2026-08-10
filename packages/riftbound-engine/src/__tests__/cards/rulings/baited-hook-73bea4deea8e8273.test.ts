/**
 * Ruling 73bea4deea8e8273 — Baited Hook (OGN-242 → ogn-242-298) · Gear · Order
 *     "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 cards of your Main Deck. You may banish a unit from
 *      among them that has Might up to 1 more than the killed unit and play it, ignoring its cost. Then recycle the rest."
 *   (Arcane Shift SFD-200 is cited as the same principle.)
 *
 * Q: Can I play the unit from Baited Hook TO the battlefield whose only unit I just sacrificed to the Hook?
 * A: Yes. The kill happens during resolution (Closed State); a battlefield only becomes uncontrolled when it is empty in
 *    an Open State, so I still control the temporarily-vacant battlefield and may play the new unit there (or to any
 *    other battlefield I control / my base).
 * Rules: 181.4 / 630-ish (control of an empty battlefield is lost only in an Open State), 330 (Closed State while a
 *        chain exists), 346 (units are played to base or a battlefield you control).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BAITED_HOOK = "ogn-242-298";
const SKULKER = "ogn-175-298"; // 3 Might vanilla

type Pick = Extract<Decision, { kind: "pick" }>;

/**
 * P1's turn with exactly [1][order]. P1 controls bf1 where Bait (2 Might) is the ONLY unit; P2 holds bf2.
 * Deck top→: Three(3) Skulker Skulker Junk(spell) Five(5) | below.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, "bf1", { energyCost: 2, might: 2, name: "Bait" }, "bait")
    .unit(P2, "bf2", { might: 2, name: "Onlooker" }, "onlooker")
    .deck(
      P1,
      [{ cardType: "unit", energyCost: 3, might: 3, name: "Three" }, SKULKER, SKULKER, { cardType: "spell", energyCost: 1, name: "Junk" }, { cardType: "unit", energyCost: 5, might: 5, name: "Five" }, SKULKER],
      ["three", "r1", "r2", "junk", "five", "below"],
    );
}

/** Activate the Hook on Bait; both pass → it resolves up to the look-at-5 offer. */
async function hookBait(): Promise<Game> {
  const game = await board().build();
  await game.p1.activate("hook", 0, { targets: "bait" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hook", targets: ["bait"] })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

describe("Ruling 73bea4deea8e8273 — Hooking the only unit at your battlefield still lets you play the new unit there", () => {
  test("the kill happens on RESOLUTION (not as a cost): Bait is alive while the Hook sits on the chain, dead once it resolves", async () => {
    const game = await board().build();
    await game.p1.activate("hook", 0, { targets: "bait" });
    expect(game.zoneOf("bait")).toBe("battlefield-bf1"); // still there with the ability on the chain
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("bait")).toBe("trash");
  });

  test("mid-resolution (Closed State): bf1 is empty of units yet STILL controlled by P1; the offer lists units of Might ≤ 3 (Three, both Skulkers — not Five, not the spell)", async () => {
    const game = await hookBait();
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // control is not lost while the chain resolves
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1, semantics: "from-revealed" });
    expect((d as Pick).options.map((o) => o.card).sort()).toEqual(["r1", "r2", "three"]);
  });

  // rule 190.4.c / 323.6 / 309.1 (official clarification 9a32c2cc829f221a): after choosing Three, P1 is asked WHERE to play it
  // and the now-vacant bf1 (still controlled in the Closed State) is a legal destination alongside the base; choosing bf1 puts
  // Three there and P1 keeps the battlefield — battlefield control timing model, operations/battlefield-control.ts.
  test("ruling 73bea4deea8e8273 — the vacated bf1 is offered as a destination while Hook resolves; the Hooked-in unit lands there and P1 keeps bf1", async () => {
    const game = await hookBait();
    await game.p1.pick("three");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    const keys = (d as Pick).options.map((o) => o.key);
    expect(keys).toContain("battlefield-bf1");
    expect(keys).toContain("base");
    expect(keys).not.toContain("battlefield-bf2"); // not a battlefield P1 controls
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    expect(game.zoneOf("three")).toBe("battlefield-bf1");
    expect(game.p1.units("bf1")).toEqual(["three"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } }); // played ignoring cost
    expect(game.p1.deck()[0]).toBe("below"); // the other four were recycled
    expect(game.violations()).toEqual([]);
  });

  test("contrast — choosing the base instead: Three is played (free) into the base; once the chain is gone (Open State) the empty bf1 lapses to uncontrolled (323.6)", async () => {
    const game = await hookBait();
    await game.p1.pick("three");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    await game.p1.pick("base");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("three")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.p1.deck()[0]).toBe("below");
    expect(game.state("hook").isExhausted).toBe(true);
  });
});
