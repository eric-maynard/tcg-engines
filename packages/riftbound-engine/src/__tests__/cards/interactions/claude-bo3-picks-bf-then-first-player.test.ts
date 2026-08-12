/**
 * Interaction (Bo3 vs a Claude seat): which pregame decisions the bot answers, how, and what the human
 * is allowed to see while it does.
 *   Trifarian War Camp (ogn-294-298) · Battlefield — "Units here have +1 [Might]. (This includes attackers.)"
 *   Grove of the God-Willow (ogn-280-298) · Battlefield — "When you hold here, draw 1."
 *   Rockfall Path (sfd-216-221) · Battlefield — "Units can't be played here."
 * The Claude seat registers exactly these three.
 *
 * Question.
 *   (a) Game 1 battlefield_select: is the seat asked exactly ONCE, bounded by `pregameTimeoutMs`, with
 *       all three named AND their rules text plus both legends in the prompt — and is the placement
 *       simultaneous, i.e. does the human's pregame payload omit Claude's locked pick until the human
 *       has also locked?
 *   (b) Game 2 after the human WON game 1: is the battlefield Claude contributed removed from its
 *       option list (asked over two, not three), and is a model index that was legal for a 3-option
 *       list (index 2) but out of range for the filtered list treated as a failure → seeded fallback
 *       among the REMAINING two, logged, rather than an exception or a silent wrong pick? Contrast with
 *       a game nobody won, where the same battlefield may be offered again (486.5.a).
 *   (c) Initiative: when Claude is the chooser (won the G1 roll, or lost G1 so it chooses for G2), does
 *       it decide without a model call, is the choice logged, and does play start without the human?
 *   (d) Does 486.7's extra channeled rune attach to whichever seat is placed SECOND in THIS game —
 *       including the case where Claude chooses itself first and the human therefore goes second —
 *       rather than to whoever went second in game 1?
 *
 * Rules: 486.5, 486.5.a, 486.6, 486.7, 115.1.a, 115.1.b.1, 116, 128.4.
 *
 * Everything here runs against the app's own server modules (`pregame.ts`, `ai-opponent.ts`) with a
 * stub `callModel`, which is the same code path the browser screens drive.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2 } from "../../../harness";
import {
  ClaudeOpponent,
  chooseBotBattlefield,
  type CallModel,
  type ModelRequest,
} from "../../../../../../apps/riftbound-app/server/ai-opponent";
import { registry } from "../../../../../../apps/riftbound-app/server/cards";
import { buildDefaultDeck } from "../../../../../../apps/riftbound-app/server/decks";
import { concedeGame, voteContinue } from "../../../../../../apps/riftbound-app/server/match";
import { matchSummary } from "../../../../../../apps/riftbound-app/server/match-state";
import {
  buildPregamePayload,
  chooseFirstPlayer,
  createGameFromDecks,
  finalizePregame,
  runBotPregame,
  selectBattlefield,
} from "../../../../../../apps/riftbound-app/server/pregame";
import type { GameSession } from "../../../../../../apps/riftbound-app/server/state";

const TRIFARIAN_WAR_CAMP = "ogn-294-298";
const GROVE_OF_THE_GOD_WILLOW = "ogn-280-298";
const ROCKFALL_PATH = "sfd-216-221";
const CLAUDE_BFS = [TRIFARIAN_WAR_CAMP, GROVE_OF_THE_GOD_WILLOW, ROCKFALL_PATH] as const;

const HUMAN_DECK = { ...buildDefaultDeck(), battlefieldIds: ["ogn-275-298", "ogn-277-298", "ogn-279-298"] };
const CLAUDE_DECK = { ...buildDefaultDeck("body", "order"), battlefieldIds: [...CLAUDE_BFS] };
const FAKE_KEY = "sk-ant-api03-testkeytestkey";

let seq = 0;

/** A sandbox Bo3 whose seat 2 is a Claude opponent driven by `callModel`. */
function claudeMatch(callModel: CallModel, opts: { pregameTimeoutMs?: number; gameId?: string } = {}): {
  gameId: string;
  session: GameSession;
  calls: ModelRequest[];
} {
  const gameId = opts.gameId ?? `claude-bo3-${++seq}`;
  const calls: ModelRequest[] = [];
  const recording: CallModel = (req, o) => {
    calls.push(req);
    return callModel(req, o);
  };
  const session = createGameFromDecks(HUMAN_DECK, CLAUDE_DECK, gameId, {
    gameMode: "match",
    initiative: { kind: "roll" },
    names: { [P1]: "Alice", [P2]: "Claude Haiku 4.5" },
    sandbox: true,
  });
  session.opponent = new ClaudeOpponent("haiku", FAKE_KEY, {
    backoffMs: 0,
    callModel: recording,
    lookupTools: [],
    pacingMs: 0,
    ...(opts.pregameTimeoutMs !== undefined ? { pregameTimeoutMs: opts.pregameTimeoutMs } : {}),
  });
  return { calls, gameId, session };
}

