/**
 * Interaction: RB_AI_MOCK=1 (no network, no key) × [Vision] looks at a Secret zone.
 *
 *   Gemcraft Seer (ogn-100-298) — Unit, Mind. "[Vision] … Other friendly units have [Vision]."
 *   Sai Scout     (ogn-174-298) — Unit, Chaos. "[Vision] … You may play me to an open battlefield."
 *   Mystic Poro   (ogn-171-298) — Unit, Chaos. "[Vision]" — here it is the card ON TOP of the
 *                  Claude seat's Main Deck, i.e. the thing that must not leak.
 *
 * Q: (a) does the mock drive the same code path as the live model — buildPrompt → callModel →
 * #validate → applySessionMove → #push — and does replaying the same seeded game twice produce
 * identical move sequences and identical 🤖 log lines? (b) does the looked-at Mystic Poro appear
 * ONLY in the Claude seat's own surfaces — never in the human's snapshot, never in a broadcast
 * frame, never in the log line for the decision? (c) with an empty Main Deck, is the decision absent
 * rather than unanswerable, so the mock seat never stalls? (d) do the two Vision instances on one
 * unit resolve separately, the granted one behaving exactly like the printed one?
 *
 * Rules: 128.3 (Main Deck order is Secret to everyone), 424.1.a (a LOOK is not a Reveal), 424.2.a
 * (revealing from a Secret zone happens only when an effect instructs it), 416 (recycle → the bottom
 * of the Main Deck), 383.3 (triggered abilities use the chain and resolve LIFO), 817.2 (each
 * instance of [Vision] triggers separately).
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const { ClaudeOpponent, aiMockEnabled, aiSeatMustAct, buildPrompt, describeForSeat, firstLegalCallModel } = await import(
  "../../../../../../apps/riftbound-app/server/ai-opponent"
);
const { buildGameSnapshot } = await import("../../../../../../apps/riftbound-app/server/snapshot");
const { applySessionMove } = await import("../../../../../../apps/riftbound-app/server/turn");
type GameSession = import("../../../../../../apps/riftbound-app/server/state").GameSession;

const GEMCRAFT_SEER = "ogn-100-298";
const SAI_SCOUT = "ogn-174-298";
const MYSTIC_PORO = "ogn-171-298";

const FAST = { backoffMs: 0, lookupTools: [], pacingMs: 0, timeoutMs: 2000 };

/**
 * RB_AI_MOCK is read by the ClaudeOpponent CONSTRUCTOR
 * (`opts.callModel ?? (aiMockEnabled() ? firstLegalCallModel : anthropicCallModel)`), so the flag
 * only has to be live across `new`. `run` sees it set, and the variable is restored afterwards so
 * this file cannot flip the mode for anything else sharing the process.
 */
function underMock<T>(run: () => T): T {
  const previous = process.env.RB_AI_MOCK;
  process.env.RB_AI_MOCK = "1";
  try {
    return run();
  } finally {
    if (previous === undefined) {
      delete process.env.RB_AI_MOCK;
    } else {
      process.env.RB_AI_MOCK = previous;
    }
  }
}

/** A Claude seat with NO api key and NO injected provider — exactly what RB_AI_MOCK=1 must supply. */
function mockOpponent(model: "haiku" | "opus" | "sonnet" = "haiku"): InstanceType<typeof ClaudeOpponent> {
  return underMock(() => new ClaudeOpponent(model, undefined, { ...FAST }));
}

interface Frame { type: string; state?: unknown }

function sessionOf(game: Game, ai?: InstanceType<typeof ClaudeOpponent>): { session: GameSession; frames: Frame[] } {
  const frames: Frame[] = [];
  const session = {
    clients: new Map(),
    engine: game.engine,
    log: [],
    playerNames: { [P1]: "Human", [P2]: "Claude" },
    players: [P1, P2],
    sandbox: true,
    seq: 0,
  } as unknown as GameSession;
  if (ai) {
    (session as { opponent?: unknown }).opponent = ai;
  }
  session.clients.set("human-1", { playerId: P1, ws: { send: (s: string) => frames.push(JSON.parse(s) as Frame) } } as never);
  return { frames, session };
}

/** The Claude seat (P2) with both Vision units in hand and Mystic Poro on top of its Main Deck. */
function board(seed = "vision-privacy") {
  return scenario({ seed })
    .active(P2)
    .resources(P2, { energy: 12, power: { chaos: 2, mind: 2 } })
    .battlefield("bf1", { controller: null })
    .hand(P2, GEMCRAFT_SEER, "seer")
    .hand(P2, SAI_SCOUT, "scout")
    .deckTop(P2, MYSTIC_PORO, "poro");
}

