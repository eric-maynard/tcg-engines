/**
 * Info tools: rules tree navigation / search, card search / lookup, and the
 * per-seat public game views (zone, opponent_summary, battlefields,
 * chain_status) — including the hidden-information guarantee.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, ScenarioBuilder } from "@tcg/riftbound/harness";
import { createServer } from "../index";
import type { InfoContext } from "../info-tools";
import {
  INFO_TOOL_NAMES,
  MAX_CHARS,
  bindInfoTools,
  cardRows,
  filterCards,
  infoToolSpecs,
  infoToolsForModel,
  limitLines,
  rulesIndex,
  runInfoTool,
  searchRules,
} from "../info-tools";
import type { JsonObject } from "../mcp-lite";

const spec = (name: string) => {
  const s = infoToolSpecs.find((t) => t.name === name);
  if (!s) {
    throw new Error(`no info tool ${name}`);
  }
  return s;
};
const run = (name: string, args: Record<string, unknown> = {}, ctx: InfoContext = {}) =>
  runInfoTool(spec(name), ctx, args);
const text = (name: string, args: Record<string, unknown> = {}, ctx: InfoContext = {}) => {
  const r = run(name, args, ctx);
  if (r.isError) {
    throw new Error(`${name} → ${r.text}`);
  }
  return r.text;
};

describe("spec array", () => {
  test("every spec has a snake_case name, an object schema and a description; model view strips handlers", () => {
    expect(INFO_TOOL_NAMES).toEqual([
      "rules_toc",
      "rule",
      "rule_children",
      "rule_search",
      "search_cards",
      "card",
      "list_keywords",
      "list_sets",
      "list_domains",
      "zone",
      "opponent_summary",
      "battlefields",
      "chain_status",
    ]);
    for (const s of infoToolSpecs) {
      expect(s.name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect((s.input_schema as { type: string }).type).toBe("object");
      expect(s.description.length).toBeGreaterThan(20);
    }
    const model = infoToolsForModel();
    expect(model).toHaveLength(infoToolSpecs.length);
    expect(Object.keys(model[0] as object).sort()).toEqual(["description", "input_schema", "name"]);
  });
});

describe("rules tree", () => {
  test("toc → section children → a rule carries its parent chain and children", () => {
    const toc = text("rules_toc");
    expect(toc).toContain("S4 · Chains & Showdowns");
    expect(toc).toContain("S12 · Keywords");
    expect(toc.length).toBeLessThanOrEqual(MAX_CHARS);

    const s4 = text("rule_children", { id: "S4" });
    expect(s4).toContain("340 · Step 4: Resolve");
    expect(s4).toContain("341 · Showdowns");

    const r340 = text("rule", { id: "340" });
    expect(r340).toContain("[path: S4 Chains & Showdowns]");
    expect(r340).toContain("340.2 ·");

    const leaf = text("rule", { id: "340.2.a" });
    expect(leaf).toContain("path: S4 Chains & Showdowns › 340 Step 4: Resolve › 340.2");
    expect(leaf).toMatch(/Showdown/);

    // section aliases and the keyword glossary hang off S12 › 809 Deflect
    expect(text("rule", { id: "§12" })).toContain("809 · Deflect");
    const deflect = text("rule", { id: "809" });
    expect(deflect).toContain("path: S12 Keywords");
    expect(deflect).toContain("809.1");
    const idx = rulesIndex();
    expect(idx?.parent.get("809.1")).toBe("809");
    expect(idx?.parent.get("809")).toBe("S12");
    // a non-heading top-level rule is parented to the preceding heading
    expect(idx?.parent.get("102")).toBe("101");
  });

  test("unknown ids explain themselves; rule_children pages; leaf has no children", () => {
    const missing = run("rule", { id: "323.12.a" });
    expect(missing.isError).toBe(true);
    expect(missing.text).toContain("Nearest existing ancestor: 323.12");
    expect(text("rule_children", { id: "323.12" })).toContain("no children");
    const s2 = text("rule_children", { id: "S2" });
    expect(s2.length).toBeLessThanOrEqual(MAX_CHARS);
    const paged = text("rule_children", { id: "S7", offset: 30 });
    expect(paged).toContain("(from #30)");
  });

  test('rule_search finds "Deflect" (ligature-folded) with the glossary heading first', () => {
    const out = text("rule_search", { query: "Deflect" });
    const first = out.split("\n")[1] ?? "";
    expect(first.trim().startsWith("809 · Deflect")).toBe(true);
    const idx = rulesIndex();
    expect(idx).toBeDefined();
    const hits = searchRules(idx as NonNullable<typeof idx>, "rune pool", 5);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => /rune pool/i.test(idx?.nodes.get(h.id)?.text ?? ""))).toBe(true);
    expect(text("rule_search", { query: "zzzz-no-such-term" })).toContain("No rules mention");
  });
});

describe("cards", () => {
  test("search_cards: chaos spells costing 2–3 — non-empty and every row matches", () => {
    const args = { domain: "chaos", energy: { max: 3, min: 2 }, type: "spell" };
    const rows = filterCards(cardRows(), args);
    expect(rows.length).toBeGreaterThan(3);
    for (const r of rows) {
      expect(r.type).toBe("spell");
      expect(r.domains).toContain("chaos");
      expect(r.energy).toBeGreaterThanOrEqual(2);
      expect(r.energy).toBeLessThanOrEqual(3);
      expect(r.isToken).toBe(false);
    }
    const out = text("search_cards", args);
    expect(out).toContain(`${rows.length} cards match`);
    expect(out).toContain("· spell ·");
    expect(out.length).toBeLessThanOrEqual(MAX_CHARS + 200);
  });

  test("search_cards: keyword / champion / power pips / tokens / might filters", () => {
    const assault = filterCards(cardRows(), { domain: "fury", keyword: "assault", type: "unit" });
    expect(assault.length).toBeGreaterThan(0);
    expect(assault.every((r) => r.keywords.some((k) => k.toLowerCase() === "assault"))).toBe(true);

    const jinx = filterCards(cardRows(), { champion: "Jinx" });
    expect(jinx.length).toBeGreaterThan(0);
    expect(jinx.every((r) => r.tags.includes("Jinx") || r.championTag === "Jinx")).toBe(true);
    expect(jinx.some((r) => r.type === "legend")).toBe(true);

    const twoPips = filterCards(cardRows(), { power: { min: 2 } });
    expect(twoPips.length).toBeGreaterThan(0);
    expect(twoPips.every((r) => r.pips.length >= 2)).toBe(true);

    expect(filterCards(cardRows(), { type: "token" }).every((r) => r.isToken)).toBe(true);
    expect(filterCards(cardRows(), {}).some((r) => r.isToken)).toBe(false);
    expect(filterCards(cardRows(), { includeTokens: true }).some((r) => r.isToken)).toBe(true);

    const big = filterCards(cardRows(), { might: { min: 8 }, type: "unit" });
    expect(big.length).toBeGreaterThan(0);
    expect(big.every((r) => (r.might ?? 0) >= 8)).toBe(true);

    const gear = filterCards(cardRows(), { type: "gear" });
    expect(gear.some((r) => r.type === "equipment")).toBe(true);
    expect(gear.every((r) => r.type === "gear" || r.type === "equipment")).toBe(true);

    expect(text("search_cards", { name: "zzzz nothing" })).toContain("No cards match");
  });

  test("card: by id, by exact name (case-insensitive), fuzzy prefix / contains, instance id suffix", () => {
    expect(text("card", { id: "ogn-004-298" })).toContain("Cleave (ogn-004-298) — spell");
    expect(text("card", { name: "CLEAVE" })).toContain("Give a unit [Assault 3] this turn");
    const darius = text("card", { name: "darius" });
    expect(darius).toContain("Darius,");
    expect(darius).toContain("Other matches");
    expect(text("card", { name: "darius, trif" })).toContain("Darius, Trifarian (ogn-027-298)");
    expect(text("card", { name: "of the void" })).toContain("Daughter of the Void");
    expect(text("card", { id: "player-1-main-3-ogn-004-298" })).toContain("Cleave (ogn-004-298)");
    const none = run("card", { name: "qqqq" });
    expect(none.isError).toBe(true);
    expect(none.code).toBe("CARD_NOT_FOUND");
  });

  test("list_keywords links glossary rules; list_sets / list_domains", () => {
    const kw = text("list_keywords");
    expect(kw).toMatch(/Deflect \(\d+ cards\) — rule 809/);
    expect(text("list_sets")).toContain("OGN · Origins");
    const doms = text("list_domains");
    for (const d of ["fury", "calm", "mind", "body", "chaos", "order"]) {
      expect(doms).toContain(`  ${d} · `);
    }
  });
});

describe("truncation", () => {
  test('long lists are cut under the budget with "…(+N more; refine your query)"', () => {
    const rows = Array.from({ length: 200 }, (_, i) => `row ${i} ${"x".repeat(40)}`);
    const out = limitLines(["head"], rows);
    expect(out.length).toBeLessThanOrEqual(MAX_CHARS);
    const m = /…\(\+(\d+) more; refine your query\)/.exec(out);
    expect(m).not.toBeNull();
    const shown = out.split("\n").filter((l) => l.startsWith("row ")).length;
    expect(shown + Number(m?.[1])).toBe(200);
    // `more` folds rows the caller already dropped into the count
    expect(limitLines(["h"], ["a", "b"], { more: 5 })).toContain("…(+5 more");
    expect(limitLines(["h"], ["a", "b"])).toBe("h\na\nb");
    // every tool answer stays compact
    const units = text("search_cards", { limit: 40, type: "unit" });
    expect(units.length).toBeLessThanOrEqual(MAX_CHARS);
    expect(units).toMatch(/…\(\+\d+ more; refine your query or raise limit\)/);
  });
});

// ---------------------------------------------------------------------------
// game tools
// ---------------------------------------------------------------------------

function harness() {
  const { server, manager } = createServer();
  const call = async (name: string, args: JsonObject = {}) => {
    const r = await server.callTool(name, args);
    return {
      body: (r.structuredContent ?? {}) as Record<string, unknown>,
      r,
      text: r.content[0]?.text ?? "",
    };
  };
  const ok = async (name: string, args: JsonObject = {}) => {
    const x = await call(name, args);
    if (x.r.isError) {
      throw new Error(`${name} failed: ${x.text}`);
    }
    return x;
  };
  return { call, manager, ok, server };
}

/** P2 holds secrets everywhere a seat can hide them; P1 is the viewer. */
const secretSpec = () =>
  new ScenarioBuilder()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2")
    .legend(P1, "ogn-247-298", "p1legend")
    .legend(P2, "ogn-247-298", "p2legend")
    .champion(P2, "ogn-039-298", "p2champ")
    .unit(P1, "base", { might: 2, name: "Viewer Grunt" }, "p1grunt")
    .unit(P2, "bf1", { might: 3, name: "Public Defender" }, "p2def", { exhausted: true })
    .unit(P2, "base", { might: 1, name: "Public Base Unit" }, "p2base")
    .hand(P1, "ogn-004-298", "p1cleave")
    .hand(P2, { cardType: "spell", energyCost: 2, name: "Zz Secret Hand Spell" }, "zzhand1")
    .hand(P2, { cardType: "unit", might: 4, name: "Zz Secret Hand Unit" }, "zzhand2")
    .facedown(P2, "bf1", { cardType: "spell", name: "Zz Facedown Trap" }, "zztrap")
    .facedown(P1, "bf2", { cardType: "spell", name: "Own Facedown Trick" }, "p1trick")
    .trash(P2, "ogn-004-298", "p2trash1")
    .trash(P2, "ogn-004-298", "p2trash2")
    .banishment(P2, { cardType: "unit", might: 2, name: "Banished Bob" }, "p2ban")
    .deck(P2, [{ cardType: "unit", might: 9, name: "Zz Deck Topper" }], ["zzdeck1"])
    .deck(P1, [{ cardType: "unit", might: 9, name: "Zz Own Deck Card" }], ["zzowndeck"])
    .runes(P2, "fury", 2)
    .runes(P2, "mind", 1, { exhausted: true })
    .runes(P1, "chaos", 1)
    .resources(P2, { energy: 2, power: { fury: 1 } })
    .points(P2, 3)
    .fillDecks({ main: 5, runes: 4 })
    .toSpec();