/** A model that always answers with `index`. */
const answering = (index: number, rationale = "suits my tempo plan"): CallModel =>
  async () => ({ input: { index, rationale }, name: "choose" });

/** Force the next d20 rolls: each value v yields floor(v*20)+1. */
function withRolls<T>(values: number[], fn: () => T): T {
  const real = Math.random;
  let i = 0;
  Math.random = () => (i < values.length ? (values[i++] as number) : real());
  try {
    return fn();
  } finally {
    Math.random = real;
  }
}

const nameOf = (defId: string): string => registry.get(defId)?.name ?? defId;

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/**
 * `startNextGame` kicks `runBotPregame` as a floating promise, so game 2's bot pick lands on a later
 * microtask; wait for it (and then call runBotPregame explicitly, which is a no-op once it has picked).
 */
async function settleBotPick(session: GameSession): Promise<void> {
  for (let i = 0; i < 80 && !session.pregame?.battlefieldSelections[P2]; i++) {
    await tick();
  }
  await runBotPregame(session);
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// (a) game 1 — one bounded call, the full menu, and a simultaneous placement
// ═════════════════════════════════════════════════════════════════════════════════════════════════

describe("(a) game 1 battlefield_select — asked exactly once, with everything the choice needs", () => {
  test("exactly ONE model call, tool_choice forced to `choose`, a 3-item menu, and the model's index is honoured and narrated", async () => {
    const { calls, session } = claudeMatch(answering(2));
    await runBotPregame(session);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.tool_choice).toEqual({ name: "choose", type: "tool" });
    expect(calls[0]?.meta.menu).toHaveLength(3);
    expect(calls[0]?.meta.seat).toBe(P2);
    expect(session.pregame?.battlefieldSelections[P2]).toBe(ROCKFALL_PATH); // index 2
    expect(session.log.some((e) => /chose its battlefield: Rockfall Path — 'suits my tempo plan'/.test(e.text))).toBe(true);
  });

  test("the prompt names 486.5, all three battlefields WITH their rules text, and both legends", async () => {
    const { calls, session } = claudeMatch(answering(0));
    await runBotPregame(session);
    const user = calls[0]?.messages[0]?.content as string;
    expect(user).toContain("486.5");
    for (const id of CLAUDE_BFS) {
      expect(user).toContain(nameOf(id));
      expect(user).toContain((registry.get(id)?.rulesText ?? "").replace(/\s+/g, " ").trim());
    }
    expect(user).toContain("[0]");
    expect(user).toContain("[2]");
    expect(user).toContain("Your legend:");
    expect(user).toContain("Opponent's legend:");
  });

  test("the call is bounded: a model that never answers is aborted at pregameTimeoutMs and the seat falls back to a seeded pick from its own three, logged", async () => {
    let aborted = false;
    const hang: CallModel = (_req, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          aborted = true;
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        });
      });
    const { session } = claudeMatch(hang, { pregameTimeoutMs: 120 });
    const t0 = Date.now();
    await runBotPregame(session);
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(aborted).toBe(true);
    expect(CLAUDE_BFS).toContain(session.pregame?.battlefieldSelections[P2] as never);
    expect(session.log.some((e) => /model timed out — battlefield picked at random/.test(e.text))).toBe(true);
    expect((session.opponent as ClaudeOpponent).thinking).toBe(false);
    // The human is not blocked by any of this.
    expect(selectBattlefield(session, P1, HUMAN_DECK.battlefieldIds[0] as string)).toMatchObject({ ok: true });
    expect(session.pregame?.phase).toBe("initiative");
  });

  test("runBotPregame is idempotent and re-entrant: a second call adds no log line and does not re-ask the model", async () => {
    const { calls, session } = claudeMatch(answering(1));
    await runBotPregame(session);
    const logLen = session.log.length;
    await runBotPregame(session);
    expect(session.log).toHaveLength(logLen);
    expect(calls).toHaveLength(1);
  });

  test("486.5 simultaneity: while the human has not locked, its OWN payload names only its own three options and no selection of its own", async () => {
    const { session } = claudeMatch(answering(2));
    await runBotPregame(session);
    const payload = buildPregamePayload(session, P1) as {
      battlefieldOptions: { id: string }[];
      battlefieldSelected: string | null;
      battlefieldSelectedName: string | null;
      phase: string;
    };
    expect(payload.phase).toBe("battlefield_select");
    expect(payload.battlefieldSelected).toBeNull();
    expect(payload.battlefieldSelectedName).toBeNull();
    expect(payload.battlefieldOptions.map((o) => o.id)).toEqual(HUMAN_DECK.battlefieldIds);
    expect(JSON.stringify(payload)).not.toContain(ROCKFALL_PATH);
  });

  test.failing("BUG: the bot's locked pick must stay hidden until BOTH seats have locked — the shared log already names Rockfall Path (486.5: the battlefields are placed simultaneously)", async () => {
    // Expected (486.5 / 485.5, as asserted for the engine in setup-bf-simultaneous-then-mulligan-redact):
    // until every seat has chosen, a selection is hidden information — neither its id nor its name may
    // reach the other seat. Actual: `runBotPregame` pushes "🤖 Haiku chose its battlefield: Rockfall
    // Path" and `selectBattlefield` pushes "Claude … locked in a battlefield (Rockfall Path)" onto
    // `session.log`, which is a single shared stream rendered into both seats' snapshots.
    const { session } = claudeMatch(answering(2));
    await runBotPregame(session);
    expect(session.pregame?.battlefieldSelections[P1]).toBeUndefined(); // the human has NOT locked
    const shared = session.log.map((e) => e.text).join("\n");
    expect(shared).not.toContain("Rockfall Path");
  });

  test("once the human locks, both picks are public and the pregame moves on — nothing is left waiting on the bot", async () => {
    const { session } = claudeMatch(answering(2));
    await runBotPregame(session);
    expect(selectBattlefield(session, P1, HUMAN_DECK.battlefieldIds[1] as string)).toMatchObject({ completed: true, ok: true });
    expect(session.log.some((e) => /Both battlefields are locked/.test(e.text))).toBe(true);
    expect(buildPregamePayload(session, P1)).toMatchObject({ battlefieldSelectedName: nameOf(HUMAN_DECK.battlefieldIds[1] as string) });
    expect(session.pregame?.battlefieldSelections).toEqual({
      [P1]: HUMAN_DECK.battlefieldIds[1] as string,
      [P2]: ROCKFALL_PATH,
    });
  });

  test("128.4 — the human's payload never carries the bot's registered option list either, only its own", async () => {
    const { session } = claudeMatch(answering(0));
    await runBotPregame(session);
    const blob = JSON.stringify(buildPregamePayload(session, P1));
    for (const id of CLAUDE_BFS) {
      expect(blob).not.toContain(id);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// (b) game 2 — the option list is filtered, and a stale index degrades safely
// ═════════════════════════════════════════════════════════════════════════════════════════════════

describe("(b) 486.5 — after the human wins game 1 the bot is asked over TWO options", () => {
  /**
   * Game 1 played out with the bot on `g1`'s pick and the human taking the first turn, then game 1 is
   * decided (the human wins unless `humanWins: false`) and both seats press Continue. The seat's model
   * is re-pointed at `g2` BEFORE Continue, because `startNextGame` kicks the bot's game-2 pick itself.
   */
  async function toGame2(
    g1: CallModel,
    g2: CallModel,
    opts: { humanWins?: boolean } = {},
  ): Promise<{ session: GameSession; calls: ModelRequest[] }> {
    const gameId = `claude-bo3-g2-${++seq}`;
    const { calls, session } = claudeMatch(g1, { gameId });
    await runBotPregame(session);
    withRolls([0.99, 0.1], () => selectBattlefield(session, P1, HUMAN_DECK.battlefieldIds[0] as string));
    expect(session.pregame?.initiative?.chooser).toBe(P1);
    expect(chooseFirstPlayer(session, P1, P1)).toEqual({ ok: true });
    session.pregame!.mulliganComplete.add(P1);
    session.pregame!.mulliganComplete.add(P2);
    finalizePregame(session);

    if (opts.humanWins === false) {
      session.engine.applyPatches([{ op: "replace", path: ["status"], value: "finished" }]);
    } else {
      concedeGame(session, gameId, P2); // the human wins game 1
    }
    session.opponent = new ClaudeOpponent("haiku", FAKE_KEY, {
      backoffMs: 0,
      callModel: (req, o) => {
        calls.push(req);
        return g2(req, o);
      },
      lookupTools: [],
      pacingMs: 0,
    });
    voteContinue(session, gameId, P1);
    voteContinue(session, gameId, P2);
    return { calls, session };
  }

  test("the bot's menu is the option list MINUS the excluded id: two entries, indexed [0][1], and the excluded one is never offered", async () => {
    const { calls, session } = await toGame2(answering(2), answering(0));
    expect(session.gameNumber).toBe(2);
    expect(matchSummary(session).usedBattlefields[P2]).toEqual([ROCKFALL_PATH]);
    await settleBotPick(session);
    const g2Call = calls.at(-1) as ModelRequest;
    expect(g2Call.meta.menu).toHaveLength(2);
    const user = g2Call.messages[0]?.content as string;
    expect(user).toContain("[1]");
    expect(user).not.toContain("[2]");
    expect(user).not.toContain(nameOf(ROCKFALL_PATH));
    expect(session.pregame?.battlefieldSelections[P2]).toBe(TRIFARIAN_WAR_CAMP);
  });

  test("an index that was legal for the 3-option list but is out of range for the filtered one is a FAILURE, not a wrong pick: seeded fallback FROM the remaining two, logged", async () => {
    const { session } = await toGame2(answering(2), answering(2));
    await settleBotPick(session);
    const picked = session.pregame?.battlefieldSelections[P2] as string;
    expect([TRIFARIAN_WAR_CAMP, GROVE_OF_THE_GOD_WILLOW]).toContain(picked);
    expect(picked).not.toBe(ROCKFALL_PATH);
    expect(
      session.log.some((e) => new RegExp(`invalid choice from the model — battlefield picked at random \\(${nameOf(picked)}\\)`).test(e.text)),
    ).toBe(true);
  });

  test("a model that throws is handled the same way — no exception escapes, and the human's pregame never stalls", async () => {
    const boom: CallModel = async () => {
      throw new Error("network");
    };
    const { session } = await toGame2(answering(2), boom);
    await settleBotPick(session);
    expect(session.pregame?.battlefieldSelections[P2]).toBeDefined();
    expect(selectBattlefield(session, P1, HUMAN_DECK.battlefieldIds[1] as string)).toMatchObject({ ok: true });
    expect(session.pregame?.phase).not.toBe("battlefield_select");
  });

  test("the excluded id can never be selected for the bot seat by any route (486.5)", async () => {
    // A game-2 pregame carrying the same exclusion, with no bot attached so nothing has locked yet.
    const s = createGameFromDecks(HUMAN_DECK, CLAUDE_DECK, `claude-excl-${++seq}`, {
      excludedBattlefields: { [P2]: [ROCKFALL_PATH] },
      gameMode: "match",
      gameNumber: 2,
      sandbox: false,
    });
    expect(s.pregame?.battlefieldExcluded?.[P2]).toEqual([ROCKFALL_PATH]);
    const r = selectBattlefield(s, P2, ROCKFALL_PATH);
    expect(r).toMatchObject({ ok: false });
    expect((r as { error: string }).error).toContain("486.5");
    expect(s.pregame?.battlefieldSelections[P2]).toBeUndefined();
    expect(selectBattlefield(s, P2, GROVE_OF_THE_GOD_WILLOW)).toMatchObject({ ok: true });
  });

  test("486.5.a — game 1 ended with NO winner: nothing is excluded, so the bot is asked over all THREE again and may re-present the same battlefield", async () => {
    const { calls, session } = await toGame2(answering(2), answering(2), { humanWins: false });
    expect(session.match?.usedBattlefields).toEqual({});
    expect(session.pregame?.battlefieldExcluded).toBeUndefined();
    await settleBotPick(session);
    expect((calls.at(-1) as ModelRequest).meta.menu).toHaveLength(3);
    expect(session.pregame?.battlefieldSelections[P2]).toBe(ROCKFALL_PATH); // the very same one
  });

  test("chooseBotBattlefield's seeded fallback is deterministic per seed and stays inside the list it was handed", async () => {
    const s = createGameFromDecks(HUMAN_DECK, CLAUDE_DECK, `claude-seed-${++seq}`, { gameMode: "match", sandbox: true });
    const two = [TRIFARIAN_WAR_CAMP, GROVE_OF_THE_GOD_WILLOW];
    const a = await chooseBotBattlefield(s, P2, two);
    const b = await chooseBotBattlefield(s, P2, two);
    expect(a.defId).toBe(b.defId);
    expect(two).toContain(a.defId);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// (c)/(d) initiative and the 486.7 rune
// ═════════════════════════════════════════════════════════════════════════════════════════════════

describe("(c) 115.1.a / 115.1.b.1 / 116 — the first-player step is server-side, not a model call", () => {
  test("game 1: the bot wins the roll, elects to go first WITHOUT a second model call, logs it, and the pregame reaches the mulligan with hands dealt", async () => {
    const { calls, session } = claudeMatch(answering(0));
    await runBotPregame(session);
    expect(calls).toHaveLength(1);
    withRolls([0.1, 0.99], () => selectBattlefield(session, P1, HUMAN_DECK.battlefieldIds[0] as string));
    expect(session.pregame?.phase).toBe("initiative");
    expect(session.pregame?.initiative).toMatchObject({ chooser: P2, decided: false });
    expect(session.pregame?.handsDrawn).toBe(false); // 116 waits on 115

    await runBotPregame(session);
    expect(calls).toHaveLength(1); // still ONE — the choice is not a model decision
    expect(session.pregame?.firstPlayer).toBe(P2);
    expect(session.pregame?.secondPlayer).toBe(P1);
    expect(session.pregame?.phase).toBe("mulligan");
    expect(session.pregame?.handsDrawn).toBe(true);
    expect(session.log.some((e) => /won the roll and chooses to go first/.test(e.text))).toBe(true);
  });

  test("the bot never answers the initiative step for the HUMAN: when the human is the chooser, runBotPregame leaves the phase alone", async () => {
    const { session } = claudeMatch(answering(0));
    await runBotPregame(session);
    withRolls([0.99, 0.1], () => selectBattlefield(session, P1, HUMAN_DECK.battlefieldIds[0] as string));
    expect(session.pregame?.initiative).toMatchObject({ chooser: P1, decided: false });
    await runBotPregame(session);
    expect(session.pregame?.phase).toBe("initiative");
    expect(session.pregame?.initiative).toMatchObject({ chooser: P1, decided: false });
    expect(session.pregame?.handsDrawn).toBe(false);
  });

  test("(d) 486.7: the extra rune goes to the seat placed SECOND in THIS game — Claude first ⇒ the HUMAN channels the extra one", async () => {
    const { session } = claudeMatch(answering(0));
    await runBotPregame(session);
    withRolls([0.1, 0.99], () => selectBattlefield(session, P1, HUMAN_DECK.battlefieldIds[0] as string));
    await runBotPregame(session); // bot chooses itself first
    expect(session.pregame?.firstPlayer).toBe(P2);
    session.pregame!.mulliganComplete.add(P1);
    session.pregame!.mulliganComplete.add(P2);
    finalizePregame(session);
    expect(session.engine.getState().status).toBe("playing");
    expect((session.engine.getState() as { extraRunePlayerId?: string }).extraRunePlayerId).toBe(P1);
  });

  test("(d) the mirror: the human is chooser and takes the first turn ⇒ the extra rune is the BOT's — 486.7 keys on this game's seating, not on a previous game's", async () => {
    const { session } = claudeMatch(answering(0));
    await runBotPregame(session);
    withRolls([0.99, 0.1], () => selectBattlefield(session, P1, HUMAN_DECK.battlefieldIds[0] as string));
    const { chooseFirstPlayer } = await import("../../../../../../apps/riftbound-app/server/pregame");
    expect(chooseFirstPlayer(session, P1, P1)).toEqual({ ok: true });
    session.pregame!.mulliganComplete.add(P1);
    session.pregame!.mulliganComplete.add(P2);
    finalizePregame(session);
    expect((session.engine.getState() as { extraRunePlayerId?: string }).extraRunePlayerId).toBe(P2);
  });
});
