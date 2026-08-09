/**
 * vs-Claude opponent: prompts are built from the AI seat's redacted harness
 * view, choices are validated against the live legal list and applied through
 * applySessionMove, and every failure mode degrades to the Goldfish policy.
 * The model is always injected (`callModel`) — no network.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, getActingSeat, scenario } from "@tcg/riftbound/harness";
import { INFO_TOOL_NAMES } from "@tcg/riftbound-mcp/info-tools";
import {
  type CallModel,
  type ModelRequest,
  AiCallError,
  ClaudeOpponent,
  aiSeatMustAct,
  buildPrompt,
  buildSeatMenu,
  parseOpponentSpec,
  redactKey,
  resolveModel,
} from "../ai-opponent";
import { buildDefaultDeck } from "../decks";
import { createGameFromDecks, finalizePregame } from "../pregame";
import type { GameSession } from "../state";
import { applySessionMove, sandboxAutoPlay } from "../turn";

function sessionOf(engine: unknown, ai?: ClaudeOpponent): GameSession {
  const s: GameSession = {
    clients: new Map(),
    engine: engine as GameSession["engine"],
    log: [],
    playerNames: { [P1]: "Human", [P2]: "Claude" },
    players: [P1, P2],
    sandbox: true,
    seq: 0,
  };
  if (ai) {
    s.opponent = ai;
  }
  return s;
}

const FAST = { backoffMs: 0, pacingMs: 0, timeoutMs: 2000 };

/** A provider that records requests and answers via `fn`. */
function recorder(fn: (req: ModelRequest, n: number) => ReturnType<CallModel> | { name: string; input: Record<string, unknown> }) {
  const calls: ModelRequest[] = [];
  const callModel: CallModel = async (req) => {
    calls.push(req);
    return await fn(req, calls.length);
  };
  return { callModel, calls };
}

/** Pick the first menu entry whose label matches, as a `choose` tool call. */
function chooseByLabel(req: ModelRequest, ...patterns: RegExp[]): { name: string; input: Record<string, unknown> } {
  for (const re of patterns) {
    const hit = req.meta.menu?.find((it) => re.test(it.label));
    if (hit) {
      return { input: { index: hit.index, rationale: `test: ${re.source}` }, name: "choose" };
    }
  }
  throw new Error(`no menu entry matches ${patterns.map(String).join(" | ")} in:\n${req.meta.menu?.map((i) => i.label).join("\n")}`);
}

/** Let the AI act; when the human merely holds priority on the AI's chain, pass for them; repeat. */
async function drive(session: GameSession, ai: ClaudeOpponent, rounds = 12): Promise<void> {
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

describe("model allowlist + opponent spec", () => {
  test("only haiku / sonnet / opus resolve; anything else is rejected with 400", () => {
    expect(resolveModel("haiku")?.id).toBe("claude-haiku-4-5-20251001");
    expect(resolveModel("sonnet")?.id).toBe("claude-sonnet-5");
    expect(resolveModel("opus")?.id).toBe("claude-opus-5");
    expect(resolveModel("gpt-4")).toBeUndefined();
    expect(resolveModel("claude-sonnet-5")).toBeUndefined();
    expect(parseOpponentSpec({ kind: "claude", model: "claude-3-opus", apiKey: "sk-ant-xxxxxxxxxxxx" })).toMatchObject({ ok: false, status: 400 });
    expect(parseOpponentSpec({ kind: "skynet" })).toMatchObject({ ok: false, status: 400 });
    expect(parseOpponentSpec(undefined)).toEqual({ ok: true, spec: { kind: "goldfish" } });
    expect(parseOpponentSpec({ apiKey: "sk-ant-api03-abcdefghijkl", kind: "claude", model: "sonnet" })).toEqual({
      ok: true,
      spec: { apiKey: "sk-ant-api03-abcdefghijkl", kind: "claude", model: "sonnet" },
    });
    expect(() => new ClaudeOpponent("mistral" as never, "k")).toThrow(/Unknown model/);
  });

  test("the handle never serialises key material", () => {
    const ai = new ClaudeOpponent("haiku", "sk-ant-api03-SECRETSECRET", FAST);
    expect(JSON.stringify(ai)).toBe('{"kind":"claude","label":"Claude Haiku 4.5","model":"haiku"}');
    expect(JSON.stringify({ opponent: ai })).not.toContain("SECRET");
  });
});

describe("prompt construction", () => {
  test("state text is the AI seat's view: never the human's hand card names / ids or facedown identities", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .hand(P1, "ogn-004-298", "humansecret") // Cleave
      .hand(P1, { cardType: "unit", energyCost: 2, might: 2, name: "Concealed Courier" }, "courier")
      .facedown(P1, "bf1", { cardType: "spell", energyCost: 1, name: "Buried Ambush" }, "ambush")
      .hand(P2, { cardType: "unit", energyCost: 2, might: 2, name: "Loyal Poro" }, "poro")
      .unit(P1, "bf1", { might: 3, name: "Visible Guard" }, "guard")
      .build();
    const session = sessionOf(game.engine);
    const prompt = buildPrompt(session, P2, [], "Claude Sonnet 5");
    const text = `${prompt.system}\n${prompt.user}`;
    for (const leak of ["Cleave", "ogn-004-298", "humansecret", "Concealed Courier", "courier", "Buried Ambush", "ambush"]) {
      expect(text).not.toContain(leak);
    }
    // Public / own information is present.
    expect(prompt.user).toContain("Loyal Poro");
    expect(prompt.user).toContain("Visible Guard");
    expect(prompt.user).toMatch(/hand 2/); // opponent hand as a COUNT
    expect(prompt.user).toContain("facedown=1");
    expect(prompt.toolName).toBe("choose");
    expect(prompt.menu?.some((it) => /^Play Loyal Poro/.test(it.label))).toBe(true);
    expect(prompt.menu?.at(-1)?.label).toBe("End turn");
    // concede is never offered
    expect(prompt.menu?.some((it) => /concede/i.test(it.label))).toBe(false);
  });
});