async function drive(session: GameSession, ai: InstanceType<typeof ClaudeOpponent>, rounds = 16): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    if (aiSeatMustAct(session, P2)) {
      await ai.act(session);
      continue;
    }
    const st = session.engine.getState();
    const chain = st.interaction?.chain;
    if (st.status === "playing" && chain?.active && chain.activePlayer === P1) {
      applySessionMove(session, P1, "passChainPriority", { playerId: P1 });
      continue;
    }
    break;
  }
}

const logText = (session: GameSession) => session.log.map((e) => e.text);

describe("RB_AI_MOCK × [Vision] on a Secret Main Deck", () => {
  // -------------------------------------------------------------------------
  // (a) the mock is the live path with a different provider
  // -------------------------------------------------------------------------
  test("(a) RB_AI_MOCK=1 installs firstLegalCallModel through the same constructor branch: no key, no network, and the moves really are applied", async () => {
    expect(underMock(() => aiMockEnabled())).toBe(true);
    expect(aiMockEnabled()).toBe(false); // restored — this file does not leave the flag on
    const game = await board().build();
    const ai = mockOpponent(); // no apiKey, no callModel: RB_AI_MOCK supplies the provider
    const { session } = sessionOf(game, ai);
    await drive(session, ai);

    // For a menu it takes index 0 and says so; for a prompt it takes the first option.
    expect(logText(session).some((t) => /mock: first legal action/u.test(t))).toBe(true);
    expect(logText(session).some((t) => /mock: first option/u.test(t))).toBe(true);
    // applySessionMove really ran: the seat's cards left its hand and its deck was re-ordered.
    expect(game.p2.hand()).not.toContain("seer");
    expect(game.p2.hand()).not.toContain("scout");
    expect(ai.busy).toBe(false);
    expect(ai.thinking).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("(a) firstLegalCallModel answers a MENU with index 0 and the mock rationale — the same tool_use shape the real provider returns", async () => {
    const res = await firstLegalCallModel(
      { max_tokens: 300, menu: undefined, messages: [], meta: { menu: [{ index: 0, label: "End turn" }] }, model: "m", system: "", tools: [] } as never,
      { apiKey: "mock", signal: new AbortController().signal },
    );
    expect(res).toMatchObject({ input: { index: 0, rationale: "mock: first legal action" }, name: "choose" });
  });

  test("(a) determinism — the same seeded game replayed twice yields the same ordered move log and the same 🤖 lines", async () => {
    const run = async () => {
      const game = await board("determinism").build();
      const ai = mockOpponent();
      const { session } = sessionOf(game, ai);
      await drive(session, ai);
      return logText(session);
    };
    const a = await run();
    const b = await run();
    expect(a.length).toBeGreaterThan(3);
    expect(a).toEqual(b);
  });

  test("(a) the mock has NO privileged path: an invalid answer is rejected, re-asked with a NOTE and falls back exactly like a model's", async () => {
    const game = await board("invalid").build();
    const calls: unknown[] = [];
    const ai = underMock(
      () =>
        new ClaudeOpponent("haiku", undefined, {
          ...FAST,
          callModel: async (req) => {
            calls.push(req);
            return { input: { index: 999, rationale: "chaos" }, name: "choose" };
          },
        }),
    );
    const { session } = sessionOf(game, ai);
    await ai.act(session);
    expect(calls).toHaveLength(3); // one try + two retries — the same #validate gate the mock uses
    expect(session.log.some((e) => /fallback/u.test(e.text))).toBe(true);
    expect(ai.thinking).toBe(false);
  });

  // -------------------------------------------------------------------------
  // (b) 424.1.a / 128.3 — a look is not a reveal, and deck order is Secret
  // -------------------------------------------------------------------------
  test("(b) the looked-at Mystic Poro is named to the CLAUDE seat only: its prompt and Decision carry it, the human's description does not", async () => {
    const game = await board().build();
    await game.p2.play("seer");
    await game.settle();
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P2, source: { cardId: "seer" } });
    expect(d.options.map((o) => o.card ?? o.key)).toEqual(["poro"]);

    const { session } = sessionOf(game);
    const prompt = buildPrompt(session, P2, [], "Claude Haiku 4.5");
    expect(`${prompt.system}\n${prompt.user}`).toContain("Mystic Poro"); // the looker may read it
    expect(describeForSeat(session, P1)).not.toContain("Mystic Poro"); // the opponent may not
    expect(describeForSeat(session, P1)).not.toContain(MYSTIC_PORO);
  });

  test("(b) 128.3 — the human's redacted snapshot never carries the identity of a card in the Claude seat's Main Deck", async () => {
    const game = await board().build();
    const ai = mockOpponent();
    const { session } = sessionOf(game, ai); // an opponent is seated ⇒ per-seat redaction is on
    await game.p2.play("seer");
    await game.settle();
    const humanSnapshot = buildGameSnapshot(session, P1) as { zones: Record<string, unknown> };
    expect(JSON.stringify(humanSnapshot.zones)).not.toContain(MYSTIC_PORO);
    expect(JSON.stringify(humanSnapshot.zones.mainDeck ?? [])).not.toContain("Mystic Poro");
    // The Claude seat's own snapshot does carry it — the asymmetry is the point.
    expect(JSON.stringify(buildGameSnapshot(session, P2))).toContain("Mystic Poro");
  });

  test("the 🤖 log line for a private [Vision] look names the ability, not the card, and the broadcast log stays redacted (128.3 / 424.1.a)", async () => {
    // Expected: the human's snapshot log says which ability resolved, never "→ Mystic Poro".
    // Actual: describeAnswer() renders the picked option's label into the shared session log,
    // buildHistoryLog() is not viewer-filtered, and the frame goes out to every client — so the
    // opponent reads the top card of Claude's deck off the game log.
    const game = await board("log-leak").build();
    const ai = mockOpponent();
    const { frames, session } = sessionOf(game, ai);
    await drive(session, ai);

    expect(logText(session).join("\n")).not.toContain("Mystic Poro");
    expect(JSON.stringify(buildGameSnapshot(session, P1))).not.toContain("Mystic Poro");
    expect(JSON.stringify(frames)).not.toContain("Mystic Poro");
  });

  test("(b) 416 — recycling sends the looked-at card to the BOTTOM: the human sees an unchanged deck count and an order it cannot read", async () => {
    const game = await board("recycle").build();
    const beforeCount = game.p2.deck().length;
    await game.p2.play("seer");
    await game.settle();
    await game.p2.pick("poro");
    await game.settle();
    const deck = game.p2.deck();
    expect(deck).toHaveLength(beforeCount);
    expect(deck[0]).not.toBe("poro");
    expect(deck[deck.length - 1]).toBe("poro"); // bottom
    expect(game.p2.hand()).not.toContain("poro"); // looked at, never drawn
  });

  // -------------------------------------------------------------------------
  // (c) empty Main Deck — no unanswerable prompt
  // -------------------------------------------------------------------------
  test("(c) with an EMPTY Main Deck the Vision produces no decision at all: the mock seat neither stalls nor invents a draw or a burnout", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 12, power: { chaos: 2, mind: 2 } })
      .fillDecks(false)
      .deck(P2, [])
      .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298", "ogn-175-298"]) // only P2's deck is empty
      .hand(P2, GEMCRAFT_SEER, "seer")
      .build();
    expect(game.p2.deck()).toHaveLength(0);
    const ai = mockOpponent();
    const { session } = sessionOf(game, ai);
    await drive(session, ai);

    expect(game.zoneOf("seer")).toBe("base");
    expect(game.p2.deck()).toHaveLength(0); // no draw was invented
    expect(game.p2.hand()).toHaveLength(0);
    expect(game.isOver()).toBe(false); // no burnout
    expect(logText(session).some((t) => /has no legal action — waiting/u.test(t))).toBe(false);
    expect(ai.thinking).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // (d) 817.2 / 383.3 — printed and granted Vision are the same ability
  // -------------------------------------------------------------------------
  test("(d) 817.2 / 383.3 — with the Seer out, Sai Scout's PRINTED and GRANTED Vision are two chain items that resolve one after the other with identical Decision shapes", async () => {
    const game = await board("granted").build();
    await game.p2.play("seer");
    await game.settle();
    await game.p2.decline(); // leave the Poro on top so both later looks see the same card
    await game.settle();
    expect(game.state("scout").keywords).toContain("Vision"); // "Other friendly units have [Vision]"

    await game.p2.play("scout");
    const chain = game.chain();
    expect(chain).toHaveLength(2);
    expect(chain.every((c) => c.cardId === "scout" && c.triggered && c.controller === P2)).toBe(true);

    const shapes: PickDecision[] = [];
    for (let i = 0; i < 2; i++) {
      await game.settle();
      const d = game.decision() as PickDecision;
      expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P2, source: { cardId: "scout" } });
      shapes.push(d);
      await game.p2.decline(); // answered separately, one per instance
    }
    await game.settle();
    expect(shapes[0]?.prompt).toBe(shapes[1]?.prompt);
    expect(shapes[0]?.options.map((o) => o.card)).toEqual(shapes[1]?.options.map((o) => o.card));
    expect(game.p2.deck()[0]).toBe("poro"); // both declined
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });
});
