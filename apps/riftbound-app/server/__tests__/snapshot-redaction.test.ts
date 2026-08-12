/**
 * Per-seat redaction of the UI snapshot: Hidden (facedown) cards, deck ORDER,
 * and the shared match log.
 *
 * rule 723 / 127 — a facedown card is private to its owner: the opponent's
 * snapshot must carry only an opaque stand-in (no definition id, no name, no
 * instance id that embeds the definition) in EVERY redacted mode (a real duel,
 * not just vs-Claude). rule 127 information effects (unl-053-219 Scuttle Crab:
 * "You can look at their facedown cards this turn") un-redact it for the
 * granted seat only; rule 421.4 — once the game ends facedown cards are public.
 *
 * rule 108.4.d / 128.3 — a deck's ORDER is Secret to EVERY player, its owner
 * included, so a seat-scoped frame ships that seat its OWN Main/Rune Deck as
 * faceless entries too: a count, never a sequence.
 *
 * rule 128.3 / 424.1.a / 486.5 — and the same discipline on `session.log`,
 * which is ONE stream rendered into every seat's snapshot: a line that names
 * something only one seat may know is withheld (or shown in a public wording)
 * for every other viewer.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "@tcg/riftbound/harness";
import type { GameSession } from "../state";
import { buildGameSnapshot } from "../snapshot";
import { ClaudeOpponent, aiSeatMustAct, publicActionLine, runOpponent } from "../ai-opponent";
import { applySessionMove, sandboxAutoPlay } from "../turn";
import { getInternalSnapshot } from "../state";
import { registry } from "../cards";

const CONSULT_THE_PAST = "ogn-083-298";
const SCUTTLE_CRAB = "unl-053-219";

function sessionOf(engine: unknown, sandbox: boolean): GameSession {
  return {
    clients: new Map(),
    engine: engine as GameSession["engine"],
    log: [],
    playerNames: { [P1]: "Alice", [P2]: "Bob" },
    players: [P1, P2],
    sandbox,
    seq: 0,
  };
}

type ZoneCard = { id: string; definitionId: string; name: string; owner: string; cardType: string };

function facedownAt(session: GameSession, viewer: string | undefined, bf: string): ZoneCard[] {
  const snap = buildGameSnapshot(session, viewer);
  return ((snap.zones as Record<string, ZoneCard[]>)[`facedown-${bf}`] ?? []);
}

function board() {
  return scenario()
    .turn(3)
    .active(P1)
    .victoryScore(15)
    .resources(P1, { energy: 5 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "P1 Holder" }, "h1")
    .unit(P2, "bf2", { might: 3, name: "Defender D" }, "d")
    .facedown(P2, "bf2", CONSULT_THE_PAST, "ctp");
}

describe("snapshot redaction — facedown cards are per-seat", () => {
  test("duel: the owner sees the real card; the opponent's snapshot carries only an opaque token (no def id / name / instance id)", async () => {
    const game = await board().build();
    const duel = sessionOf(game.engine, false);

    const owner = facedownAt(duel, P2, "bf2");
    expect(owner).toHaveLength(1);
    expect(owner[0]).toMatchObject({ definitionId: CONSULT_THE_PAST, id: "ctp", owner: P2 });

    const opp = facedownAt(duel, P1, "bf2");
    expect(opp).toHaveLength(1); // the SLOT is public (rule 723: everyone sees a card was hidden there)
    expect(opp[0]).toMatchObject({ cardType: "unknown", definitionId: "", name: "Hidden card", owner: P2 });
    expect(opp[0]?.id.startsWith("hidden-facedown-bf2-")).toBe(true);
    const wire = JSON.stringify(buildGameSnapshot(duel, P1).zones);
    expect(wire).not.toContain(CONSULT_THE_PAST);
    expect(wire).not.toContain("Consult the Past");
    expect(wire).not.toContain('"ctp"');
  });

  test("vs-Claude (sandbox plumbing, real opponent): same redaction for the human seat", async () => {
    const game = await board().build();
    const vsAi = sessionOf(game.engine, true);
    vsAi.opponent = { info: { kind: "claude", label: "Claude", model: "haiku" }, thinking: false } as unknown as GameSession["opponent"];
    expect(facedownAt(vsAi, P1, "bf2")[0]).toMatchObject({ definitionId: "", name: "Hidden card" });
    expect(facedownAt(vsAi, P2, "bf2")[0]).toMatchObject({ definitionId: CONSULT_THE_PAST });
  });

  test("goldfish sandbox (one human drives both seats): nothing is redacted", async () => {
    const game = await board().build();
    const goldfish = sessionOf(game.engine, true);
    expect(facedownAt(goldfish, P1, "bf2")[0]).toMatchObject({ definitionId: CONSULT_THE_PAST, id: "ctp" });
  });

  test("rule 127 look grant (Scuttle Crab's Deathknell): the granted seat's snapshot names the facedown card; the grant is turn-scoped", async () => {
    const game = await board().unit(P1, "base", SCUTTLE_CRAB, "crab").build();
    const duel = sessionOf(game.engine, false);
    expect(facedownAt(duel, P1, "bf2")[0]).toMatchObject({ definitionId: "" });

    await game.p1.move("crab", "bf2"); // attacks alone into Defender D (3) and dies → Deathknell
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.zoneOf("crab")).toBe("trash");
    expect(game.gameState.visibilityGrants).toEqual([{ duration: "turn", owner: P2, viewer: P1, zones: ["facedown"] }]);

    expect(facedownAt(duel, P1, "bf2")[0]).toMatchObject({ definitionId: CONSULT_THE_PAST, id: "ctp", owner: P2 });
    // Still P2's hidden card — the grant is a LOOK, not a reveal: P2's own view is unchanged.
    expect(facedownAt(duel, P2, "bf2")[0]).toMatchObject({ definitionId: CONSULT_THE_PAST });

    // Next turn the grant expires and P1 is back to the opaque token.
    await game.p1.endTurn();
    await game.settle();
    expect(game.gameState.visibilityGrants ?? []).toEqual([]);
    expect(facedownAt(duel, P1, "bf2")[0]).toMatchObject({ definitionId: "", name: "Hidden card" });
  });

  test("the harness player view agrees with the snapshot: opponent seat sees an opaque entry, owner seat sees the card", async () => {
    const game = await board().build();
    const duel = sessionOf(game.engine, false);
    type ViewCard = { defId?: string; hidden?: boolean; id?: string };
    const viewFacedown = (seat: string): ViewCard[] =>
      ((game.view(seat) as unknown as { zones: Record<string, ViewCard[]> }).zones["facedown-bf2"] ?? []);

    expect(viewFacedown(P1)).toEqual([expect.objectContaining({ hidden: true })]);
    expect(viewFacedown(P1)[0]?.defId).toBeUndefined();
    expect(facedownAt(duel, P1, "bf2")[0]?.definitionId).toBe("");

    expect(viewFacedown(P2)[0]).toMatchObject({ defId: CONSULT_THE_PAST, id: "ctp" });
    expect(facedownAt(duel, P2, "bf2")[0]).toMatchObject({ definitionId: CONSULT_THE_PAST, id: "ctp" });
  });

  // rule 421.4 — when the game ends, facedown cards are revealed to all players.
  test("rule 421.4: once the game is finished the opponent's facedown card is no longer redacted", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .victoryScore(1)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 2, name: "P1 Holder" }, "h1")
      .unit(P2, "bf2", { might: 3, name: "Defender D" }, "d")
      .facedown(P2, "bf2", CONSULT_THE_PAST, "ctp")
      .build();
    const duel = sessionOf(game.engine, false);
    expect(facedownAt(duel, P1, "bf2")[0]).toMatchObject({ definitionId: "", name: "Hidden card" });

    await game.p1.endTurn();
    await game.settle();
    expect(game.gameState.status).toBe("finished");

    expect(facedownAt(duel, P1, "bf2")[0]).toMatchObject({ definitionId: CONSULT_THE_PAST, id: "ctp", owner: P2 });
    // The reveal is scoped to facedown cards — hands stay private after the game ends.
    const hands = (buildGameSnapshot(duel, P1).zones as Record<string, ZoneCard[]>)["hand"] ?? [];
    for (const c of hands.filter((c) => c.owner === P2)) {
      expect(c).toMatchObject({ definitionId: "", name: "Hidden card" });
    }
  });
});

/**
 * The broadcast that carries the Goldfish's auto-play used to reuse ONE
 * seat-less snapshot for every client. A seat-less snapshot is the unredacted
 * shape (`redactFor` needs a viewer), so the shape is only safe where nothing
 * is redacted at all — and the same seat-less build is what made
 * `reachablePlays` come back empty, leaving the human's hand inert at the start
 * of every Main Phase. It now builds per seat, like every other broadcaster.
 *
 * Two properties keep that from ever having been a leak, and both are pinned
 * here because the frame is pushed to every connected client:
 *  - the driver only runs in a PASSIVE-Goldfish sandbox, the one mode where
 *    redaction is off for every viewer anyway (`buildGameSnapshot`'s
 *    `redactFor`), and
 *  - `runOpponent` refuses to reach it in the redacted modes (vs-Claude and
 *    hot seat), so no redacted session ever receives a seat-less frame.
 */