describe("act loop", () => {
  test("invalid index → 2 retries with a NOTE → Goldfish fallback applies a legal move (end turn)", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2 })
      .hand(P2, { cardType: "unit", energyCost: 2, might: 2, name: "Loyal Poro" }, "poro")
      .build();
    const rec = recorder(() => ({ input: { index: 999, rationale: "chaos" }, name: "choose" }));
    const ai = new ClaudeOpponent("haiku", "sk-ant-api03-testkeytestkey", { ...FAST, callModel: rec.callModel });
    const session = sessionOf(game.engine, ai);
    expect(aiSeatMustAct(session, P2)).toBe(true);
    await ai.act(session);
    expect(rec.calls).toHaveLength(3);
    expect(rec.calls[1]?.messages[0]?.content).toContain("NOTE: Your previous reply was invalid");
    expect(session.engine.getState().turn.activePlayer).toBe(P1);
    expect(session.log.some((e) => /🤖 Haiku: End turn \(fallback\)/u.test(e.text))).toBe(true);
    expect(ai.busy).toBe(false);
    expect(ai.thinking).toBe(false);
  });

  test("stops as soon as the human holds priority; log lines carry the rationale", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .unit(P2, "base", { might: 2, name: "Sparring Partner" }, "pal")
      .hand(P2, "ogn-004-298", "cleave")
      .build();
    const rec = recorder((req) => chooseByLabel(req, /^Cast Cleave/, /^Pass priority/));
    const ai = new ClaudeOpponent("sonnet", "sk-ant-api03-testkeytestkey", { ...FAST, callModel: rec.callModel, lookupTools: [] });
    const session = sessionOf(game.engine, ai);
    await ai.act(session);
    const st = session.engine.getState();
    expect(st.interaction?.chain?.active).toBe(true);
    expect(getActingSeat(st)).toBe(P1);
    expect(aiSeatMustAct(session, P2)).toBe(false);
    expect(rec.calls.length).toBeGreaterThanOrEqual(1);
    expect(rec.calls.length).toBeLessThanOrEqual(2);
    expect(session.log.some((e) => /^🤖 Sonnet: Cast Cleave.*— 'test: \^Cast Cleave'$/u.test(e.text))).toBe(true);
    // Only the seat's tool is offered, tool use is forced, output is small.
    expect(rec.calls[0]?.tools.map((t) => t.name)).toEqual(["choose"]);
    expect(rec.calls[0]?.tool_choice).toEqual({ type: "any" });
    expect(rec.calls[0]?.max_tokens).toBe(300);
    expect(rec.calls[0]?.model).toBe("claude-sonnet-5");
  });

  test("decision path: yes/no prompt is answered through the `answer` tool (Immortal Phoenix pay-to-play)", async () => {
    const BOLT = {
      abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
      cardType: "spell",
      domain: "fury",
      energyCost: 1,
      name: "Test Bolt",
      timing: "action",
    };
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2, power: { fury: 1 } })
      .unit(P1, "base", { might: 3, name: "Victim" }, "victim")
      .trash(P2, "ogn-037-298", "phoenix")
      .hand(P2, BOLT, "bolt")
      .build();
    const decisionCalls: ModelRequest[] = [];
    const rec = recorder((req) => {
      if (req.meta.decision) {
        decisionCalls.push(req);
        return req.meta.decision.kind === "yes-no"
          ? { input: { accept: true, rationale: "free value" }, name: "answer" }
          : { input: { keys: ["1"], rationale: "first" }, name: "answer" };
      }
      return chooseByLabel(req, /^Cast Test Bolt → Victim/, /^Pass priority/, /^End turn/);
    });
    const ai = new ClaudeOpponent("opus", "sk-ant-api03-testkeytestkey", { ...FAST, callModel: rec.callModel, lookupTools: [] });
    const session = sessionOf(game.engine, ai);
    await drive(session, ai);
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.zoneOf("phoenix")).toBe("base");
    // The pay-to-play trigger is the only real decision for the model: the Phoenix returns straight
    // to base (no destination prompt), so nothing else may reach the model.
    expect(decisionCalls.map((c) => c.meta.decision?.kind)).toEqual(["yes-no"]);
    expect(decisionCalls[0]?.tools.map((t) => t.name)).toEqual(["answer"]);
    expect(decisionCalls[0]?.messages[0]?.content).toContain("PENDING PROMPT for you (yes-no): Pay [1][fury]");
    expect(session.log.some((e) => /🤖 Opus: Pay \[1\]\[fury\].*→ yes — 'free value'/u.test(e.text))).toBe(true);
    // A lone "Pass priority" is taken without a model call.
    expect(rec.calls.every((c) => (c.meta.menu?.length ?? 2) > 1)).toBe(true);
  });

  test("decision path: pick prompt answered by option number (First Mate readies the chosen unit)", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 3 })
      .unit(P2, "base", { might: 2, name: "Sleepy One" }, "s1", { exhausted: true })
      .unit(P2, "base", { might: 4, name: "Sleepy Two" }, "s2", { exhausted: true })
      .hand(P2, "ogn-132-298", "fm")
      .build();
    let offered: string[] = [];
    let kind = "";
    let alias: string | undefined;
    const rec = recorder((req) => {
      if (req.meta.decision) {
        kind = req.meta.decision.kind;
        offered = [...(req.meta.keyAliases?.values() ?? [])];
        // answer with the ALIAS number of "s2", never the raw id
        alias = [...(req.meta.keyAliases ?? [])].find(([, key]) => key === "s2")?.[0];
        return { input: { keys: [alias ?? "?"], rationale: "bigger body" }, name: "answer" };
      }
      return chooseByLabel(req, /^Play First Mate/, /^Pass priority/, /^End turn/);
    });
    const ai = new ClaudeOpponent("haiku", "sk-ant-api03-testkeytestkey", { ...FAST, callModel: rec.callModel });
    const session = sessionOf(game.engine, ai);
    await drive(session, ai);
    expect(kind).toBe("pick");
    expect(alias).toMatch(/^\d+$/);
    expect(offered).toEqual(expect.arrayContaining(["s1", "s2"]));
    expect(game.state("s2").isReady).toBe(true);
    expect(game.state("s1").isReady).toBe(false);
  });

  test("'Pay & play' expands to rune taps + the play, leaving the pool non-negative", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 0 })
      .runes(P2, "fury", 3)
      .runes(P2, "chaos", 1)
      .hand(P2, "ogn-037-298", "phoenix") // 3 energy + [fury]
      .build();
    const session0 = sessionOf(game.engine);
    const menu = buildSeatMenu(session0, P2).items;
    const pp = menu.find((it) => it.kind === "payplay" && /Immortal Phoenix/.test(it.label));
    expect(pp).toBeDefined();
    expect(pp?.moves.every((m) => m.moveId === "exhaustRune" || m.moveId === "recycleRune")).toBe(true);
    expect(pp?.moves.filter((m) => m.moveId === "recycleRune")).toHaveLength(1);
    expect(pp?.moves.find((m) => m.moveId === "recycleRune")?.params.domain).toBe("fury");
    // Plain plays are not legal yet (nothing in the pool).
    expect(menu.some((it) => it.kind === "move" && /^Play Immortal Phoenix/.test(it.label))).toBe(false);

    const rec = recorder((req) => chooseByLabel(req, /^Pay & Play Immortal Phoenix \[#?\w*\]? ?to Base|^Pay & Play Immortal Phoenix/, /^Pass priority/, /^End turn/));
    const ai = new ClaudeOpponent("haiku", "sk-ant-api03-testkeytestkey", { ...FAST, callModel: rec.callModel });
    const session = sessionOf(game.engine, ai);
    await drive(session, ai);
    expect(game.zoneOf("phoenix")).toBe("base");
    const pool = session.engine.getState().runePools[P2];
    expect(pool?.energy ?? 0).toBeGreaterThanOrEqual(0);
    for (const n of Object.values(pool?.power ?? {})) {
      expect(n).toBeGreaterThanOrEqual(0);
    }
    // Exactly what was needed: 3 exhausted for energy (one of them recycled for [fury]) → pool drained to 0.
    expect(pool?.energy).toBe(0);
    expect(pool?.power?.fury ?? 0).toBe(0);
  });

  test("API failures: retryable errors back off and retry; a 401 disables the seat and redacts the key", async () => {
    const KEY = "sk-ant-api03-veryverysecretkey123";
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2 })
      .hand(P2, { cardType: "unit", energyCost: 2, might: 2, name: "Cheap Body" }, "cheap")
      .build();
    let n = 0;
    const flaky: CallModel = async (req, { apiKey }) => {
      n++;
      expect(apiKey).toBe(KEY);
      if (n < 3) {
        throw new AiCallError("API error 529 (overloaded_error)", 529, true);
      }
      return chooseByLabel(req, /^End turn/);
    };
    const ai = new ClaudeOpponent("haiku", KEY, { ...FAST, callModel: flaky });
    const session = sessionOf(game.engine, ai);
    await ai.act(session);
    expect(n).toBe(3);
    expect(session.engine.getState().turn.activePlayer).toBe(P1);
    expect(session.log.some((e) => /🤖 Haiku: End turn — /u.test(e.text) && !/fallback/.test(e.text))).toBe(true);

    // 401 with the key echoed in the provider's message → disabled + redacted everywhere we can see.
    const game2 = await scenario()
      .active(P2)
      .resources(P2, { energy: 2 })
      .hand(P2, { cardType: "unit", energyCost: 2, might: 2, name: "Cheap Body" }, "cheap")
      .build();
    const seen: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      seen.push(args.map(String).join(" "));
    };
    try {
      const bad: CallModel = async () => {
        throw new AiCallError(`invalid x-api-key ${KEY}`, 401, false);
      };
      const ai2 = new ClaudeOpponent("sonnet", KEY, { ...FAST, callModel: bad });
      const session2 = sessionOf(game2.engine, ai2);
      await ai2.act(session2);
      expect(ai2.disabledReason).toBe("API 401");
      expect(session2.engine.getState().turn.activePlayer).toBe(P1); // Goldfish ended the turn
      expect(session2.log.some((e) => /unavailable \(API 401\)/.test(e.text))).toBe(true);
      const all = `${seen.join("\n")}\n${session2.log.map((e) => e.text).join("\n")}`;
      expect(all).not.toContain(KEY);
      expect(all).toContain("[redacted]");
    } finally {
      console.log = origLog;
    }
    expect(redactKey(`boom ${KEY} and sk-ant-admin01-zzzzzzzzzz`, KEY)).toBe("boom [redacted] and [redacted]");
  });
});

