/**
 * Why a clicked hand card produced no play (public/js/gameplay/interactions.js
 * `playTimingBlockReason`): the client must blame the STATE — priority, an open
 * chain, a showdown, the wrong phase — before it ever blames the rune pool.
 * Rules 507-510: only [Reaction] speed enters a closed state; a showdown is
 * entered at [Action] speed (or [Reaction]); standard speed needs your own main
 * phase in an open state.
 *
 * The browser script is evaluated in a sandbox with stub globals (no DOM library):
 * `document` is a param, and the mutable game globals live on globalThis so each
 * case can reshape them.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

interface Card { rulesText?: string }
interface Api {
  playTimingBlockReason(card: Card | null): string | null;
  engineBlockReason(cardId: string | null): string | null;
  cardPlaySpeed(card: Card | null): string;
}

function loadInteractions(): Api {
  const src = readFileSync(path.resolve(import.meta.dir, "../../public/js/gameplay/interactions.js"), "utf8");
  const mod: { exports?: Api } = { exports: {} as Api };
  const doc = {
    readyState: "complete",
    addEventListener() {},
    getElementById: () => null,
    querySelectorAll: () => [],
  };
  const fn = new Function("module", "document", `${src}\nreturn module.exports;`);
  return fn(mod, doc) as Api;
}

const API = loadInteractions();

const g = globalThis as unknown as Record<string, unknown>;
g.pName = (p: string) => (p === "player1" ? "You" : "Goldfish");
g.viewingPlayer = "player1";

function setState(state: unknown) {
  g.gameState = state;
}
afterEach(() => setState(undefined));

const openMain = { turn: { activePlayer: "player1", phase: "main" }, interaction: {} };
const standard: Card = { rulesText: "Deal 2 damage to a unit." };
const action: Card = { rulesText: "[Action] Deal 2 damage to a unit." };
const reaction: Card = { rulesText: "[Reaction] Deal 2 damage to a unit." };

describe("cardPlaySpeed", () => {
  test("printed [Reaction] / [Action] / neither", () => {
    expect(API.cardPlaySpeed(reaction)).toBe("reaction");
    expect(API.cardPlaySpeed(action)).toBe("action");
    expect(API.cardPlaySpeed(standard)).toBe("standard");
  });
});

describe("playTimingBlockReason", () => {
  test("open state, your main phase: nothing about timing — caller may blame cost", () => {
    setState(openMain);
    expect(API.playTimingBlockReason(standard)).toBeNull();
  });

  test("chain open + opponent holds priority: names priority and [Reaction], never energy", () => {
    setState({ turn: { activePlayer: "player1", phase: "main" }, interaction: { chain: { active: true, activePlayer: "player2" } } });
    const why = API.playTimingBlockReason(standard) ?? "";
    expect(why).toContain("Goldfish");
    expect(why).toContain("[Reaction]");
    expect(why.toLowerCase()).not.toContain("energy");
    // an [Action] card is equally locked out of a closed state
    expect(API.playTimingBlockReason(action)).toBe(why);
    // a Reaction is fine — the real blocker is elsewhere
    expect(API.playTimingBlockReason(reaction)).toBeNull();
  });

  test("chain open with our own priority: still Reaction-only, no player name", () => {
    setState({ turn: { activePlayer: "player1", phase: "main" }, interaction: { chain: { active: true, activePlayer: "player1" } } });
    expect(API.playTimingBlockReason(standard)).toBe("Only [Reaction] cards can be played while the chain is open");
  });

  test("showdown: [Action] and [Reaction] pass, standard speed is told about the showdown (not the pool)", () => {
    setState({ turn: { activePlayer: "player1", phase: "combat" }, interaction: { showdown: { battlefield: "bf1" } } });
    const why = API.playTimingBlockReason(standard) ?? "";
    expect(why).toContain("Showdown");
    expect(why).toContain("[Action]");
    expect(why.toLowerCase()).not.toContain("energy");
    expect(API.playTimingBlockReason(action)).toBeNull();
    expect(API.playTimingBlockReason(reaction)).toBeNull();
  });

  test("opponent's turn, open state: named as a turn/priority problem", () => {
    setState({ turn: { activePlayer: "player2", phase: "main" }, interaction: {} });
    expect(API.playTimingBlockReason(standard)).toContain("Not your turn");
    expect(API.playTimingBlockReason(reaction)).toBeNull();
  });

  test("your turn, wrong phase: names the phase", () => {
    setState({ turn: { activePlayer: "player1", phase: "beginning" }, interaction: {} });
    expect(API.playTimingBlockReason(standard)).toBe("Not during the beginning phase");
  });

  test("no card: no claim", () => {
    setState(openMain);
    expect(API.playTimingBlockReason(null)).toBeNull();
  });
});

/**
 * A refusal must carry its cause — end to end.
 *
 * `playTimingBlockReason` above is a HEURISTIC: it reads the turn state, so it
 * can only ever describe timing and can never name the card that did it. The
 * engine now decides the refusal where legality is decided and ships it on the
 * snapshot (`buildBlockedPlays` → `blockedPlays`); the client prefers that over
 * its own guess.
 */