describe("Goldfish auto-play broadcast — per-seat frames, and never one in a redacted mode", () => {
  function clientOf(session: GameSession, seat: string) {
    const frames: { type: string; state: { zones: Record<string, ZoneCard[]> } }[] = [];
    session.clients.set(`c-${seat}`, {
      playerId: seat,
      ws: { send: (raw: string) => frames.push(JSON.parse(raw) as never) },
    } as unknown as Parameters<GameSession["clients"]["set"]>[1]);
    return frames;
  }

  test("passive goldfish: each client's frame carries exactly what that seat's own snapshot would — no extra card identity rides along", async () => {
    const game = await scenario()
      .turn(4)
      .active(P2)
      .resources(P1, { energy: 0 })
      .battlefield("bf2", { controller: P2 })
      .facedown(P2, "bf2", CONSULT_THE_PAST, "ctp")
      .rune(P1, "fury", { alias: "r1" })
      .build();
    const session = sessionOf(game.engine, true);
    const frames = clientOf(session, P1);

    sandboxAutoPlay(session, P2);

    const last = frames.at(-1);
    expect(last?.type).toBe("state_update");
    expect(JSON.stringify(last?.state.zones)).toBe(JSON.stringify(buildGameSnapshot(session, P1).zones));
  });

  test("the redacted modes never get one: runOpponent stops before the driver in hot seat and vs-Claude", async () => {
    const game = await board().build();

    const hotSeat = sessionOf(game.engine, true);
    hotSeat.hotSeat = true;
    const hotFrames = clientOf(hotSeat, P1);
    runOpponent(hotSeat, { humanSeat: P1 });
    expect(hotFrames).toEqual([]);

    const vsAi = sessionOf(game.engine, true);
    // The Claude driver is async and pushes its own PER-SEAT frames (ai-opponent
    // `#push`); what must never happen is the seat-less goldfish broadcast, so
    // stub `act` to a no-op and assert the driver was never reached.
    vsAi.opponent = {
      act: () => Promise.resolve(),
      info: { kind: "claude", label: "Claude", model: "haiku" },
      thinking: false,
    } as unknown as GameSession["opponent"];
    const aiFrames = clientOf(vsAi, P1);
    runOpponent(vsAi, { humanSeat: P1 });
    expect(aiFrames.filter((f) => (f as { moveId?: string }).moveId === "sandboxAutoPlay")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// rule 108.4.d / 128.3 — a deck's ORDER is Secret to every player, its owner included
// ---------------------------------------------------------------------------

type Zones = Record<string, ZoneCard[]>;

const zonesOf = (session: GameSession, viewer?: string): Zones =>
  buildGameSnapshot(session, viewer).zones as unknown as Zones;

/** What the engine really holds in a zone: instance ids + definition ids. */
function realCards(session: GameSession, zoneId: string): { id: string; defId: string }[] {
  const internal = getInternalSnapshot(session.engine);
  return (internal.zones[zoneId]?.cardIds ?? []).map((id) => ({
    defId: internal.cards[id]?.definitionId ?? "",
    id,
  }));
}

/**
 * The zone reaches `viewer` as a COUNT and nothing else: same length (the
 * number of cards left is public), and not one real id or definition id on the
 * wire — asserted against what the engine actually holds, so the test cannot
 * pass by the UI merely declining to draw them.
 */
function expectOrderRedacted(session: GameSession, viewer: string | undefined, zoneId: string): void {
  const real = realCards(session, zoneId);
  expect(real.length).toBeGreaterThan(0); // never a vacuous pass: there IS a deck to leak
  const shipped = zonesOf(session, viewer)[zoneId] ?? [];
  expect(shipped).toHaveLength(real.length);
  const wire = JSON.stringify(shipped);
  for (const card of real) {
    expect(wire).not.toContain(card.id);
    expect(wire).not.toContain(card.defId);
  }
  for (const entry of shipped) {
    expect(entry).toMatchObject({ cardType: "unknown", definitionId: "", name: "Hidden card" });
  }
}

describe("deck ORDER is Secret to every seat — its owner too (rule 108.4.d / 128.3)", () => {
  test("duel: neither seat receives ITS OWN Main/Rune Deck in order — only the count", async () => {
    const game = await board().hand(P1, SCUTTLE_CRAB, "p1hand").build();
    const duel = sessionOf(game.engine, false);
    for (const seat of [P1, P2]) {
      for (const zone of ["mainDeck", "runeDeck"]) {
        expectOrderRedacted(duel, seat, zone);
      }
    }
    // …and the seat's own HAND is still its own to read: this redacts the
    // SEQUENCE of a Secret zone, not everything a player is entitled to see.
    const ownHand = (zonesOf(duel, P1).hand ?? []).filter((c) => c.owner === P1);
    expect(ownHand.length).toBeGreaterThan(0);
    expect(ownHand.every((c) => c.definitionId !== "")).toBe(true);
  });

  test("vs-Claude and hot seat: the same, for both seats of one session", async () => {
    const game = await board().build();
    const vsAi = sessionOf(game.engine, true);
    vsAi.opponent = { info: { kind: "claude", label: "Claude", model: "haiku" }, thinking: false } as unknown as GameSession["opponent"];
    expectOrderRedacted(vsAi, P1, "mainDeck");
    expectOrderRedacted(vsAi, P2, "mainDeck");

    // Hot seat: ONE human acting as both seats still may not read either deck —
    // the seat it is acting as is the seat whose knowledge the frame carries.
    const hot = sessionOf(game.engine, true);
    hot.hotSeat = true;
    expectOrderRedacted(hot, P1, "mainDeck");
    expectOrderRedacted(hot, P2, "mainDeck");
    expectOrderRedacted(hot, P1, "runeDeck");
    expectOrderRedacted(hot, P2, "runeDeck");
  });

  test("passive goldfish sandbox: the deck stays readable — the peek tool is the point of that mode", async () => {
    const game = await board().build();
    const goldfish = sessionOf(game.engine, true);
    const deck = zonesOf(goldfish, P1).mainDeck ?? [];
    expect(deck.length).toBeGreaterThan(0);
    expect(deck.some((c) => c.definitionId !== "")).toBe(true);
  });

  test("rule 421.4 opens the FACEDOWN cards at game end, never the decks", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .victoryScore(1)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 2, name: "P1 Holder" }, "h1")
      .unit(P2, "bf2", { might: 3, name: "Defender D" }, "d")
      .facedown(P2, "bf2", CONSULT_THE_PAST, "ctp")
      .build();
    const duel = sessionOf(game.engine, false);
    await game.p1.endTurn();
    await game.settle();
    expect(game.gameState.status).toBe("finished");

    expect(facedownAt(duel, P1, "bf2")[0]).toMatchObject({ definitionId: CONSULT_THE_PAST });
    expectOrderRedacted(duel, P1, "mainDeck");
    expectOrderRedacted(duel, P2, "mainDeck");
  });
});

// ---------------------------------------------------------------------------
// rule 128.3 — the shared match log is redacted per viewer, like the zones
// ---------------------------------------------------------------------------

const GEMCRAFT_SEER = "ogn-100-298";
const MYSTIC_PORO = "ogn-171-298";
/** Spelled like a real engine instance id so the log resolves it to a NAME. */
const PORO_INSTANCE = `player-2-main-4-${MYSTIC_PORO}`;

type Snapshot = ReturnType<typeof buildGameSnapshot>;
const logFor = (session: GameSession, viewer?: string): string[] =>
  (buildGameSnapshot(session, viewer) as Snapshot).log.map((e) => e.text);

/**
 * Card names this seat has no way to know: the OPPONENT's hand and facedown
 * cards, and either seat's deck. (The viewer's own deck contents are its own
 * decklist — what 128.3 hides there is the ORDER, which the zone tests above
 * pin — so they are not "unseeable" names for a log line.) A name that also
 * sits in a public zone is legitimately nameable and drops out.
 */
function unseeableNames(session: GameSession, viewer: string): Set<string> {
  const internal = getInternalSnapshot(session.engine);
  const secret = new Set<string>();
  const publicNames = new Set<string>();
  for (const [zoneId, zone] of Object.entries(internal.zones)) {
    for (const id of zone.cardIds) {
      const name = registry.get(internal.cards[id]?.definitionId ?? "")?.name;
      if (!name || name.length < 5) {continue;}
      const owner = internal.cards[id]?.owner ?? "";
      const mine = owner === viewer;
      const hidden =
        (zoneId === "mainDeck" && !mine) ||
        (zoneId === "runeDeck" && !mine) ||
        zoneId === "setAside" ||
        ((zoneId === "hand" || zoneId.startsWith("facedown-")) && !mine);
      (hidden ? secret : publicNames).add(name);
    }
  }
  for (const name of publicNames) {secret.delete(name);}
  return secret;
}

async function driveClaudeSeat(session: GameSession, ai: InstanceType<typeof ClaudeOpponent>, rounds = 12): Promise<void> {
  for (let i = 0; i < rounds; i++) {
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
}

/** A Claude seat with no key and no network (RB_AI_MOCK): it takes the first legal action. */
function mockClaude(): InstanceType<typeof ClaudeOpponent> {
  const previous = process.env.RB_AI_MOCK;
  process.env.RB_AI_MOCK = "1";
  try {
    return new ClaudeOpponent("haiku", undefined, { backoffMs: 0, lookupTools: [], pacingMs: 0, timeoutMs: 2000 });
  } finally {
    if (previous === undefined) {delete process.env.RB_AI_MOCK;} else {process.env.RB_AI_MOCK = previous;}
  }
}

describe("the match log is redacted per viewer (rule 128.3 / 424.1.a)", () => {
  test("a private [Vision] look names the ABILITY to the opponent and the CARD to the looker", async () => {
    const game = await scenario({ seed: "vision-log" })
      .active(P2)
      .resources(P2, { energy: 12, power: { chaos: 2, mind: 2 } })
      .battlefield("bf1", { controller: null })
      .hand(P2, GEMCRAFT_SEER, "seer")
      .deckTop(P2, MYSTIC_PORO, PORO_INSTANCE)
      .build();
    const session = sessionOf(game.engine, true);
    session.opponent = { info: { kind: "claude", label: "Claude", model: "haiku" }, thinking: false } as unknown as GameSession["opponent"];

    await game.p2.play("seer");
    await game.settle();
    // The look is parked as a PRIVATE prompt; answer it through the server's
    // own move path, which is what stamps the pick as private (server/turn.ts).
    expect((game.gameState.pendingChoice as { private?: boolean }).private).toBe(true);
    applySessionMove(session, P2, "resolvePendingChoice", { pickedCardId: PORO_INSTANCE, playerId: P2 });

    const looker = logFor(session, P2).join("\n");
    const opponent = logFor(session, P1).join("\n");
    expect(looker).toContain("Mystic Poro");
    expect(opponent).not.toContain("Mystic Poro");
    expect(opponent).toMatch(/chose a card/);
    // …and the seatless (REST / spectator) rendering is the redacted one.
    expect(logFor(session).join("\n")).not.toContain("Mystic Poro");
  });

  test("a rule that genuinely reveals a card still names it to BOTH seats (424.1)", async () => {
    // The alias is spelled like a real instance id so the log's own name
    // resolution (`player-N-main-i-<defId>`) is exercised, not bypassed.
    const game = await board().deckTop(P1, CONSULT_THE_PAST, "player-1-main-9-ogn-083-298").build();
    const duel = sessionOf(game.engine, false);
    const revealed = realCards(duel, "mainDeck").find((c) => c.defId === CONSULT_THE_PAST)!;
    const name = registry.get(revealed.defId)?.name;
    expect(name).toBe("Consult the Past");
    // The engine's shared reveal record is what a reveal writes; the log reads it.
    duel.engine.applyPatches([
      { op: "add", path: ["publicReveals"], value: [{ cardIds: [revealed.id], playerId: P1, turn: 1 }] },
    ] as never);
    for (const seat of [P1, P2]) {
      expect(logFor(duel, seat).join("\n")).toContain(name as string);
      // …while the deck it came off stays a count for everyone.
      expectOrderRedacted(duel, seat, "mainDeck");
    }
  });

  test("a driven vs-Claude game: no log entry a seat receives names a card that seat may not see", async () => {
    const game = await scenario({ seed: "log-walk" })
      .active(P2)
      // Enough to act, not enough to empty the hand: the seats must still HOLD
      // private cards when the walk runs, or the assertion scans nothing.
      .resources(P2, { energy: 3, power: { mind: 1 } })
      .battlefield("bf1", { controller: null })
      .hand(P1, SCUTTLE_CRAB, "p1hand")
      .hand(P2, GEMCRAFT_SEER, "seer")
      .hand(P2, CONSULT_THE_PAST, "p2hand")
      .deckTop(P2, MYSTIC_PORO, PORO_INSTANCE)
      .build();
    const ai = mockClaude();
    const session = sessionOf(game.engine, true);
    session.opponent = ai as unknown as GameSession["opponent"];
    await driveClaudeSeat(session, ai, 6);

    for (const viewer of [P1, P2]) {
      const secret = unseeableNames(session, viewer);
      const lines = logFor(session, viewer);
      // scanned=N on both axes — a green run that walked nothing is a failure.
      expect(secret.size).toBeGreaterThan(0);
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        for (const name of secret) {
          expect(line).not.toContain(name);
        }
      }
    }
  });

  test("the AI seat's own line: a card it puts FACEDOWN is named to itself and to nobody else (723 / 811.1.d)", async () => {
    const game = await board().build();
    const session = sessionOf(game.engine, true);
    const line = "🤖 Haiku: Hide Consult the Past facedown at bf2 — 'holding Consult the Past back as a bluff'";
    const publicLine = publicActionLine(
      session,
      [{ moveId: "hideCard", params: { battlefieldId: "bf2", cardId: "ctp" }, playerId: P2 }],
      line,
    );
    expect(publicLine).toBeDefined();
    expect(publicLine).not.toContain("Consult the Past");
    expect(publicLine).toContain("Hide a card");
    expect(publicLine).toContain("facedown at bf2");
    // A play is a public act — its own line needs no public rewording.
    expect(
      publicActionLine(session, [{ moveId: "playUnit", params: { cardId: "h1", location: "bf1" }, playerId: P1 }], "🤖 Haiku: Play P1 Holder to bf1"),
    ).toBeUndefined();
  });
});