describe("lookup tools", () => {
  test("a lookup tool_use gets a tool_result and the model is re-asked; after 3 lookups the decision tool is forced", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2 })
      .hand(P2, { cardType: "unit", energyCost: 2, might: 2, name: "Loyal Poro" }, "poro")
      .build();
    const seenInputs: unknown[] = [];
    const lookup = {
      description: "Look up a rule",
      handler: (input: Record<string, unknown>, ctx: { seat: string }) => {
        seenInputs.push({ ...input, seat: ctx.seat });
        return { rule: "units enter exhausted", seat: ctx.seat };
      },
      input_schema: { properties: { q: { type: "string" } }, required: ["q"], type: "object" },
      name: "lookup_rule",
    };
    const reqs: ModelRequest[] = [];
    let n = 0;
    const callModel: CallModel = async (req) => {
      reqs.push(structuredClone({ ...req, meta: { seat: req.meta.seat } }));
      n++;
      if (n <= 4) {
        // keeps asking for lookups; the 4th time lookups are no longer offered/forced away
        const offered = req.tools.map((t) => t.name);
        if (offered.includes("lookup_rule")) {
          return { content: [{ id: `tu${n}`, input: { q: `q${n}` }, name: "lookup_rule", type: "tool_use" as const }], toolUses: [{ id: `tu${n}`, input: { q: `q${n}` }, name: "lookup_rule" }] };
        }
      }
      return chooseByLabel(req, /^Play Loyal Poro/, /^End turn/);
    };
    const ai = new ClaudeOpponent("haiku", "sk-ant-api03-testkeytestkey", { ...FAST, callModel, lookupTools: [lookup] });
    const session = sessionOf(game.engine, ai);
    await ai.act(session);
    // 3 lookups served, then a 4th request that only offers/forces `choose`.
    expect(seenInputs).toEqual([{ q: "q1", seat: P2 }, { q: "q2", seat: P2 }, { q: "q3", seat: P2 }]);
    expect(reqs[0]?.tools.map((t) => t.name)).toEqual(["choose", "lookup_rule"]);
    expect(reqs[1]?.messages).toHaveLength(3); // user prompt, assistant tool_use, user tool_result
    const tr = (reqs[1]?.messages[2]?.content as { type: string; tool_use_id: string; content: string }[])[0];
    expect(tr).toMatchObject({ tool_use_id: "tu1", type: "tool_result" });
    expect(tr?.content).toContain("units enter exhausted");
    expect(reqs[3]?.tools.map((t) => t.name)).toEqual(["choose"]);
    expect(reqs[3]?.tool_choice).toEqual({ name: "choose", type: "tool" });
    expect(game.zoneOf("poro")).toBe("base");
  });
});

