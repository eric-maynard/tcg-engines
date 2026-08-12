/**
 * Interaction: the Claude seat's own discard, and the yes-no opt-in it creates.
 *
 *   Jinx, Demolitionist (ogn-030-298) · Unit 3 [fury] · 4 [Might]
 *     "[Accelerate] … [Assault 2] … When you play me, discard 2."
 *   Flame Chompers (ogn-006-298) · Unit 3 · 3 [Might]
 *     "When you discard me, you may pay [fury] to play me."
 *
 * Rules: 356.2.b / 356.2.b.1 (paying a cost you cannot pay is not a legal choice) ·
 * 383.3.a / 383.3.a.2 (a leading "you may" on a triggered ability is decided when the item
 * is finalized; declined ⇒ the item is removed from the chain, nothing happens) ·
 * 358.5 (an abandoned choice is abandoned as a whole — nothing half-performed) ·
 * 128.4 (a player may look at their own hand; the opponent may not) ·
 * 128.5 (the trash is a public zone).
 *
 * Q: The Claude seat plays Jinx and holds Flame Chompers.
 *   (a) Is the discard prompt surfaced only to the Claude seat, with the human's snapshot
 *       showing Claude's hand as opaque entries — and do the discarded cards become fully
 *       identified for the human once they sit in the trash?
 *   (b) With a [fury] pip spare, does `answer.accept:true` work and is the pip charged?
 *       With none, does the Decision carry canAccept:false and the prompt say so?
 *   (c) If the model insists on accept:true anyway, is it refused before any engine call,
 *       re-asked with a NOTE, and after three invalid answers resolved by the Goldfish
 *       fallback (decline) so the chain clears and the turn continues?
 *   (d) Does each applied step push a per-seat state frame and a 🤖 log line?
 */
import { afterEach, describe, expect, test } from "bun:test";
import type { ServerWebSocket } from "bun";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";
import {
  type CallModel,
  type ModelRequest,
  ClaudeOpponent,
  buildPrompt,
  goldfishFallbackMove,
} from "../../../../../../apps/riftbound-app/server/ai-opponent";
import { buildGameSnapshot } from "../../../../../../apps/riftbound-app/server/snapshot";
import type { GameSession, WsData } from "../../../../../../apps/riftbound-app/server/state";

const JINX = "ogn-030-298";
const CHOMPERS = "ogn-006-298";
const LABEL = "Claude Sonnet 5";
const FAST = { backoffMs: 0, pacingMs: 0, timeoutMs: 2000 };

/** P2 (the Claude seat) is on turn with Jinx + Chompers + two fillers in hand. */
function board(fury: number) {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 3, power: { fury } })
    .hand(P2, JINX, "jinx")
    .hand(P2, CHOMPERS, "chompers")
    .hand(P2, { cardType: "unit", energyCost: 1, might: 1, name: "Filler Poro" }, "poro")
    .hand(P2, { cardType: "unit", energyCost: 1, might: 1, name: "Filler Yak" }, "yak")
    .hand(P1, "ogn-004-298", "humanCleave");
}

interface Frame { type: string; state?: { zones: Record<string, { id: string; definitionId: string; name: string; owner: string }[]> } }

function sessionFor(game: Game): { session: GameSession; frames: Record<string, Frame[]> } {
  const frames: Record<string, Frame[]> = { [P1]: [], [P2]: [] };
  const session: GameSession = {
    clients: new Map(),
    engine: game.engine as GameSession["engine"],
    log: [],
    playerNames: { [P1]: "Human", [P2]: "Claude" },
    players: [P1, P2],
    sandbox: true,
    seq: 0,
  };
  session.opponent = { info: { kind: "claude", label: LABEL, model: "sonnet" }, thinking: false } as unknown as GameSession["opponent"];
  for (const seat of [P1, P2]) {
    const ws = {
      close: () => undefined,
      data: { connId: `c-${seat}`, gameId: "g", playerId: seat },
      send: (s: string) => { (frames[seat] as Frame[]).push(JSON.parse(s) as Frame); },
    } as unknown as ServerWebSocket<WsData>;
    session.clients.set(`c-${seat}`, { playerId: seat, ws });
  }
  return { frames, session };
}

/** Play Jinx and resolve it, stopping on Claude's own "discard 2" prompt. */
async function atTheDiscard(fury: number): Promise<{ game: Game; session: GameSession; frames: Record<string, Frame[]> }> {
  const game = await board(fury).build();
  const { frames, session } = sessionFor(game);
  await game.p2.play("jinx");
  await game.p2.passPriority();
  await game.p1.passPriority();
  return { frames, game, session };
}