describe("engineBlockReason — the ENGINE's reason wins over the client's guess", () => {
  test("a blocked card's reason comes from the snapshot, naming the object and its rule", () => {
    setState({
      turn: { activePlayer: "player2", phase: "main" },
      interaction: {},
      blockedPlays: [
        {
          cardId: "c1",
          moveId: "playSpell",
          code: "SPELLS_FORBIDDEN_THIS_TURN",
          rule: "054.1",
          reason: "Lilting Lullaby: you can't play spells this turn (rule 054.1)",
          objectId: "lullaby",
          objectName: "Lilting Lullaby",
        },
      ],
    });
    expect(API.engineBlockReason("c1")).toBe("Lilting Lullaby: you can't play spells this turn (rule 054.1)");
    // …and it is strictly better than the heuristic, which knows only the turn.
    expect(API.playTimingBlockReason(standard)).toContain("Not your turn");
  });

  test("no row for the card, or no rows at all: no claim (the heuristic still gets its turn)", () => {
    setState({ turn: { activePlayer: "player1", phase: "main" }, interaction: {}, blockedPlays: [] });
    expect(API.engineBlockReason("c1")).toBeNull();
    setState(openMain);
    expect(API.engineBlockReason("c1")).toBeNull();
    expect(API.engineBlockReason(null)).toBeNull();
  });
});

describe("buildBlockedPlays — the server ships the engine's refusals to that client", () => {
  test("an [Action] held while the opponent's chain is loaded rides on the snapshot with its cause", async () => {
    const { P1, P2, scenario } = await import("@tcg/riftbound/harness");
    const { buildBlockedPlays } = await import("../snapshot");
    const REBUKE = "ogn-172-298"; // [Action]
    const BOLT = {
      abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
      cardType: "spell",
      domain: "fury",
      energyCost: 1,
      name: "Test Bolt",
      timing: "action",
    } as const;

    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Mine" }, "mine")
      .unit(P2, "bf1", { might: 3, name: "Theirs" }, "theirs")
      .resources(P1, { energy: 4, power: { chaos: 2, rainbow: 2 } })
      .resources(P2, { energy: 3 })
      .hand(P1, REBUKE, "rebuke")
      .hand(P2, BOLT, "bolt")
      .build();
    await game.p2.cast("bolt", { targets: "mine" });
    await game.p2.passPriority();

    const session = {
      clients: new Map(),
      engine: game.engine,
      log: [],
      playerNames: { [P1]: "Dev", [P2]: "Opp" },
      players: [P1, P2],
      sandbox: true,
      seq: 0,
    } as unknown as Parameters<typeof buildBlockedPlays>[0];

    const row = buildBlockedPlays(session, P1).find((r) => r.cardId === game.card("rebuke"));
    expect(row).toBeDefined();
    expect(row?.code).toBe("TIMING_ILLEGAL");
    expect(row?.rule).toBe("338.1.a.2");
    expect(row?.reason).toMatch(/\[Action\]/);
    // The legally-timed card in the same hand is NOT reported as blocked.
    expect(buildBlockedPlays(session, P1).map((r) => r.cardId)).not.toContain(game.card("bolt"));
  });
});