describe("mcp info tools as default lookups", () => {
  test("opponent_summary (real handler, AI seat as viewer) then choose → both handled; a 4th info call is refused by forcing `choose`", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2 })
      .legend(P1, "ogn-247-298", "humanlegend")
      .hand(P1, { cardType: "spell", energyCost: 1, name: "Zz Human Secret" }, "zzsecret")
      .unit(P1, "base", { might: 3, name: "Human Guard" }, "guard")
      .hand(P2, { cardType: "unit", energyCost: 2, might: 2, name: "Loyal Poro" }, "poro")
      .build();
    const reqs: ModelRequest[] = [];
    let phase: "summary" | "spam" = "summary";
    let n = 0;
    const callModel: CallModel = async (req) => {
      reqs.push(structuredClone({ ...req, meta: { seat: req.meta.seat } }));
      n++;
      const offered = req.tools.map((t) => t.name);
      if (phase === "summary" && n === 1) {
        return { id: "tu_sum", input: {}, name: "opponent_summary" };
      }
      if (phase === "spam" && offered.includes("rule_search")) {
        return { id: `tu${n}`, input: { query: "deflect" }, name: "rule_search" };
      }
      return chooseByLabel(req, /^Play Loyal Poro/, /^End turn/);
    };
    // no lookupTools option → the packaged MCP info tools are the defaults
    const ai = new ClaudeOpponent("haiku", "sk-ant-api03-testkeytestkey", { ...FAST, callModel });
    const session = sessionOf(game.engine, ai);
    await ai.act(session);

    expect(reqs[0]?.tools.map((t) => t.name)).toEqual(["choose", ...INFO_TOOL_NAMES]);
    expect(reqs[0]?.tool_choice).toEqual({ type: "any" });
    expect(reqs[0]?.system).toContain("opponent_summary");
    expect(reqs).toHaveLength(2);
    const tr = (reqs[1]?.messages[2]?.content as { type: string; tool_use_id: string; content: string; is_error?: boolean }[])[0];
    expect(tr).toMatchObject({ tool_use_id: "tu_sum", type: "tool_result" });
    expect(tr?.is_error).toBeUndefined();
    // the human (player-1) summarised from the AI seat's redacted view: public board yes, hand contents no
    expect(tr?.content).toContain("player-1 — legend: Daughter of the Void");
    expect(tr?.content).toContain("Human Guard [guard] 3M");
    expect(tr?.content).toContain("hand 1 (hidden)");
    expect(tr?.content).not.toContain("Zz Human Secret");
    expect(tr?.content).not.toContain("zzsecret");
    expect(game.zoneOf("poro")).toBe("base");

    // cap: three rule_search results are served, the 4th request offers only `choose` and forces it
    phase = "spam";
    n = 0;
    reqs.length = 0;
    const game2 = await scenario()
      .active(P2)
      .resources(P2, { energy: 2 })
      .hand(P2, { cardType: "unit", energyCost: 2, might: 2, name: "Loyal Poro" }, "poro")
      .build();
    const ai2 = new ClaudeOpponent("haiku", "sk-ant-api03-testkeytestkey", { ...FAST, callModel });
    await ai2.act(sessionOf(game2.engine, ai2));
    expect(reqs).toHaveLength(4);
    const served = reqs
      .flatMap((r) => r.messages)
      .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
      .filter((b) => b.type === "tool_result") as { content: string }[];
    expect(new Set(served.map((b) => b.content)).size).toBe(1); // same query each time
    expect(served[0]?.content).toContain("809 · Deflect");
    expect(reqs[3]?.messages.filter((m) => m.role === "user")).toHaveLength(4); // prompt + 3 tool_result turns
    expect(reqs[3]?.tools.map((t) => t.name)).toEqual(["choose"]);
    expect(reqs[3]?.tool_choice).toEqual({ name: "choose", type: "tool" });
    expect(game2.zoneOf("poro")).toBe("base");
  });
});

