/**
 * Ruling 79a0654b79630766 — Challenge (OGN-128 → ogn-128-298) · Spell · Body · [2][body] · [Action]
 *     "Choose a friendly unit and an enemy unit. They deal damage equal to their Mights to each other."
 *   × Get Excited! (OGN-008 → ogn-008-298) · [2][fury] · [Action] "Discard 1. Deal its Energy cost as damage to a unit at a battlefield."
 *
 * Q: During a showdown, can I play Challenge (an Action) in RESPONSE to the opponent's Get Excited?
 * A: No. An [Action] can be played on your turn or in showdowns while nothing is resolving, but never onto an existing
 *    chain. As the showdown's initiator you have Focus first and could Challenge then; once the opponent has played
 *    Get Excited you cannot respond with Challenge (only Reactions may).
 * Rules: 812 (Action: Open State on your turn / showdown), 813 (only Reactions while a chain exists), 345 (initiator has Focus).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHALLENGE = "ogn-128-298";
const GET_EXCITED = "ogn-008-298";

/** P1's turn. P1's Brawler (4) attacks P2's Guard (3) at bf1. P1: Challenge + [2][body]. P2: Get Excited + [2][fury] + a 5-cost card to pitch. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { body: 1 } })
    .resources(P2, { energy: 2, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 4, name: "Brawler" }, "brawler")
    .hand(P1, CHALLENGE, "challenge")
    .hand(P2, GET_EXCITED, "ge")
    .hand(P2, { cardType: "unit", energyCost: 5, might: 5, name: "Fodder" }, "fodder");
}

async function attack(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("brawler", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 79a0654b79630766 — Challenge can open a chain in the showdown but cannot answer Get Excited", () => {
  test("the initiator (P1) holds Focus first: at that point Challenge IS playable (showdown, no chain)", async () => {
    const game = await attack();
    expect(game.chain()).toEqual([]);
    expect(game.p1.can("cast", "challenge")).toBe(true);
    await game.p1.cast("challenge", { targets: ["brawler", "guard"] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "challenge", controller: P1 })]);
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash"); // 4 into a 3
    expect(game.zoneOf("challenge")).toBe("trash");
  });

  test("P1 passes Focus instead; P2 plays Get Excited at the Brawler → with that spell on the chain P1 gets priority but Challenge is NOT legal (only pass/concede)", async () => {
    const game = await attack();
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.cast("ge", { targets: "brawler" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ge", controller: P2, targets: ["brawler"] })]);
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "challenge")).toBe(false);
    expect(game.p1.legal().map((o) => o.label).sort()).toEqual(["concede", "passPriority"]);
    const r = await game.p1.try((p) => p.cast("challenge", { targets: ["brawler", "guard"] }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("challenge")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { body: 1 } });
  });

  test("Get Excited then resolves unanswered: P2 pitches the 5-cost Fodder and the 4-Might Brawler takes 5 and dies — Challenge never got in", async () => {
    const game = await attack();
    await game.p1.passFocus();
    await game.p2.cast("ge", { targets: "brawler" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 }); // "Discard 1" chosen on resolution
    await game.p2.pick("fodder");
    await game.settle();
    expect(game.zoneOf("fodder")).toBe("trash");
    expect(game.zoneOf("ge")).toBe("trash");
    expect(game.zoneOf("brawler")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.zoneOf("challenge")).toBe("hand");
    expect(game.violations()).toEqual([]);
  });
});