/** A model that answers `answer` prompts with `input` and always ends the turn on a menu. */
function modelThatAnswers(input: Record<string, unknown>) {
  const calls: ModelRequest[] = [];
  const callModel: CallModel = async (req) => {
    calls.push(req);
    const menu = req.meta.menu;
    if (menu) {
      const end = menu.find((i) => /End turn/i.test(i.label)) ?? menu[menu.length - 1];
      return { input: { index: end?.index ?? 0, rationale: "wrap up" }, name: "choose" };
    }
    return { input: { ...input, rationale: "take the Chompers line" }, name: "answer" };
  };
  return { callModel, calls };
}

const opponents: ClaudeOpponent[] = [];
afterEach(() => {
  opponents.splice(0);
});

function claude(callModel: CallModel): ClaudeOpponent {
  const ai = new ClaudeOpponent("sonnet", "sk-ant-api03-testtesttest", { ...FAST, callModel });
  opponents.push(ai);
  return ai;
}

const handOf = (session: GameSession, viewer: string, owner: string) =>
  (buildGameSnapshot(session, viewer).zones as Record<string, { id: string; definitionId: string; name: string; owner: string }[]>).hand
    ?.filter((c) => c.owner === owner) ?? [];

describe("(a) the discard is Claude's own decision, and only the trash is public", () => {
  test("buildPrompt renders the pick for the Claude seat, naming ITS hand cards (128.4)", async () => {
    const { session } = await atTheDiscard(1);
    const prompt = buildPrompt(session, P2, [], LABEL);
    expect(prompt.toolName).toBe("answer");
    expect(prompt.decision).toMatchObject({ kind: "pick", max: 2, seat: P2 });
    expect((prompt.decision as unknown as { options: { key: string }[] }).options.map((o) => o.key).sort()).toEqual(["chompers", "poro", "yak"]);
    expect(prompt.user).toContain("Pick 2 revealed cards to discard");
    expect(prompt.user).toContain("Flame Chompers");
  });

  test("the human's snapshot of the SAME position maps Claude's hand to opaque entries with no definition id", async () => {
    const { session } = await atTheDiscard(1);
    const seen = handOf(session, P1, P2);
    expect(seen).toHaveLength(3);
    for (const [i, c] of seen.entries()) {
      expect(c).toMatchObject({ definitionId: "", id: `hidden-hand-player-2-${i}`, name: "Hidden card" });
    }
    const wire = JSON.stringify(buildGameSnapshot(session, P1).zones.hand);
    expect(wire).not.toContain(CHOMPERS);
    expect(wire).not.toContain("Flame Chompers");
    // …while Claude's own view of its own hand is unredacted.
    expect(handOf(session, P2, P2).map((c) => c.definitionId)).toContain(CHOMPERS);
  });

  test("once discarded the two cards are in the trash, a PUBLIC zone (128.5) — the human's snapshot names them", async () => {
    const { game, session } = await atTheDiscard(1);
    await game.p2.pick("chompers", "poro");
    const trash = (buildGameSnapshot(session, P1).zones as Record<string, { id: string; name: string; definitionId: string }[]>).trash ?? [];
    expect(trash.map((c) => c.id).sort()).toEqual(["chompers", "poro"]);
    expect(trash.find((c) => c.id === "chompers")).toMatchObject({ definitionId: CHOMPERS, name: "Flame Chompers" });
    // The identities became known by a game action, not by a leak: the rest of the hand is still opaque.
    expect(handOf(session, P1, P2).every((c) => c.definitionId === "")).toBe(true);
  });
});

