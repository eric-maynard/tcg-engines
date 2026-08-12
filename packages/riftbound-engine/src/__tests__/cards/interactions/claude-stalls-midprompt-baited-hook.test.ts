/**
 * Interaction: the vs-Claude seat stops answering while one of its own effects is HALF PERFORMED.
 *   Baited Hook    (ogn-242-298) · Gear — "[1][order], [Exhaust]: Kill a friendly unit. Look at the
 *     top 5 cards of your Main Deck. You may banish a unit from among them that has Might up to 1
 *     more than the killed unit and play it, ignoring its cost. Then recycle the rest."
 *   Tasty Faefolk  (ogn-075-298) · 6-Might unit — "[Deathknell] — Channel 2 runes exhausted and draw 1."
 *   Lecturing Yordle (ogn-087-298) · 2-Might [Tank] — the legal banish-and-play among the top 5.
 *
 * The Claude seat activates Baited Hook, killing its own Tasty Faefolk, with Lecturing Yordle among
 * the top 5. The model then stops answering: timeouts, then a 500, then a 401.
 *
 * Question:
 *   (a) At the moment of the stall, is the position half-performed (pips spent, gear exhausted,
 *       Faefolk dead, Deathknell on the chain, a look-at-5 prompt open) or is the whole activation
 *       undone? Which is correct, and what must the human SEE either way?
 *   (b) Does the failure surface to the human — thinking:false, an ai_status frame, a log line, a
 *       pushed snapshot — instead of a silent spinner, and does the Goldfish then RESOLVE the open
 *       prompt so the chain finishes and the turn can end?
 *   (c) Does a non-retryable 401 disable the seat for the rest of the game with key material scrubbed
 *       from every log line, snapshot and error string, with the Goldfish playing on?
 *   (d) After three consecutive engine rejections even of fallback moves, is the seat declared stuck
 *       with an explicit instruction to the human, rather than spinning the segment loop?
 *
 * Rules: 358.5 (a play is undone only when its OWN checks fail — not when its controller stops
 * answering), 416 (recycle = to the bottom of the owner's Main Deck), 383.3.a.3 (a later "you may"
 * is decided as the ability RESOLVES, which is exactly the prompt that is left open), 650 (a player
 * may concede at any time — the human's controls stay live), 128.4 (a pick taken out of a private
 * look is not named in the shared match log).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";
import {
  type CallModel,
  type ModelRequest,
  AiCallError,
  ClaudeOpponent,
  aiSeatMustAct,
  redactKey,
} from "../../../../../../apps/riftbound-app/server/ai-opponent";
import type { GameSession } from "../../../../../../apps/riftbound-app/server/state";
import { applySessionMove } from "../../../../../../apps/riftbound-app/server/turn";

const BAITED_HOOK = "ogn-242-298";
const TASTY_FAEFOLK = "ogn-075-298";
const LECTURING_YORDLE = "ogn-087-298";
const FILLER = "ogn-175-298"; // Shipyard Skulker, vanilla 3 Might

const KEY = "sk-ant-api03-veryverysecretkey123";
const FAST = { backoffMs: 0, pacingMs: 0, timeoutMs: 2000 };

interface Frame {
  type: string;
  ai?: { thinking?: boolean; label?: string; model?: string };
  moveId?: string;
  playerId?: string;
}

function sessionOf(engine: unknown, ai?: ClaudeOpponent): { session: GameSession; frames: Frame[] } {
  const frames: Frame[] = [];
  const session: GameSession = {
    clients: new Map(),
    engine: engine as GameSession["engine"],
    log: [],
    playerNames: { [P1]: "Human", [P2]: "Claude" },
    players: [P1, P2],
    sandbox: true,
    seq: 0,
  };
  session.clients.set("human", {
    playerId: P1,
    ws: { send: (raw: string) => frames.push(JSON.parse(raw) as Frame) },
  } as unknown as NonNullable<GameSession["clients"]> extends Map<string, infer C> ? C : never);
  if (ai) {
    session.opponent = ai;
  }
  return { frames, session };
}

/** The Claude seat can pay for the Hook, holds the Faefolk, and Lecturing Yordle sits in the top 5. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 1, power: { order: 1 } })
    .gear(P2, BAITED_HOOK, "hook")
    .unit(P2, "base", TASTY_FAEFOLK, "faefolk")
    .deck(P2, [FILLER, LECTURING_YORDLE, FILLER, FILLER, FILLER], ["d1", "yordle", "d3", "d4", "d5"]);
}

/** Let the AI act; pass priority for the human whenever they merely hold it on the AI's chain. */
async function drive(session: GameSession, ai: ClaudeOpponent, rounds = 16): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    if (aiSeatMustAct(session, P2)) {
      await ai.act(session);
      continue;
    }
    const st = session.engine.getState();
    const chain = st.interaction?.chain;
    if (st.status === "playing" && chain?.active && chain.activePlayer === P1) {
      expect(applySessionMove(session, P1, "passChainPriority", { playerId: P1 }).success).toBe(true);
      continue;
    }
    break;
  }
}

