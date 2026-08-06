/**
 * In-process MCP server tests: protocol surface, a scripted goldfish game,
 * targeted spells / follow-ups / engine prompts through `act`, error paths.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, ScenarioBuilder } from "@tcg/riftbound/harness";
import { createServer } from "../index";
import type { JsonObject, ToolResult } from "../mcp-lite";

const CLEAVE = "ogn-004-298";
const STACKED_DECK = "ogn-183-298";

export const EXPECTED_TOOLS = [
  "create_game",
  "list_games",
  "close_game",
  "describe_state",
  "current_decision",
  "list_legal_actions",
  "card_state",
  "card_text",
  "history",
  "act",
  "play_card",
  "activate_ability",
  "move_units",
  "tap_rune",
  "recycle_rune",
  "pass_priority",
  "pass_focus",
  "pass",
  "end_turn",
  "concede",
  "settle",
  "advance_turn",
];

function harness() {
  const { server, manager } = createServer();
  const call = async (
    name: string,
    args: JsonObject = {},
  ): Promise<{ r: ToolResult; body: Record<string, any> }> => {
    const r = await server.callTool(name, args);
    return { body: (r.structuredContent ?? {}) as Record<string, any>, r };
  };
  const ok = async (name: string, args: JsonObject = {}) => {
    const { r, body } = await call(name, args);
    if (r.isError) {
      throw new Error(`${name} failed: ${r.content[0]?.text}`);
    }
    return body;
  };
  return { call, manager, ok, server };
}

describe("protocol surface", () => {
  test("initialize → tools/list exposes every tool with an object input schema; resources list/read", async () => {
    const { server } = harness();
    const init = await server.handle({
      id: 1,
      jsonrpc: "2.0",
      method: "initialize",
      params: {
        capabilities: {},
        clientInfo: { name: "t", version: "0" },
        protocolVersion: "2025-03-26",
      },
    });
    expect((init?.result as any).serverInfo.name).toBe("riftbound-mcp");
    expect((init?.result as any).capabilities.tools).toBeDefined();
    expect(await server.handle({ jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();

    const listed = await server.handle({ id: 2, jsonrpc: "2.0", method: "tools/list" });
    const tools = (
      listed?.result as {
        tools: { name: string; inputSchema: { type: string }; description: string }[];
      }
    ).tools;
    expect(tools.map((t) => t.name).sort()).toEqual([...EXPECTED_TOOLS].sort());
    for (const t of tools) {
      expect(t.inputSchema.type).toBe("object");
      expect(t.description.length).toBeGreaterThan(10);
    }

    const res = await server.handle({ id: 3, jsonrpc: "2.0", method: "resources/list" });
    expect((res?.result as any).resources.map((r: any) => r.uri).sort()).toEqual([
      "riftbound://cards/README",
      "riftbound://design",
      "riftbound://schema/moves",
    ]);
    const design = await server.handle({
      id: 4,
      jsonrpc: "2.0",
      method: "resources/read",
      params: { uri: "riftbound://design" },
    });
    expect((design?.result as any).contents[0].text).toContain("Riftbound Agent Harness");
    const moves = await server.handle({
      id: 5,
      jsonrpc: "2.0",
      method: "resources/read",
      params: { uri: "riftbound://schema/moves" },
    });
    const doc = JSON.parse((moves?.result as any).contents[0].text);
    expect(doc.enumerable.playSpell.params.properties.targets).toBeDefined();

    const unknown = await server.handle({ id: 6, jsonrpc: "2.0", method: "bogus/method" });
    expect(unknown?.error?.code).toBe(-32601);
    const badTool = await server.handle({
      id: 7,
      jsonrpc: "2.0",
      method: "tools/call",
      params: { arguments: {}, name: "nope" },
    });
    expect(badTool?.error?.code).toBe(-32602);
  });
});

describe("scripted goldfish game", () => {
  test("create → tap 2 runes → play cheapest unit → end_turn → settle → describe_state shows the turn advanced", async () => {
    const { ok } = harness();
    const created = await ok("create_game", {
      decks: { p1: { domains: ["fury", "chaos"] }, p2: { domains: ["calm", "mind"] } },
      seed: "mcp-1",
    });
    const gameId = created.gameId as string;
    expect(created.mode).toBe("goldfish");
    expect(created.seats).toEqual([P1, P2]);
    expect(created.decision.kind).toBe("action");
    expect(created.decision.context).toBe("main");
    expect(typeof created.next).toBe("string");
    const startTurn = (await ok("describe_state", { gameId, seat: "p1" })).turn.number as number;

    const tapped = await ok("tap_rune", { count: 2, gameId, seat: "p1" });
    expect(tapped.runes).toHaveLength(2);
    let state = await ok("describe_state", { gameId, seat: "player-1" });
    expect(state.you.resources.energy).toBe(2);

    const legal = await ok("list_legal_actions", { gameId, groupBy: "move", seat: "p1" });
    const plays = (legal.actions.playUnit ?? []) as { card: string; key: string }[];
    expect(plays.length).toBeGreaterThan(0);
    const hand = state.you.hand as { id: string; cost?: string; type: string }[];
    const cheapest = plays
      .map((p) => hand.find((h) => h.id === p.card))
      .filter((h): h is { id: string; cost?: string; type: string } => Boolean(h))
      .sort((a, b) => Number.parseInt(a.cost ?? "0", 10) - Number.parseInt(b.cost ?? "0", 10))[0]!;
    const played = await ok("play_card", { card: cheapest.id, gameId, seat: "p1", to: "base" });
    expect(played.executed[0].moveId).toBe("playUnit");
    expect(played.seq).toBeGreaterThan(tapped.seq);
    state = await ok("describe_state", { gameId, seat: "p1" });
    expect((state.you.base as { id: string }[]).map((c) => c.id)).toContain(cheapest.id);
    expect((state.you.hand as { id: string }[]).map((c) => c.id)).not.toContain(cheapest.id);

    const ended = await ok("end_turn", { gameId, seat: "p1" });
    expect(ended.executed[0].moveId).toBe("endTurn");
    await ok("settle", { gameId });
    state = await ok("describe_state", { gameId, seat: "p1" });
    expect(state.turn.number).toBeGreaterThan(startTurn);
    expect(state.turn.activePlayer).toBe(P1); // goldfish bot ended its own turn
    expect(state.decision.context).toBe("main");

    const hist = await ok("history", { gameId, sinceSeq: 0 });
    const moves = (hist.steps as { executed: { moveId: string }[]; seat: string }[]).map(
      (s) => `${s.seat}:${s.executed.map((e) => e.moveId).join("+")}`,
    );
    expect(moves).toContain("player-1:playUnit");
    expect(moves).toContain("player-2:endTurn");

    // advance_turn: end our turn, the bot takes (and ends) its turn, back to our main phase.
    const adv = await ok("advance_turn", { gameId });
    expect(adv.turn.activePlayer).toBe(P1);
    expect(adv.turn.number).toBe((state.turn.number as number) + 2);
    expect(adv.decision.context).toBe("main");
    // recycle_rune: +1 power of the rune's domain.
    const rec = await ok("recycle_rune", { gameId, seat: "p1" });
    expect(rec.executed[0].moveId).toBe("recycleRune");
    const power = (await ok("describe_state", { gameId, seat: "p1" })).you.resources
      .power as Record<string, number>;
    expect(Object.values(power).reduce((a, b) => a + b, 0)).toBe(1);

    const games = await ok("list_games");
    expect(games.games.map((g: any) => g.gameId)).toContain(gameId);
    const closed = await ok("close_game", { gameId });
    expect(closed.closed).toBe(true);
  });

  test("card_text finds a card by name or id, in or out of a game", async () => {
    const { ok, call } = harness();
    const byName = await ok("card_text", { name: "cleave" });
    expect(byName.cards[0].defId).toBe(CLEAVE);
    expect(byName.cards[0].rulesText).toContain("Assault 3");
    expect(byName.cards[0].abilities[0]).toContain("grant-keyword");
    const byId = await ok("card_text", { defId: `player-1-main-3-${CLEAVE}` });
    expect(byId.cards[0].name).toBe("Cleave");
    const none = await call("card_text", { name: "definitely not a card" });
    expect(none.r.isError).toBe(true);
    expect(none.body.error.code).toBe("CARD_NOT_FOUND");
  });
});

describe("act: targeted spell, follow-up, engine prompt", () => {
  const cleaveSpec = () =>
    new ScenarioBuilder()
      .resources(P1, { energy: 1 })
      .battlefield("bf1")
      .unit(P1, "base", { might: 2 }, "ally")
      .unit(P2, "base", { might: 2 }, "foe")
      .hand(P1, CLEAVE, "cleave")
      .toSpec();

  test("cast a targeted spell in ONE act call with args.targets; settle resolves it", async () => {
    const { ok } = harness();
    const { gameId } = await ok("create_game", {
      mode: "duel",
      scenario: cleaveSpec() as unknown as JsonObject,
    });
    const dec = await ok("current_decision", { gameId, seat: "p1" });
    const opt = (
      dec.decision.options as { key: string; fields: { arg: string; options: unknown[] }[] }[]
    ).find((o) => o.key === "playSpell:cleave")!;
    expect(opt.fields.find((f) => f.arg === "targets")?.options).toEqual([["ally"], ["foe"]]);

    const cast = await ok("act", {
      answer: {
        args: { targets: "ally" },
        decisionId: dec.decision.id,
        key: "playSpell:cleave",
        kind: "action",
      },
      gameId,
      seat: "p1",
    });
    expect(cast.executed[0]).toMatchObject({
      moveId: "playSpell",
      params: { cardId: "cleave", targets: ["ally"] },
    });
    expect(cast.decision.context).toBe("chain");
    expect(cast.next).toContain("player-1");
    // Duel: both seats pass explicitly through the named verbs.
    await ok("pass_priority", { gameId, seat: "p1" });
    const p2pass = await ok("pass", { gameId, seat: "p2" });
    expect(p2pass.decision.context).toBe("main");
    const ally = await ok("card_state", { card: "ally", gameId, seat: "p1" });
    expect(ally.card.grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    const cleave = await ok("card_state", { card: "cleave", gameId });
    expect(cleave.card.zone).toBe("trash");
  });

  test("omitting targets yields a followUp pick; answering it by shorthand executes the bundle", async () => {
    const { ok } = harness();
    const { gameId } = await ok("create_game", { scenario: cleaveSpec() as unknown as JsonObject }); // goldfish: P2 auto-passes
    const r1 = await ok("play_card", { card: "cleave", gameId, seat: "p1" });
    expect(r1.executed).toEqual([]);
    expect(r1.followUp).toMatchObject({ kind: "pick", semantics: "follow-up", synthetic: true });
    expect(r1.followUp.options.map((o: { key: string }) => o.key)).toEqual(["ally", "foe"]);
    expect(r1.next).toContain("follow-up");
    const r2 = await ok("act", { answer: "foe", gameId, seat: "p1" });
    expect(r2.executed[0]).toMatchObject({ moveId: "playSpell", params: { targets: ["foe"] } });
    const settled = await ok("settle", { gameId });
    expect(settled.decision.context).toBe("main");
    expect((await ok("card_state", { card: "foe", gameId })).card.keywords).toContain("Assault");
  });

  test("an engine pendingChoice (reveal-and-pick) is surfaced by current_decision and answered via act", async () => {
    const { ok } = harness();
    const spec = new ScenarioBuilder()
      .resources(P1, { energy: 1 })
      .hand(P1, STACKED_DECK, "sd")
      .deck(P1, [CLEAVE, CLEAVE, CLEAVE], ["a", "b", "c"])
      .toSpec();
    const { gameId } = await ok("create_game", { scenario: spec as unknown as JsonObject });
    await ok("play_card", { card: "sd", gameId, seat: "p1" });
    const settled = await ok("settle", { gameId });
    expect(settled.reason).toBe("unanswered");
    const dec = await ok("current_decision", { gameId });
    expect(dec.decision).toMatchObject({ kind: "pick", seat: P1, semantics: "from-revealed" });
    expect(dec.decision.source.pendingChoiceType).toBe("reveal-and-pick");
    expect(dec.decision.options.map((o: { key: string }) => o.key).sort()).toEqual(["a", "b", "c"]);
    const state = await ok("describe_state", { gameId, seat: "p1" });
    expect(state.pendingChoice.type).toBe("reveal-and-pick");
    const picked = await ok("act", { answer: { keys: ["b"], kind: "pick" }, gameId, seat: "p1" });
    expect(picked.executed[0]).toMatchObject({
      moveId: "resolvePendingChoice",
      params: { pickedCardId: "b" },
    });
    const after = await ok("describe_state", { gameId, seat: "p1" });
    expect((after.you.hand as { id: string }[]).map((c) => c.id)).toEqual(["b"]);
    expect(after.decision.context).toBe("main");
  });

  test("move_units into an enemy battlefield opens a showdown that settle resolves", async () => {
    const { ok } = harness();
    const spec = new ScenarioBuilder()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 5 }, "big")
      .unit(P2, "bf1", { might: 1 }, "small")
      .toSpec();
    const { gameId } = await ok("create_game", { scenario: spec as unknown as JsonObject });
    const moved = await ok("move_units", { gameId, seat: "p1", to: "bf1", units: ["big"] });
    expect(moved.executed[0]).toMatchObject({
      moveId: "standardMove",
      params: { destination: "bf1", unitIds: ["big"] },
    });
    await ok("settle", { gameId });
    const st = await ok("describe_state", { gameId, seat: "p1" });
    const bf = (
      st.battlefields as { id: string; controller: string; units: { id: string }[] }[]
    ).find((b) => b.id === "bf1")!;
    expect(bf.controller).toBe(P1);
    expect((await ok("card_state", { card: "small", gameId })).card.zone).toBe("trash");
  });

  test("partial hand-written scenario JSON is accepted (defaults filled)", async () => {
    const { ok } = harness();
    const { gameId } = await ok("create_game", {
      mode: "duel",
      scenario: {
        cards: [
          { def: CLEAVE, id: "c1", owner: "player-1", zone: "hand" },
          { def: { might: 3, name: "Dummy" }, owner: "player-2", zone: "base" },
        ],
        resources: { p1: { energy: 1 } },
      },
    });
    const st = await ok("describe_state", { gameId, seat: "p1" });
    expect(st.turn).toMatchObject({ activePlayer: P1, number: 2, phase: "main" });
    expect(st.you.hand[0].id).toBe("c1");
    expect(st.opponents[0].base[0].name).toBe("Dummy");
  });
});

describe("error paths", () => {
  test("bad gameId, unknown seat, not your decision, illegal args, stale decision, unknown option", async () => {
    const { call, ok } = harness();
    const missing = await call("describe_state", { gameId: "nope", seat: "p1" });
    expect(missing.r.isError).toBe(true);
    expect(missing.body.error.code).toBe("GAME_NOT_FOUND");

    const spec = new ScenarioBuilder()
      .resources(P1, { energy: 1 })
      .unit(P1, "base", { might: 2 }, "ally")
      .hand(P1, CLEAVE, "cleave")
      .hand(P2, CLEAVE, "theirs")
      .toSpec();
    const { gameId } = await ok("create_game", {
      mode: "duel",
      scenario: spec as unknown as JsonObject,
    });

    const badSeat = await call("describe_state", { gameId, seat: "p9" });
    expect(badSeat.body.error.code).toBe("ILLEGAL_ARGS");

    // P2 tries to answer P1's main-phase decision with a prompt answer.
    const notYours = await call("act", {
      answer: { keys: ["ally"], kind: "pick" },
      gameId,
      seat: "p2",
    });
    expect(notYours.r.isError).toBe(true);
    expect(notYours.body.error.code).toBe("NOT_YOUR_DECISION");
    expect(notYours.body.seq).toBe(0);
    expect(notYours.body.next).toContain("player-1");

    // P2 has no legal play for their card right now (not their turn).
    const p2play = await call("play_card", { card: "theirs", gameId, seat: "p2" });
    expect(p2play.body.error.code).toBe("UNKNOWN_OPTION");

    const illegal = await call("act", {
      answer: { args: { targets: "nobody" }, key: "playSpell:cleave", kind: "action" },
      gameId,
      seat: "p1",
    });
    expect(illegal.r.isError).toBe(true);
    expect(illegal.body.error.code).toBe("ILLEGAL_ARGS");
    expect(illegal.body.seq).toBe(0); // nothing executed

    const stale = await call("act", {
      answer: { decisionId: "d99:player-1:action", key: "endTurn:-", kind: "action" },
      gameId,
      seat: "p1",
    });
    expect(stale.body.error.code).toBe("STALE_DECISION");

    const unknownOpt = await call("act", {
      answer: { key: "playUnit:ghost", kind: "action" },
      gameId,
      seat: "p1",
    });
    expect(unknownOpt.body.error.code).toBe("UNKNOWN_OPTION");

    const wrongKind = await call("act", { answer: 3, gameId, seat: "p1" });
    expect(wrongKind.body.error.code).toBe("WRONG_ANSWER_KIND");

    const noCard = await call("play_card", { card: "ghost", gameId, seat: "p1" });
    expect(noCard.body.error.code).toBe("CARD_NOT_FOUND");

    const cantEnd = await call("end_turn", { gameId, seat: "p2" });
    expect(cantEnd.body.error.code).toBe("UNKNOWN_OPTION");
    expect(cantEnd.body.error.message).toContain("Legal:");

    // State untouched by all of the above.
    expect((await ok("describe_state", { gameId, seat: "p1" })).seq).toBe(0);

    // After the game ends every act reports GAME_OVER.
    await ok("concede", { gameId, seat: "p2" });
    const over = await call("act", { answer: "endTurn:-", gameId, seat: "p1" });
    expect(over.body.error.code).toBe("GAME_OVER");
    expect(over.body.next).toContain("game over");
  });
});