describe("(b) the Chompers opt-in: payable vs unpayable", () => {
  test("with a [fury] spare the prompt is answerable, accept:true plays it from the trash and the pip is charged (383.3.a / 356.2.b)", async () => {
    const { frames, game, session } = await atTheDiscard(2);
    await game.p2.pick("chompers", "poro");
    expect(game.p2.power("fury")).toBe(1);
    expect(buildPrompt(session, P2, [], LABEL).decision).toMatchObject({ canAccept: true, kind: "yes-no" });

    const { callModel } = modelThatAnswers({ accept: true });
    await claude(callModel).act(session);
    expect(game.p2.power("fury")).toBe(0); // the [fury] is charged as the item is finalized (383.3.b)
    expect(game.chain()).toMatchObject([{ cardId: "chompers", triggered: true }]);
    await game.settle(); // the human passes priority and the trigger resolves

    expect(game.zoneOf("chompers")).toBe("base"); // played from the trash
    expect(session.log.some((l) => /^🤖 /.test(l.text))).toBe(true);
    expect((frames[P2] ?? []).some((f) => f.type === "state_update")).toBe(true);
  });

  test("with NO [fury] the Decision carries canAccept:false and the prompt tells the model to answer false (356.2.b.1)", async () => {
    const { game, session } = await atTheDiscard(1);
    await game.p2.pick("chompers", "poro");
    expect(game.p2.power("fury")).toBe(0); // Jinx ate the only pip

    const prompt = buildPrompt(session, P2, [], LABEL);
    expect(prompt.decision).toMatchObject({ canAccept: false, kind: "yes-no" });
    expect(prompt.user).toContain("accepting is NOT currently possible, answer false");
  });

  test("answering false declines: the trigger is removed with nothing performed and Chompers stays in the trash (383.3.a.2)", async () => {
    const { game, session } = await atTheDiscard(1);
    await game.p2.pick("chompers", "poro");
    const { callModel } = modelThatAnswers({ accept: false });
    await claude(callModel).act(session);

    expect(game.zoneOf("chompers")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.gameState.pendingChoice ?? null).toBeNull();
    expect(game.violations()).toEqual([]);
  });
});

describe("(c) accept:true when accepting is impossible", () => {
  test("it is refused before any engine call, re-asked with a NOTE, and after three invalid answers the Goldfish fallback declines for the seat", async () => {
    const { game, session } = await atTheDiscard(1);
    await game.p2.pick("chompers", "poro");
    const zonesBefore = { chompers: game.zoneOf("chompers"), jinx: game.zoneOf("jinx"), yak: game.zoneOf("yak") };
    const energyBefore = game.p2.energy();
    const furyBefore = game.p2.power("fury");

    // The seat's only legal answer IS the decline — that is what the fallback picks.
    expect(goldfishFallbackMove(session, P2)).toMatchObject({
      moveId: "resolvePendingChoice",
      params: { accept: false, playerId: P2 },
    });

    const { callModel, calls } = modelThatAnswers({ accept: true });
    await claude(callModel).act(session);

    const answerCalls = calls.filter((c) => !c.meta.menu);
    expect(answerCalls).toHaveLength(3); // 3 attempts, then the fallback
    expect(answerCalls[1]?.messages.map((m) => JSON.stringify(m.content)).join("\n")).toContain(
      "accepting is not possible right now",
    );
    expect(answerCalls[2]?.messages.map((m) => JSON.stringify(m.content)).join("\n")).toContain("NOTE:");

    // Nothing was half-performed by the three rejected answers (358.5) …
    expect(game.p2.energy()).toBe(energyBefore);
    expect(game.p2.power("fury")).toBe(furyBefore);
    expect(game.zoneOf("jinx")).toBe(zonesBefore.jinx);
    expect(game.zoneOf("yak")).toBe(zonesBefore.yak);
    // … and the prompt was resolved by the decline, so the chain drained and the turn moved on.
    expect(game.zoneOf("chompers")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.gameState.pendingChoice ?? null).toBeNull();
    expect(session.log.some((l) => /\(fallback\)/.test(l.text))).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});

describe("(d) one frame and one log line per applied step", () => {
  test("every applied step sends each client a state_update built from THAT client's seat, and logs a 🤖 line", async () => {
    const { frames, game, session } = await atTheDiscard(2);
    await game.p2.pick("chompers", "poro");
    const { callModel } = modelThatAnswers({ accept: true });
    await claude(callModel).act(session);

    const p1Frames = (frames[P1] ?? []).filter((f) => f.type === "state_update");
    const p2Frames = (frames[P2] ?? []).filter((f) => f.type === "state_update");
    expect(p1Frames.length).toBeGreaterThan(0);
    expect(p1Frames.length).toBe(p2Frames.length); // one per applied step, per client

    // The human's frames keep Claude's hand opaque; Claude's own frames name its cards.
    const humanSeesClaudeHand = (p1Frames.at(-1)?.state?.zones.hand ?? []).filter((c) => c.owner === P2);
    expect(humanSeesClaudeHand.every((c) => c.definitionId === "" && c.name === "Hidden card")).toBe(true);
    const claudeSeesOwnHand = (p2Frames.at(-1)?.state?.zones.hand ?? []).filter((c) => c.owner === P2);
    expect(claudeSeesOwnHand.every((c) => c.definitionId !== "")).toBe(true);

    const aiLines = session.log.filter((l) => /^🤖 /.test(l.text));
    expect(aiLines.length).toBeGreaterThan(0);
    expect(aiLines[0]?.text).toMatch(/^🤖 [^:]+: .+/);
  });
});
