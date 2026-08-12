/**
 * Ruling b58e77e63849831f — Challenge (OGN-128 → ogn-128-298) · [Action] · Body · [2][body]
 *     "Choose a friendly unit and an enemy unit. They deal damage equal to their Mights to each other."
 *
 * Q: Can an Action card such as Challenge choose a unit that is NOT at the active showdown — e.g. drag a unit
 *    from another battlefield into a fight with a unit at the showdown?
 * A: Yes. Challenge's choices are not scoped to the showdown's battlefield, so units anywhere (other
 *    battlefields, bases) are legal choices, and two units at different battlefields can be made to fight.
 *    (Only cards played from HIDDEN are locked to the battlefield they were hidden at.)
 * Rules: 355.8 (a spell's legal choices come from its own descriptor, not the showdown), 347 (an Action may be
 *        played by the Focus holder in a showdown), 811.1.d.2 (the from-Hidden battlefield lock).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHALLENGE = "ogn-128-298";

/**
 * P1's turn 3. P1 holds bf1 (Vanguard 4) and bf2 (Outrider 5, far from the action); P2 holds bf1 with a Sentry (3)
 * and keeps a Reserve (2) in base. P1 has [2][body] and Challenge in hand.
 */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 2, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "base", { might: 4, name: "Vanguard" }, "vanguard")
    .unit(P1, "bf2", { might: 5, name: "Outrider" }, "outrider")
    .unit(P2, "bf1", { might: 3, name: "Sentry" }, "sentry")
    .unit(P2, "base", { might: 2, name: "Reserve" }, "reserve")
    .hand(P1, CHALLENGE, "challenge");
}

/** P1's Vanguard attacks bf1; P2 passes Focus so P1 (the attacker, with Focus) may play an Action. */
async function showdownAtBf1(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("vanguard", "bf1");
  expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "bf1" });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

/** Resolve just the open chain (both seats pass priority), stopping before any showdown/combat step. */
async function resolveChain(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
      continue;
    }
    break;
  }
  expect(game.chain()).toEqual([]);
}

/** The legal [friendly, enemy] pairs Challenge is offering right now. */
const pairs = (game: Game): string[][] => {
  const f = game.p1.option("cast", "challenge")?.fields?.find((x) => x.name === "targets");
  return ((f?.options ?? []) as unknown as string[][]).map((p) => [...p]);
};

describe("Ruling b58e77e63849831f — Challenge may choose units that are not at the active showdown", () => {
  test("intermediate fact: with a showdown running at bf1, Challenge's friendly menu still offers the Outrider sitting at the OTHER battlefield", async () => {
    const game = await showdownAtBf1();
    expect(game.p1.can("cast", "challenge")).toBe(true);
    expect(pairs(game).map((p) => p.join("+")).toSorted()).toEqual([
      "outrider+reserve", // neither is at the showdown
      "outrider+sentry", // friendly at bf2 vs the defender at the bf1 showdown
      "vanguard+reserve", // attacker vs a unit in the enemy base
      "vanguard+sentry",
    ]);
  });

  test("ruling: the Outrider (at bf2) is made to fight the Sentry (at the bf1 showdown) — both take the other's Might", async () => {
    const game = await showdownAtBf1();
    await game.p1.cast("challenge", { targets: ["outrider", "sentry"] });
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash"); // 3 Might, took 5
    expect(game.locationOf("outrider")).toBe("bf2"); // never moved
    expect(game.zoneOf("challenge")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("the enemy unit may equally be one that is NOT in the showdown: the Reserve in P2's base is a legal choice and dies to the Outrider", async () => {
    const game = await showdownAtBf1();
    await game.p1.cast("challenge", { targets: ["outrider", "reserve"] });
    await resolveChain(game);
    expect(game.zoneOf("reserve")).toBe("trash");
    expect(game.state("outrider").damage).toBe(2); // took the Reserve's 2 back, at a battlefield it never left
    expect(game.zoneOf("sentry")).toBe("battlefield-bf1"); // the showdown unit was untouched
    await game.settle();
    expect(game.state("outrider").damage).toBe(0); // the bf1 Combat Cleanup heals every unit on the board
  });

  test("two units at completely different locations can be pointed at each other (base vs. other battlefield)", async () => {
    const game = await board().build();
    await game.p1.cast("challenge", { targets: ["vanguard", "reserve"] });
    await resolveChain(game);
    expect(game.zoneOf("reserve")).toBe("trash"); // 2 Might, took 4
    expect(game.state("vanguard").damage).toBe(2);
    expect(game.locationOf("vanguard")).toBe("base");
  });
});