describe("game info tools (MCP, per-seat)", () => {
  test("registered on the server next to the play tools, with gameId+seat added to game-scoped schemas", () => {
    const { server } = harness();
    const tools = server.listTools();
    for (const n of INFO_TOOL_NAMES) {
      expect(tools.map((t) => t.name)).toContain(n);
    }
    const zone = tools.find((t) => t.name === "zone") as { inputSchema: { required: string[] } };
    expect(zone.inputSchema.required).toEqual(["gameId", "seat", "zone"]);
    const toc = tools.find((t) => t.name === "rules_toc") as {
      inputSchema: { required?: string[] };
    };
    expect(toc.inputSchema.required ?? []).toEqual([]);
  });

  test("zone: public zones list cards; opponent hand/deck are counts; own hand lists; facedown identity only for its controller", async () => {
    const { ok, call } = harness();
    const { body } = await ok("create_game", {
      mode: "duel",
      scenario: secretSpec() as unknown as JsonObject,
    });
    const gameId = body.gameId as string;
    const z = async (seat: string, zone: string, player?: string) =>
      (await ok("zone", { gameId, player, seat, zone })).text;

    expect(await z("p1", "trash", "opponent")).toContain("Cleave [p2trash1] spell");
    expect(await z("p1", "banishment", "opponent")).toContain("Banished Bob [p2ban]");
    expect(await z("p1", "base", "opponent")).toContain("Public Base Unit [p2base] 1M");
    const bf1 = await z("p1", "battlefield:bf1");
    expect(bf1).toContain("Public Defender [p2def] 3M exhausted");
    expect(bf1).toContain("facedown card (hidden by player-2)");
    expect(bf1).not.toContain("Zz");
    expect(await z("p1", "facedown:bf2")).toContain("Own Facedown Trick [p1trick]");
    expect(await z("p2", "facedown:bf2")).toContain("facedown card (hidden by player-1)");
    expect(await z("p2", "facedown:bf1")).toContain("Zz Facedown Trap [zztrap]");

    expect(await z("p1", "hand", "opponent")).toBe("player-2 hand: 2 cards (identities hidden)");
    const ownHand = await z("p1", "hand");
    expect(ownHand).toContain("Cleave [p1cleave] spell 1");
    expect(await z("p2", "hand")).toContain("Zz Secret Hand Spell [zzhand1]");
    const oppDeck = await z("p1", "deck", "opponent");
    expect(oppDeck).toMatch(/^player-2 main deck: \d+ cards; rune deck: \d+/);
    expect(await z("p1", "deck")).toMatch(/^player-1 \(you\) main deck: \d+ cards/);

    expect(await z("p1", "legend", "opponent")).toContain(
      "Daughter of the Void [p2legend] (fury/mind)",
    );
    expect(await z("p1", "champion", "opponent")).toContain("not yet played");
    expect(await z("p1", "champion")).toContain("empty");
    expect(await z("p1", "runes", "opponent")).toContain("2/3 ready (fury 2/2, mind 0/1)");
    expect(await z("p1", "pool", "opponent")).toContain("energy 2, power fury:1");
    expect(await z("p1", "points", "opponent")).toMatch(/^player-2: 3\/\d+ points/);
    expect(await z("p1", "board", "opponent")).toContain("bf1] (controls): Public Defender");

    const bad = await call("zone", { gameId, seat: "p1", zone: "sideboard" });
    expect(bad.r.isError).toBe(true);
    expect(bad.text).toContain("zone must be one of");
    const noGame = await call("zone", { gameId: "nope", seat: "p1", zone: "hand" });
    expect(noGame.r.isError).toBe(true);
    expect((noGame.body as { code: string }).code).toBe("GAME_NOT_FOUND");
  });

  test("PRIVACY: nothing any game tool says to player-1 contains opponent hand cards, foreign facedown identities or any deck card", async () => {
    const { ok, manager } = harness();
    const { body } = await ok("create_game", {
      mode: "duel",
      scenario: secretSpec() as unknown as JsonObject,
    });
    const gameId = body.gameId as string;
    const outputs: string[] = [];
    const zones = [
      "hand",
      "deck",
      "runedeck",
      "trash",
      "banishment",
      "base",
      "legend",
      "champion",
      "runes",
      "pool",
      "points",
      "board",
      "battlefield:bf1",
      "battlefield:bf2",
      "facedown:bf1",
      "facedown:bf2",
    ];
    for (const zone of zones) {
      for (const player of [undefined, "me", "opponent", "player-2", "p2"]) {
        const r = await ok("zone", { gameId, player, seat: "p1", zone });
        outputs.push(r.text, JSON.stringify(r.body));
      }
    }
    for (const name of ["opponent_summary", "battlefields", "chain_status"]) {
      const r = await ok(name, { gameId, seat: "p1" });
      outputs.push(r.text, JSON.stringify(r.body));
      const me = await ok(name, { gameId, player: "me", seat: "p1" }).catch(() => undefined);
      if (me) {
        outputs.push(me.text);
      }
    }
    // and the same specs bound the way the AI opponent binds them
    const m = manager.get(gameId);
    const bound = bindInfoTools((seat: string) => ({
      seats: m.game.seats(),
      view: (v) => m.game.backend.view(v),
      viewer: seat,
    }));
    for (const t of bound.filter((b) =>
      ["zone", "opponent_summary", "battlefields", "chain_status"].includes(b.name),
    )) {
      const args = t.name === "zone" ? { player: "opponent", zone: "hand" } : {};
      outputs.push(t.handler(args, P1));
    }
    const all = outputs.join("\n");
    for (const secret of [
      "Zz Secret Hand Spell",
      "Zz Secret Hand Unit",
      "zzhand1",
      "zzhand2",
      "Zz Facedown Trap",
      "zztrap",
      "Zz Deck Topper",
      "zzdeck1",
      "Zz Own Deck Card",
      "zzowndeck",
    ]) {
      expect(all.includes(secret), `leaked ${secret}`).toBe(false);
    }
    // sanity: public things ARE there
    expect(all).toContain("Public Defender");
    expect(all).toContain("Own Facedown Trick"); // p1 controls it
    expect(all).toContain("hand 2 (hidden)");
  });

  test("opponent_summary shape", async () => {
    const { ok } = harness();
    const { body } = await ok("create_game", {
      mode: "duel",
      scenario: secretSpec() as unknown as JsonObject,
    });
    const gameId = body.gameId as string;
    const r = await ok("opponent_summary", { gameId, seat: "p1" });
    const lines = r.text.split("\n");
    expect(lines[0]).toContain(
      "player-2 — legend: Daughter of the Void (fury/mind) | champion: Kai'Sa",
    );
    expect(lines[0]).toMatch(/\| 3\/\d+ points/);
    expect(lines[1]).toContain(
      "pool: energy 2, power fury:1 | runes 2/3 ready (fury 2/2, mind 0/1) | rune deck",
    );
    expect(lines[2]).toMatch(
      /^hand 2 \(hidden\) \| main deck \d+ \| trash \(2\): Cleave×2 \| banishment \(1\): Banished Bob/,
    );
    expect(r.text).toContain("board:");
    expect(r.text).toContain("base: Public Base Unit [p2base] 1M");
    expect(r.text).toContain(
      "[bf1] (controls): Public Defender [p2def] 3M exhausted | facedown card (hidden by player-2)",
    );
    expect(r.body).toMatchObject({ gameId, ok: true, seat: P1 });
    // "me" flips it around (own hand is visible to yourself)
    const mine = await ok("opponent_summary", { gameId, player: "me", seat: "p1" });
    expect(mine.text).toContain("player-1 (you)");
    expect(mine.text).toContain("visible: Cleave");
  });

  test("battlefields + chain_status: showdown / chain / priority after a spell is cast into combat", async () => {
    const { ok } = harness();
    const spec2 = new ScenarioBuilder()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 5, name: "Attacker" }, "atk")
      .unit(P2, "bf1", { might: 1, name: "Blocker" }, "blk")
      .hand(P1, "ogn-004-298", "cleave")
      .toSpec();
    const { body } = await ok("create_game", {
      autoProcedures: false,
      mode: "duel",
      scenario: spec2 as unknown as JsonObject,
    });
    const gameId = body.gameId as string;
    let bfs = (await ok("battlefields", { gameId, seat: "p1" })).text;
    expect(bfs).toContain("[bf1] — ctrl player-2");
    expect(bfs).toContain("player-2: Blocker [blk] 1M");
    let chain = (await ok("chain_status", { gameId, seat: "p2" })).text;
    expect(chain).toContain("turn state neutral-open");
    expect(chain).toContain("Chain: empty");
    expect(chain).toContain("Showdown: none.");

    await ok("move_units", { gameId, seat: "p1", to: "bf1", units: ["atk"] });
    bfs = (await ok("battlefields", { gameId, seat: "p2" })).text;
    expect(bfs).toContain("CONTESTED by player-1");
    expect(bfs).toContain("SHOWDOWN here (focus player-1; player-1 attacking player-2)");
    expect(bfs).toContain("player-1: Attacker [atk] 5M");

    await ok("play_card", { card: "cleave", gameId, seat: "p1", targets: "atk" });
    chain = (await ok("chain_status", { gameId, seat: "p2" })).text;
    expect(chain).toContain("turn state showdown-closed");
    expect(chain).toContain("#1 Cleave [cleave] — spell by player-1, targets atk");
    expect(chain).toMatch(/priority: player-[12]/);
    expect(chain).toContain("Showdown at ");
    expect(chain).toContain("combat — player-1 attacking player-2");
    expect(chain).toMatch(/Decision: player-[12]/);
  });
});