/** Answers `choose` menus by label; every `answer` prompt throws `fail` (the model has stalled). */
function stalling(fail: () => never, onPrompt?: (req: ModelRequest) => void) {
  const calls: ModelRequest[] = [];
  const callModel: CallModel = async (req) => {
    calls.push(req);
    if (req.meta.menu) {
      const hit = req.meta.menu.find((it) => /Activate Baited Hook/.test(it.label)) ?? req.meta.menu.find((it) => /End turn/.test(it.label));
      if (!hit) {
        throw new Error(`no usable menu entry in:\n${req.meta.menu.map((i) => i.label).join("\n")}`);
      }
      return { input: { index: hit.index, rationale: "hook the Faefolk" }, name: "choose" };
    }
    onPrompt?.(req);
    fail();
  };
  return { callModel, calls };
}

describe("Claude stalls mid-prompt on its own Baited Hook", () => {
  // ---- (a) the position at the stall is legitimately mid-effect ----------------------------------

  test("(a) costs are paid on ACTIVATION: at the stall the pips are spent, the Hook is exhausted, the Faefolk is dead with its Deathknell on the chain, and the look-at-5 prompt is open (358.5 does not undo it)", async () => {
    const game = await board().build();
    let seen: {
      energy: number;
      power: Record<string, number>;
      hookExhausted: boolean;
      faefolkZone: string;
      chain: readonly { cardId: string; triggered: boolean }[];
      prompt: string;
      options: string[];
    } | undefined;
    const rec = stalling(
      () => {
        throw new AiCallError("API error 500 (internal)", 500, true);
      },
      () => {
        seen = {
          chain: game.chain().map((c) => ({ cardId: c.cardId, triggered: c.triggered })),
          energy: game.p2.energy(),
          faefolkZone: game.zoneOf("faefolk"),
          hookExhausted: game.state("hook").isExhausted,
          options: (game.decision() as { options?: { key: string }[] } | null)?.options?.map((o) => o.key) ?? [],
          power: { ...(game.p2.resources().power as Record<string, number>) },
          prompt: game.decision()?.prompt ?? "",
        };
      },
    );
    const ai = new ClaudeOpponent("haiku", KEY, { ...FAST, callModel: rec.callModel, lookupTools: [] });
    const { session } = sessionOf(game.engine, ai);
    await drive(session, ai);

    expect(seen).toBeDefined();
    // Costs (rule 404.1: paid on activation) are gone and stay gone.
    expect(seen?.energy).toBe(0);
    expect(seen?.power).toEqual({ order: 0 });
    expect(seen?.hookExhausted).toBe(true);
    // The kill has happened; its Deathknell is a chain item under the open prompt.
    expect(seen?.faefolkZone).toBe("trash");
    expect(seen?.chain).toEqual([{ cardId: "faefolk", triggered: true }]);
    // …and the prompt the model abandoned is the look-at-5, offering all five cards.
    expect(seen?.prompt).toMatch(/revealed/i);
    expect(seen?.options).toEqual(["d1", "yordle", "d3", "d4", "d5"]);
  });

  test("(a) nothing is rolled back once the seat goes silent: the Faefolk stays dead and its Deathknell still pays out (channel 2 exhausted + draw 1)", async () => {
    const game = await board().build();
    const handBefore = game.p2.hand().length;
    const rec = stalling(() => {
      throw new AiCallError("API error 500 (internal)", 500, true);
    });
    const ai = new ClaudeOpponent("haiku", KEY, { ...FAST, callModel: rec.callModel, lookupTools: [] });
    const { session } = sessionOf(game.engine, ai);
    await drive(session, ai);

    expect(game.zoneOf("faefolk")).toBe("trash");
    expect(game.zoneOf("hook")).toBe("base");
    expect(game.p2.runes()).toHaveLength(2);
    expect(game.p2.runes({ ready: true })).toHaveLength(0); // "channel 2 runes EXHAUSTED"
    expect(game.p2.hand()).toHaveLength(handBefore + 1);
    expect(game.violations()).toEqual([]);
  });

  // ---- (b) the failure surfaces, and the Goldfish finishes the open prompt -----------------------

  test("(b) a retryable failure is retried inside one call (3 attempts) and then surfaces: thinking:false in an ai_status frame, a fallback log line, and a pushed state_update", async () => {
    const game = await board().build();
    const rec = stalling(() => {
      throw new AiCallError("API error 500 (internal)", 500, true);
    });
    const ai = new ClaudeOpponent("haiku", KEY, { ...FAST, callModel: rec.callModel, lookupTools: [] });
    const { frames, session } = sessionOf(game.engine, ai);
    await drive(session, ai);

    // One `choose` call for the activation, then exactly three retried attempts at the prompt.
    const promptCalls = rec.calls.filter((c) => c.meta.decision);
    expect(promptCalls).toHaveLength(3);
    expect(promptCalls.every((c) => c.meta.decision?.kind === "pick")).toBe(true);

    const status = frames.filter((f) => f.type === "ai_status");
    expect(status.length).toBeGreaterThanOrEqual(2);
    expect(status.some((f) => f.ai?.thinking === true)).toBe(true);
    expect(status.at(-1)?.ai?.thinking).toBe(false);
    expect(ai.thinking).toBe(false);
    expect(ai.busy).toBe(false);
    expect(frames.some((f) => f.type === "state_update" && f.playerId === P2)).toBe(true);
    expect(session.log.some((e) => /🤖 Haiku: Resolve prompt \(first option\) \(fallback\)/u.test(e.text))).toBe(true);
  });

  test("(b) the Goldfish RESOLVES the open prompt: the first offered card is banished-and-played, the rest recycle to the BOTTOM (416), the chain clears and nothing is pending", async () => {
    const game = await board().build();
    const rec = stalling(() => {
      throw new AiCallError("API error 500 (internal)", 500, true);
    });
    const ai = new ClaudeOpponent("haiku", KEY, { ...FAST, callModel: rec.callModel, lookupTools: [] });
    const { session } = sessionOf(game.engine, ai);
    await drive(session, ai);

    // firstOptionPolicy takes the first offered card — Lecturing Yordle (2 Might) would also have been
    // legal, since "up to 1 more than the killed unit" allows up to 7 against the 6-Might Faefolk.
    expect(game.zoneOf("d1")).toBe("base");
    // 416 fixes the destination (the bottom), not the order among the recycled cards.
    expect([...game.p2.deck().slice(-4)].sort()).toEqual(["d3", "d4", "d5", "yordle"]);
    expect(game.chain()).toEqual([]);
    expect(session.engine.getState().pendingChoice).toBeUndefined();
    // …and the turn could then be ended, so the human is not stuck behind a dead seat.
    expect(session.engine.getState().turn.activePlayer).toBe(P1);
  });

  test("(b) the human can act the whole time: conceding stays legal at the abandoned prompt (650)", async () => {
    const game = await board().build();
    let humanCouldConcede: boolean | undefined;
    const rec = stalling(
      () => {
        throw new AiCallError("API error 500 (internal)", 500, true);
      },
      () => {
        humanCouldConcede = game.p1.can("concede");
      },
    );
    const ai = new ClaudeOpponent("haiku", KEY, { ...FAST, callModel: rec.callModel, lookupTools: [] });
    const { session } = sessionOf(game.engine, ai);
    await drive(session, ai);
    expect(humanCouldConcede).toBe(true);
    expect(game.p1.can("concede")).toBe(true);
  });

  // ---- (c) a 401 disables the seat, with the key scrubbed ----------------------------------------

  test("(c) timeouts → 500 → 401 inside one call: the 401 wins, the seat is disabled, and the log names it without the key", async () => {
    const game = await board().build();
    const seen: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      seen.push(args.map(String).join(" "));
    };
    try {
      let promptCalls = 0;
      const rec = stalling(() => {
        promptCalls++;
        if (promptCalls === 1) {
          throw new AiCallError("request timed out", 0, true);
        }
        if (promptCalls === 2) {
          throw new AiCallError("API error 500 (internal)", 500, true);
        }
        throw new AiCallError(`invalid x-api-key ${KEY}`, 401, false);
      });
      const ai = new ClaudeOpponent("haiku", KEY, { ...FAST, callModel: rec.callModel, lookupTools: [] });
      const { session } = sessionOf(game.engine, ai);
      await drive(session, ai);

      expect(ai.disabledReason).toBe("API 401");
      expect(session.log.some((e) => /🤖 Claude Haiku 4\.5 is unavailable \(API 401\) — the Goldfish plays this seat\./u.test(e.text))).toBe(true);
      // The Goldfish still finished the position.
      expect(session.engine.getState().pendingChoice).toBeUndefined();
      expect(session.engine.getState().turn.activePlayer).toBe(P1);
      // No key material anywhere the human or an operator can see.
      const all = `${seen.join("\n")}\n${session.log.map((e) => e.text).join("\n")}\n${JSON.stringify(ai)}`;
      expect(all).not.toContain(KEY);
      expect(all).toContain("[redacted]");
      expect(JSON.stringify(ai.toJSON())).toBe('{"kind":"claude","label":"Claude Haiku 4.5","model":"haiku"}');
    } finally {
      console.log = origLog;
    }
    expect(redactKey(`boom ${KEY} and sk-ant-admin01-zzzzzzzzzz`, KEY)).toBe("boom [redacted] and [redacted]");
  });

  test("(c) once disabled the model is never called again — every later step is played by the Goldfish", async () => {
    const game = await board().build();
    const origLog = console.log;
    console.log = () => {};
    try {
      const rec = stalling(() => {
        throw new AiCallError(`invalid x-api-key ${KEY}`, 401, false);
      });
      const ai = new ClaudeOpponent("haiku", KEY, { ...FAST, callModel: rec.callModel, lookupTools: [] });
      const { session } = sessionOf(game.engine, ai);
      await drive(session, ai);
      const callsWhenDisabled = rec.calls.length;
      expect(ai.disabledReason).toBe("API 401");

      // A second segment on a fresh cursor: the seat acts, but never through the model.
      await game.advanceToTurnOf(P2);
      await ai.act(session);
      expect(rec.calls).toHaveLength(callsWhenDisabled);
      expect(session.log.filter((e) => /fallback/.test(e.text)).length).toBeGreaterThanOrEqual(1);
    } finally {
      console.log = origLog;
    }
  });

  // ---- (d) three rejections in a row, then the Goldfish, then "stuck" ----------------------------

  test("(d) when the engine refuses everything the segment does not spin: 3 rejected applications, one Goldfish attempt, then an explicit 'is stuck' line and an aiStuck frame", async () => {
    const game = await board().build();
    const rejected: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      const line = args.map(String).join(" ");
      if (line.includes("[ai] move rejected")) {
        rejected.push(line);
      }
    };
    try {
      const engine = game.engine as unknown as { executeMove: (id: string, arg: unknown) => unknown };
      const realExecute = engine.executeMove.bind(engine);
      // The engine refuses every move: the model's choice and the Goldfish's fallback alike.
      engine.executeMove = () => ({ error: "engine refuses", success: false });
      const rec = stalling(() => {
        throw new Error("unreachable — the menu path is used");
      });
      const ai = new ClaudeOpponent("haiku", KEY, { ...FAST, callModel: rec.callModel, lookupTools: [] });
      const { frames, session } = sessionOf(game.engine, ai);

      await ai.act(session); // must TERMINATE, not spin

      expect(rejected.length).toBeGreaterThanOrEqual(3);
      expect(session.log.some((e) => /🤖 Haiku is stuck — use Rewind or end the turn from the sandbox controls\./u.test(e.text))).toBe(true);
      expect(frames.some((f) => f.type === "state_update" && f.moveId === "aiStuck")).toBe(true);
      expect(ai.busy).toBe(false);
      // Nothing landed: the position is exactly as it was, so the human's controls still work.
      expect(game.zoneOf("faefolk")).toBe("base");
      expect(game.state("hook").isExhausted).toBe(false);
      engine.executeMove = realExecute;
      expect(game.p1.can("concede")).toBe(true);
    } finally {
      console.log = origLog;
    }
  });
});
