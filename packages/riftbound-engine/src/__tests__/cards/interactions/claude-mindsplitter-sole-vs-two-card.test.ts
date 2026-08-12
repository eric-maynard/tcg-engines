/**
 * Interaction: the vs-Claude seat resolving Mindsplitter — which choices are worth a model call, and
 * who may see the revealed hand.
 *
 *   Mindsplitter (ogn-192-298) · Unit · Chaos · 7 + [chaos][chaos] · 7 Might —
 *     "When you play me, choose an opponent. They reveal their hand. Choose a card from it, and
 *      they discard that card."
 *   Hidden Blade (ogn-213-298) · Spell · Order — the human's hand card (and the one discarded)
 *   Stacked Deck (ogn-183-298) · Spell · Chaos — the human's second hand card
 *   (Claude's own "Claude Reserve" hand card and "Claude Secret" facedown are inline vanillas, so a
 *    name found in a prompt can only have come from the human's side.)
 *
 * Question: Claude plays Mindsplitter. (a) In a duel there is exactly one opponent — is that choice
 * answered without a model call? (b) With exactly ONE card in the human's hand the follow-up pick is
 * sole-option and must also resolve with no model call; with TWO cards the pick DOES reach the model
 * and Claude's prompt legitimately names both — the reveal made them public for this resolution —
 * while the human's own snapshot for the same seq still shows Claude's hand and facedown as opaque.
 * Which of those two facts would a naive implementation get backwards? (c) When the resolution
 * finishes, does the revealed state lapse — is the un-discarded card Private again in Claude's NEXT
 * prompt, and is nothing retained about it beyond the card actually discarded (now public in the
 * trash)?
 *
 * Expected: (a) the sole opponent is bound by the engine itself, so no Decision is ever raised for it
 * and no ModelRequest is built. (b) `forcedChoice()` answers any pick with exactly one option,
 * min >= 1 and allowDecline false locally — it derives the Decision, resolves the answer and applies
 * the move with a "… (forced)" label, no ModelRequest, no pacing sleep and no rationale; so with one
 * card in hand the model is never shown the hand at all. Reveal is a Limited Action performed because
 * a game effect instructed it (424.2.a) and the revealed hand is public for the duration of that
 * resolution (424.1.a.3), so with two cards it is CORRECT for both names to appear in Claude's prompt
 * and option labels — that is not a redaction failure. The mirror image is: the human's own snapshot
 * during Claude's turn must stay redacted (128.4), and `buildGameSnapshot(session, humanSeat)` and
 * `observe(engine, humanSeat)` must agree on that. (c) After resolution the Revealed state ends: the
 * undiscarded card is Private again and Claude's next prompt renders the human's hand as a COUNT,
 * while the discarded card is nameable only because the trash is public (128.5). The 🤖 log line
 * names the discarded card and nothing else.
 *
 * Rules: 424.1.a.3 (revealed for the duration of the resolution), 424.2.a (a reveal instructed by a
 * game effect), 424.2.b (voluntarily showing private information — an affordance the app does not
 * have), 128.4 (hands are private), 128.5 (the trash is public), 358.5 (an illegal action rolls back).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";
import type { CallModel, ModelRequest } from "../../../../../../apps/riftbound-app/server/ai-opponent";
import { ClaudeOpponent, aiSeatMustAct } from "../../../../../../apps/riftbound-app/server/ai-opponent";
import { buildGameSnapshot } from "../../../../../../apps/riftbound-app/server/snapshot";
import type { GameSession } from "../../../../../../apps/riftbound-app/server/state";
import { applySessionMove } from "../../../../../../apps/riftbound-app/server/turn";

const MINDSPLITTER = "ogn-192-298";
const HIDDEN_BLADE = "ogn-213-298";
const STACKED_DECK = "ogn-183-298";
/** Claude's own private cards, named so that any leak is unambiguous. */
const CLAUDE_FACEDOWN = { cardType: "spell", energyCost: 1, name: "Claude Secret" };
const CLAUDE_HAND = { cardType: "spell", energyCost: 1, name: "Claude Reserve" };