describe("smoke: first-legal AI (player-2) vs Goldfish (player-1) on starter decks", () => {
  test("plays 6 turns through applySessionMove without a rejected move or a stuck seat", async () => {
    const session = createGameFromDecks(buildDefaultDeck(), buildDefaultDeck("calm", "mind"), "ai-smoke", {
      firstPlayer: P1,
      gameMode: "duel",
      names: { [P1]: "Goldfish", [P2]: "Claude Haiku 4.5" },
      sandbox: true,
    });
    session.pregame?.mulliganComplete.add(P1);
    session.pregame?.mulliganComplete.add(P2);
    finalizePregame(session);
    expect(session.engine.getState().status).toBe("playing");

    let rejected = 0;
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      const line = args.map(String).join(" ");
      if (line.includes("[ai] move rejected") || line.includes("play after payment rejected")) {
        rejected++;
      }
    };
    const { firstLegalCallModel } = await import("../ai-opponent");
    const ai = new ClaudeOpponent("haiku", undefined, { ...FAST, callModel: firstLegalCallModel, maxActionsPerSegment: 40 });
    session.opponent = ai;
    try {
      let guard = 0;
      while (session.engine.getState().status === "playing" && session.engine.getState().turn.number < 7 && guard++ < 400) {
        const before = session.engine.getReplayHistory().length;
        if (aiSeatMustAct(session, P2)) {
          await ai.act(session);
        } else {
          sandboxAutoPlay(session, P1);
        }
        if (session.engine.getReplayHistory().length === before && session.engine.getState().status === "playing") {
          throw new Error(`nobody could act at turn ${session.engine.getState().turn.number} (cursor ${String(getActingSeat(session.engine.getState()))})`);
        }
      }
    } finally {
      console.log = origLog;
    }
    const end = session.engine.getState();
    expect(end.status === "finished" || end.turn.number >= 7).toBe(true);
    expect(rejected).toBe(0);
    expect(session.log.some((e) => /is stuck/.test(e.text))).toBe(false);
    expect(session.log.filter((e) => e.text.startsWith("🤖")).length).toBeGreaterThan(3);
  }, 120_000);
});
