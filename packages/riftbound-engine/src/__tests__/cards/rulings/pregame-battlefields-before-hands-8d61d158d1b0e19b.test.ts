/**
 * Ruling 8d61d158d1b0e19b — (no specific card) do I draw my opening hand or reveal battlefields first?
 *   Exercised with the real pregame moves over synthetic legends / champions / battlefields / decks.
 *
 * Q: Do I draw cards or determine battlefields first?
 * A: Battlefields first. The Setup Process is ordered: reveal Legends → choose Champions →
 *    determine Battlefields → decide play order → draw the opening four and mulligan → start the
 *    game. The opening hand is drawn only once the battlefields are established.
 * Rules: 110–118 (the Setup Process, in order), 113 (battlefields are selected and the rest set
 *        aside), 114 (decks are shuffled), 116 (each player draws four), 117 (mulligan).
 */
import { RuleEngine } from "@tcg/core";
import type { PlayerId as CorePlayerId } from "@tcg/core";
import { describe, expect, test } from "bun:test";
import { riftboundDefinition } from "../../../game-definition/definition";
import type { CardDefLike, HarnessEngine } from "../../../harness";
import { P1, P2, getInternalState, toLookupPayload } from "../../../harness";
import { CardDefinitionRegistry, getGlobalCardRegistry, setGlobalCardRegistry } from "../../../operations/card-lookup";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";

const TAG = "T";
const PLAYERS = [P1, P2];

interface Pregame {
  engine: HarnessEngine;
  kit: Record<string, { legend: string; champion: string; bfs: string[]; main: string[]; runes: string[] }>;
}

function mv(engine: HarnessEngine, move: string, pid: string, params: Record<string, unknown> = {}) {
  return engine.executeMove(move as keyof RiftboundMoves & string, {
    params: { playerId: pid, ...params } as never,
    playerId: pid as CorePlayerId,
  });
}

/** A fresh engine in the `setup` segment with every pregame card registered but in no zone. */
function newPregame(): Pregame {
  setGlobalCardRegistry(new CardDefinitionRegistry());
  const engine: HarnessEngine = new RuleEngine<RiftboundGameState, RiftboundMoves, unknown, RiftboundCardMeta>(
    riftboundDefinition,
    PLAYERS.map((id) => ({ id, name: id })),
    { seed: "ruling-8d61d158d1b0e19b" },
  );
  const internal = getInternalState(engine);
  const registry = getGlobalCardRegistry();
  const put = (id: string, def: CardDefLike, owner: string) => {
    internal.cards[id] = { controller: owner, definitionId: id, owner, zone: "staging" };
    internal.cardMetas[id] = {
      buffed: false,
      combatRole: null,
      damage: 0,
      exhausted: false,
      hidden: false,
      stunned: false,
    } as never;
    registry.register(id, toLookupPayload(def, id, def.cardType === "rune" ? { cardType: "rune", energyCost: 0 } : undefined));
  };
  const kit: Pregame["kit"] = {};
  for (const p of PLAYERS) {
    const legend = `${p}-legend`;
    put(legend, { abilities: [], cardType: "legend", championTag: TAG, domain: ["fury", "chaos"], name: `Legend ${p}` }, p);
    const champion = `${p}-champion`;
    put(champion, { abilities: [], cardType: "unit", domain: "fury", energyCost: 4, isChampion: true, might: 4, name: `Hero ${p}`, tags: [TAG] }, p);
    const bfs = [1, 2, 3].map((i) => {
      const id = `${p}-bf${i}`;
      put(id, { abilities: [], cardType: "battlefield", name: `Field ${p}#${i}` }, p);
      return id;
    });
    const main = Array.from({ length: 12 }, (_, i) => {
      const id = `${p}-d${i}`;
      put(id, { abilities: [], cardType: "unit", domain: "fury", energyCost: 2, might: 2, name: `Grunt ${i}` }, p);
      return id;
    });
    const runes = Array.from({ length: 12 }, (_, i) => {
      const id = `${p}-r${i}`;
      put(id, { abilities: [], cardType: "rune", domain: i < 6 ? "fury" : "chaos", name: "Rune" }, p);
      return id;
    });
    kit[p] = { bfs, champion, legend, main, runes };
  }
  return { engine, kit };
}

const step = (pg: Pregame) => pg.engine.getState().setup?.step;
const zone = (pg: Pregame, zoneId: string, owner?: string): string[] => {
  const internal = getInternalState(pg.engine);
  const ids = internal.zones[zoneId]?.cardIds ?? [];
  return owner ? ids.filter((id: string) => internal.cards[id]?.owner === owner) : [...ids];
};