interface Run {
  readonly calls: readonly ModelRequest[];
  readonly game: Game;
  readonly session: GameSession;
  /** The human's own snapshot, captured at the seq of each decision the model was asked about. */
  readonly humanSnapshotAtDecision: readonly string[];
  /** system + text messages of one request. */
  text(request: ModelRequest | undefined): string;
}

/**
 * Claude (player-2) is the turn player with Mindsplitter in hand, one more hand card and a facedown
 * of its own; the human (player-1) holds Hidden Blade, plus Stacked Deck when `handTwo`.
 * The recorder plays Mindsplitter, answers any decision it is shown, then ends the turn.
 */
async function playMindsplitter(handTwo: boolean): Promise<Run> {
  let builder = scenario()
    .turn(2)
    .active(P2)
    .resources(P2, { energy: 7, power: { chaos: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Claude Body" }, "cbody")
    .facedown(P2, "bf1", CLAUDE_FACEDOWN, "cSecret")
    .hand(P2, MINDSPLITTER, "ms")
    .hand(P2, CLAUDE_HAND, "cReserve")
    .hand(P1, HIDDEN_BLADE, "hBlade");
  if (handTwo) {
    builder = builder.hand(P1, STACKED_DECK, "hDeck");
  }
  const game = await builder.build();

  const calls: ModelRequest[] = [];
  const humanSnapshotAtDecision: string[] = [];
  let session: GameSession;
  const callModel: CallModel = async (request) => {
    calls.push(request);
    if (request.meta.decision) {
      humanSnapshotAtDecision.push(JSON.stringify(buildGameSnapshot(session, P1)));
      const first = [...(request.meta.keyAliases ?? [])][0]?.[0] ?? "1";
      return { input: { keys: [first], rationale: "discard the Blade" }, name: "answer" };
    }
    const hit = request.meta.menu?.find((it) => /Mindsplitter/.test(it.label)) ?? request.meta.menu?.find((it) => /End turn/.test(it.label));
    return { input: { index: hit?.index ?? 1, rationale: "develop" }, name: "choose" };
  };
  const ai = new ClaudeOpponent("haiku", "sk-ant-api03-testkeytestkey", { backoffMs: 0, callModel, lookupTools: [], pacingMs: 0, timeoutMs: 2000 });
  session = {
    clients: new Map(),
    engine: game.engine as unknown as GameSession["engine"],
    log: [],
    opponent: ai,
    players: [P1, P2],
    playerNames: { [P1]: "Human", [P2]: "Claude" },
    sandbox: true,
    seq: 0,
  } as GameSession;

  // Let the AI act; pass priority for the human whenever they merely hold it over Claude's chain.
  for (let i = 0; i < 12; i++) {
    if (aiSeatMustAct(session, P2)) {
      await ai.act(session);
      continue;
    }
    const state = session.engine.getState();
    const chain = state.interaction?.chain;
    if (state.status === "playing" && chain?.active && chain.activePlayer === P1) {
      applySessionMove(session, P1, "passChainPriority", { playerId: P1 });
      continue;
    }
    break;
  }
  const text = (request: ModelRequest | undefined) =>
    `${request?.system}\n${request?.messages.map((m) => (typeof m.content === "string" ? m.content : "")).join("\n")}`;
  return { calls, game, humanSnapshotAtDecision, session, text };
}

describe("Claude's seat resolving Mindsplitter — sole-option vs a real choice", () => {
  test("(a)+(b) ONE card in the human's hand: neither 'choose an opponent' nor the discard pick costs a model call — no ModelRequest carries a decision, and the log line reads '(forced)' with no rationale", async () => {
    const run = await playMindsplitter(false);
    expect(run.game.zoneOf("hBlade")).toBe("trash");
    expect(run.calls.filter((c) => c.meta.decision)).toEqual([]); // forcedChoice answered locally
    expect(run.humanSnapshotAtDecision).toEqual([]);
    const forced = run.session.log.map((e) => e.text).find((t) => /Pick a revealed card to discard/.test(t));
    expect(forced).toContain("(forced)");
    expect(forced).not.toContain("'"); // no rationale is logged for a locally-answered choice
    // "choose an opponent" never became a Decision at all in a duel — the sole opponent is bound.
    expect(run.session.log.some((e) => /opponent/i.test(e.text))).toBe(false);
  });

  test("(b) ONE card: the human's hand is never shown to the model — no prompt before the discard names it, and the count is all Claude gets (128.4)", async () => {
    const run = await playMindsplitter(false);
    const beforeDiscard = run.calls.slice(0, 2).map((c) => run.text(c));
    for (const body of beforeDiscard) {
      expect(body).not.toContain("Hidden Blade");
      expect(body).toMatch(/hand 1/);
    }
  });

  test("(b) TWO cards: the pick DOES reach the model and both revealed names appear in its prompt and option labels — correct, not a leak (424.1.a.3 / 424.2.a)", async () => {
    const run = await playMindsplitter(true);
    const decisionCalls = run.calls.filter((c) => c.meta.decision);
    expect(decisionCalls).toHaveLength(1);
    const decision = decisionCalls[0]?.meta.decision;
    expect(decision).toMatchObject({ kind: "pick", max: 1, min: 1 });
    const labels = (decision as { options?: { label: string }[] } | undefined)?.options?.map((o) => o.label) ?? [];
    expect(labels.join(" ")).toContain("Hidden Blade");
    expect(labels.join(" ")).toContain("Stacked Deck");
    expect(run.text(decisionCalls[0])).toContain("Hidden Blade");
    expect(run.game.zoneOf("hBlade")).toBe("trash");
    expect(run.game.zoneOf("hDeck")).toBe("hand");
  });

  test("(b) the mirror image a naive implementation gets backwards: at that same seq the HUMAN's snapshot still hides Claude's hand and facedown, and observe() agrees with it (128.4)", async () => {
    const run = await playMindsplitter(true);
    const snapshot = run.humanSnapshotAtDecision[0] as string;
    expect(snapshot).toBeDefined();
    expect(snapshot).not.toContain("Claude Reserve"); // Claude's hand card
    expect(snapshot).not.toContain("Claude Secret"); // Claude's facedown
    expect(snapshot).toContain("Hidden card"); // opaque stand-ins instead

    type ZoneCard = { definitionId: string; name: string; owner: string };
    const zones = (JSON.parse(snapshot) as { zones: Record<string, ZoneCard[]> }).zones;
    for (const card of (zones.hand ?? []).filter((c) => c.owner === P2)) {
      expect(card).toMatchObject({ definitionId: "", name: "Hidden card" });
    }
    expect(zones["facedown-bf1"]).toEqual([expect.objectContaining({ definitionId: "", name: "Hidden card", owner: P2 })]);

    // The harness observation of the same seat agrees — redaction lives in the frame, not the client.
    type ViewCard = { hidden?: boolean; defId?: string };
    const view = (run.game.view(P1) as unknown as { zones: Record<string, ViewCard[]> }).zones;
    expect(view["facedown-bf1"]).toEqual([expect.objectContaining({ hidden: true })]);
    expect((view.hand ?? []).some((c) => c.hidden === true)).toBe(true);
    expect(JSON.stringify(view)).not.toContain("Claude Reserve");
  });

  test("(c) the reveal LAPSES: Claude's next prompt shows the human's remaining hand as a count only, never as Stacked Deck — while the discarded Hidden Blade is nameable purely because the trash is public (128.5)", async () => {
    const run = await playMindsplitter(true);
    const afterResolution = run.text(run.calls.at(-1));
    expect(afterResolution).not.toContain("Stacked Deck"); // Private again
    expect(afterResolution).toMatch(/hand 1/); // a count, not contents
    expect(afterResolution).toContain("Hidden Blade"); // in the public trash

    const log = run.session.log.map((e) => e.text).join("\n");
    expect(log).toContain("Hidden Blade");
    expect(log).not.toContain("Stacked Deck"); // nothing about the un-discarded card is retained
    expect(run.game.violations()).toEqual([]);
  });
});