/** Roll (re-rolling ties) until a winner exists, then have them elect P1 to go first. */
function rollAndChoose(pg: Pregame) {
  for (let round = 0; round < 50 && pg.engine.getState().setup?.rollWinner === undefined; round++) {
    for (const p of PLAYERS) {
      mv(pg.engine, "rollForFirst", p);
    }
  }
  const winner = pg.engine.getState().setup?.rollWinner as string;
  expect(winner).toBeDefined();
  expect(mv(pg.engine, "chooseFirstPlayer", winner, { firstPlayerId: P1 }).success).toBe(true);
}

/** Legends, champions and one battlefield each — everything rule 113 puts before the draw. */
function throughBattlefields(pg: Pregame) {
  for (const p of PLAYERS) {
    expect(mv(pg.engine, "placeLegend", p, { legendId: pg.kit[p]?.legend }).success).toBe(true);
  }
  for (const p of PLAYERS) {
    expect(mv(pg.engine, "placeChampion", p, { championId: pg.kit[p]?.champion }).success).toBe(true);
  }
  for (const p of PLAYERS) {
    const bfs = pg.kit[p]?.bfs ?? [];
    expect(
      mv(pg.engine, "selectBattlefield", p, { battlefieldId: bfs[0], discardIds: bfs.slice(1) }).success,
    ).toBe(true);
  }
}

describe("Ruling 8d61d158d1b0e19b — battlefields are determined before the opening hand is drawn", () => {
  test("the game opens at the turn-order roll with nothing in any hand and no battlefield in play", async () => {
    const pg = newPregame();
    expect(step(pg)).toBe("rollForFirst");
    expect(zone(pg, "hand")).toEqual([]);
    expect(zone(pg, "battlefieldRow")).toEqual([]);
    rollAndChoose(pg);
    expect(pg.engine.getState().setup?.firstPlayer).toBe(P1);
    expect(zone(pg, "hand")).toEqual([]); // still nothing drawn
  });

  test("you cannot draw the opening hand before the battlefields are settled", async () => {
    const pg = newPregame();
    rollAndChoose(pg);
    expect(zone(pg, "battlefieldRow")).toEqual([]);
    expect(mv(pg.engine, "drawInitialHand", P1).success).toBe(false); // rule 114 → 116
    expect(zone(pg, "hand", P1)).toEqual([]);
  });

  test("battlefields go down FIRST, and the hands are still empty at that moment", async () => {
    const pg = newPregame();
    rollAndChoose(pg);
    throughBattlefields(pg);
    expect(zone(pg, "battlefieldRow").length).toBe(2); // one per player (rule 485.4.a)
    expect(zone(pg, "setAside").length).toBe(4); // the other two each, set aside (rule 113.1)
    expect(zone(pg, "hand")).toEqual([]); // rule 116 has not happened yet
    // and the draw is still refused: the decks have not been shuffled (rule 114)
    expect(mv(pg.engine, "drawInitialHand", P1).success).toBe(false);
  });

  test("only once the decks are shuffled does each player draw four — with the battlefields already in play", async () => {
    const pg = newPregame();
    rollAndChoose(pg);
    throughBattlefields(pg);
    for (const p of PLAYERS) {
      expect(mv(pg.engine, "initializeMainDeck", p, { cardIds: pg.kit[p]?.main }).success).toBe(true);
      expect(mv(pg.engine, "initializeRuneDeck", p, { runeIds: pg.kit[p]?.runes }).success).toBe(true);
      expect(mv(pg.engine, "shuffleDecks", p).success).toBe(true);
    }
    for (const p of PLAYERS) {
      expect(mv(pg.engine, "drawInitialHand", p).success).toBe(true);
      expect(zone(pg, "hand", p).length).toBe(4); // rule 116
    }
    expect(zone(pg, "battlefieldRow").length).toBe(2); // they were there before the hands
  });

  test("and the mulligan is later still — it cannot be taken before a hand exists", async () => {
    const pg = newPregame();
    rollAndChoose(pg);
    throughBattlefields(pg);
    expect(mv(pg.engine, "mulligan", P1, { keepCards: [] }).success).toBe(false);
    for (const p of PLAYERS) {
      mv(pg.engine, "initializeMainDeck", p, { cardIds: pg.kit[p]?.main });
      mv(pg.engine, "initializeRuneDeck", p, { runeIds: pg.kit[p]?.runes });
      mv(pg.engine, "shuffleDecks", p);
      mv(pg.engine, "drawInitialHand", p);
    }
    expect(mv(pg.engine, "mulligan", P1, { keepCards: [] }).success).toBe(true); // rule 117
  });
});
