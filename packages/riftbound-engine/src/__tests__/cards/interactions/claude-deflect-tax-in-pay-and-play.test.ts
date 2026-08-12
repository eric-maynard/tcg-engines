/**
 * Interaction: the vs-Claude seat driver and the [Deflect] surcharge.
 *   Spirit's Refuge (ogn-063-298) · Gear — "Friendly buffed units have [Deflect] if they didn't
 *     already. (Opponents must pay [rainbow] to choose those units with a spell or ability.)"
 *   Sky Splitter  (ogn-014-298) · Fury spell [Action] — "This spell's Energy cost is reduced by the
 *     highest Might among units you control. Deal 5 to a unit at a battlefield."
 *   Loyal Poro    (unl-156-219) · Order unit, 3 Might — the buffed body Spirit's Refuge covers.
 *
 * The human controls Spirit's Refuge with a BUFFED Loyal Poro at bf1 and an UNBUFFED unit at bf2.
 * The Claude seat holds Sky Splitter with enough runes for the base cost and one spare pip.
 *
 * Question:
 *   (a) Does `buildSeatMenu` quote each targeting line at the price the ENGINE will charge — printed
 *       cost for the unbuffed unit, printed + [rainbow] for the Deflect-carrying Poro?
 *   (b) The synthesized "Pay & play" entry plans its rune taps from `handPlayCost`, which prices the
 *       CARD, not the target. Does the plan include the Deflect surcharge, or does it under-tap so the
 *       taps land and the play is then refused — spending Claude's runes for nothing?
 *   (c) When the surcharge is unaffordable, is the deflected target simply ABSENT (never
 *       offered-then-rejected, which burns three retries and dumps the turn into a Goldfish
 *       "End turn"), while the untaxed target stays offered?
 *   (d) If the surcharge appears between menu construction and application, does the stale item fail
 *       the signature check and trigger a re-ask against the CURRENT menu?
 *
 * Rules: 809.1.c / 809.1.c.1 ([Deflect] = "spells and abilities an opponent controls that target me
 * cost [Deflect Value] more Power, of any Domain, for each time they choose me"), 356.2.a.2 (a
 * mandatory additional cost), 356.2 (additional costs are part of the total cost), 355.5 (targets are
 * chosen as the spell is played — so the surcharge is incurred when the target is CHOSEN), 358.5 (a
 * play whose own checks fail is undone; one whose controller merely could not pay is refused before
 * anything is spent).
 *
 * DESIGN (`.claude/skills/riftbound-rules/DESIGN.md` §Paying costs): paying is MANUAL, and a
 * surcharge that NOTHING could fund (809.1.d) drops the candidate outright — that is the engine
 * contract these tests hold the app driver to.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";
import {
  type CallModel,
  type ModelRequest,
  ClaudeOpponent,
  aiSeatMustAct,
  buildSeatMenu,
} from "../../../../../../apps/riftbound-app/server/ai-opponent";
import { handPlayCost } from "../../../../../../apps/riftbound-app/server/snapshot";
import { type GameSession, getInternalSnapshot } from "../../../../../../apps/riftbound-app/server/state";
import { applySessionMove } from "../../../../../../apps/riftbound-app/server/turn";

const SPIRITS_REFUGE = "ogn-063-298";
const SKY_SPLITTER = "ogn-014-298";
const LOYAL_PORO = "unl-156-219";

const FAST = { backoffMs: 0, pacingMs: 0, timeoutMs: 2000 };

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

/**
 * The human's board: Spirit's Refuge, a BUFFED Loyal Poro at bf1 (so it carries [Deflect]) and a
 * plain unbuffed body at bf2. The Claude seat (P2) holds Sky Splitter and a 6-Might unit so the
 * spell's Energy cost is reduced 8 → 2.
 */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .gear(P1, SPIRITS_REFUGE, "refuge")
    .unit(P1, "bf1", LOYAL_PORO, "poro", { buffed: true })
    .unit(P1, "bf2", { might: 2, name: "Plain Guard" }, "guard")
    .unit(P2, "base", { might: 6, name: "Big Body" }, "big")
    .hand(P2, SKY_SPLITTER, "splitter");
}

/** Only the deflected body is at a battlefield — the untaxed line does not exist. */
function deflectedOnly() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .gear(P1, SPIRITS_REFUGE, "refuge")
    .unit(P1, "bf1", LOYAL_PORO, "poro", { buffed: true })
    .unit(P2, "base", { might: 6, name: "Big Body" }, "big")
    .hand(P2, SKY_SPLITTER, "splitter");
}

function recorder(fn: (req: ModelRequest, n: number) => { name: string; input: Record<string, unknown> }) {
  const calls: ModelRequest[] = [];
  const callModel: CallModel = async (req) => {
    calls.push(req);
    return fn(req, calls.length);
  };
  return { callModel, calls };
}

function chooseByLabel(req: ModelRequest, ...patterns: RegExp[]): { name: string; input: Record<string, unknown> } {
  for (const re of patterns) {
    const hit = req.meta.menu?.find((it) => re.test(it.label));
    if (hit) {
      return { input: { index: hit.index, rationale: `test: ${re.source}` }, name: "choose" };
    }
  }
  throw new Error(`no menu entry matches ${patterns.map(String).join(" | ")} in:\n${req.meta.menu?.map((i) => i.label).join("\n")}`);
}

function pool(session: GameSession): { energy: number; power: Record<string, number> } {
  const p = session.engine.getState().runePools[P2];
  return { energy: p?.energy ?? 0, power: { ...((p?.power ?? {}) as Record<string, number>) } };
}

describe("vs-Claude driver × [Deflect]: quoting, planning and offering the surcharge", () => {
  // ---- (a) the price of a targeting line depends on the TARGET -----------------------------------

  test("(a) the ENGINE prices per target: the Deflect line carries surcharge 1, the plain line 0 (809.1.c.1, 356.2.a.2)", async () => {
    const game = await board().resources(P2, { energy: 2, power: { fury: 2 } }).build();
    expect(game.state("poro").keywords).toContain("Deflect"); // granted only while buffed
    expect(game.state("guard").keywords).not.toContain("Deflect");

    const field = game.p2.option("cast", "splitter")?.fields.find((f) => f.name === "targets");
    const flat = (field?.options ?? []).map((v) => (Array.isArray(v) ? (v[0] as string) : (v as string)));
    const surcharge = field?.surcharge ?? [];
    expect(flat).toContain(game.card("poro"));
    expect(flat).toContain(game.card("guard"));
    expect(surcharge[flat.indexOf(game.card("poro"))]).toBe(1);
    expect(surcharge[flat.indexOf(game.card("guard"))]).toBe(0);
  });

  test("(a) removing the buff removes the surcharge from the next quote — Spirit's Refuge grants [Deflect] only while buffed", async () => {
    const game = await board().resources(P2, { energy: 2, power: { fury: 2 } }).unit(P1, "bf1", LOYAL_PORO, "plainPoro").build();
    const field = game.p2.option("cast", "splitter")?.fields.find((f) => f.name === "targets");
    const flat = (field?.options ?? []).map((v) => (Array.isArray(v) ? (v[0] as string) : (v as string)));
    expect(flat).toContain(game.card("plainPoro"));
    expect((field?.surcharge ?? [])[flat.indexOf(game.card("plainPoro"))]).toBe(0);
    expect((field?.surcharge ?? [])[flat.indexOf(game.card("poro"))]).toBe(1);
  });

  test("buildSeatMenu quotes each targeting line at what the engine charges — the taxed line carries the [Deflect] surcharge (809.1.c.1, 356.2.a.2)", async () => {
    // Expected: "→ Loyal Poro" is quoted at printed + [rainbow]; "→ Plain Guard" at the printed cost.
    // Actual: `labelMove` prices from `handPlayCost`, which prices the CARD, so both read
    // "— 2 energy + [fury]" and the model cannot see that one target costs a pip more.
    const game = await board().resources(P2, { energy: 2, power: { fury: 2 } }).build();
    const session = sessionOf(game.engine);
    const items = buildSeatMenu(session, P2).items;
    const taxed = items.find((it) => /Cast Sky Splitter → Loyal Poro/.test(it.label));
    const plain = items.find((it) => /Cast Sky Splitter → Plain Guard/.test(it.label));
    expect(taxed).toBeDefined();
    expect(plain).toBeDefined();
    expect(taxed?.label).not.toBe(plain?.label.replace("Plain Guard", "Loyal Poro"));
    expect(taxed?.label).toMatch(/rainbow|Deflect|\+ ?1 .*power/i);
  });

  // ---- (b) "Pay & play" plans from the card cost, not the target cost ----------------------------

  test("(b) the plan is built from handPlayCost, which is target-blind: the card quotes 2 energy + [fury] with no room for the surcharge", async () => {
    const game = await deflectedOnly().resources(P2, { energy: 0 }).runes(P2, "fury", 4).build();
    const session = sessionOf(game.engine);
    expect(handPlayCost(session, "splitter")).toEqual({ energy: 2, power: ["fury"] });
    expect(game.p2.can("cast", "splitter")).toBe(false); // nothing in the pool yet
  });

  test("'Pay & play' is NOT offered for the DEFLECTED target when the runes cover only the base cost — the play could not land (356.2, 809.1.c.1)", async () => {
    // The energy is already banked and a single [fury] rune covers the printed Power pip exactly;
    // nothing is left to fund the [Deflect] pip, so the entry must be absent rather than synthesized
    // and then refused after the taps are spent.
    const game = await deflectedOnly().resources(P2, { energy: 2 }).runes(P2, "fury", 1).build();
    const items = buildSeatMenu(sessionOf(game.engine), P2).items;
    const payplay = items.find((it) => it.kind === "payplay" && /Sky Splitter/.test(it.label));
    expect(payplay).toBeUndefined();

    // Contrast: the very same purse DOES fund an untaxed target, so the absence above is the
    // surcharge and not a missing plan.
    const plain = await scenario()
      .active(P2)
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf2", { might: 2, name: "Plain Guard" }, "guard")
      .unit(P2, "base", { might: 6, name: "Big Body" }, "big")
      .hand(P2, SKY_SPLITTER, "splitter")
      .resources(P2, { energy: 2 })
      .runes(P2, "fury", 1)
      .build();
    const plainItems = buildSeatMenu(sessionOf(plain.engine), P2).items;
    expect(plainItems.some((it) => it.kind === "payplay" && /Sky Splitter/.test(it.label))).toBe(true);
  });

  test("taking that entry funds the surcharge too, so the play lands — the pool must be untouched whenever it does not (358.5)", async () => {
    // Expected: either the entry is absent, or applying it is atomic — Sky Splitter is played, or the
    // rune pool is exactly as it was. It was the former: three rune moves were applied, the follow-up
    // play found no legal variant, and the seat had converted runes into a pool it could not use.
    // The plan now prices the TARGET (356.2 / 809.1.c.1): four taps, and the cast reaches the Chain.
    // (The spell is still ON the Chain here — nobody has passed priority — so the 5 damage that will
    // kill the 3-Might Poro has not been dealt yet.)
    const game = await deflectedOnly().resources(P2, { energy: 0 }).runes(P2, "fury", 4).build();
    const rec = recorder((req) => chooseByLabel(req, /^Pay & Cast Sky Splitter/, /^End turn/));
    const ai = new ClaudeOpponent("haiku", "sk-ant-api03-testkeytestkey", { ...FAST, callModel: rec.callModel, lookupTools: [] });
    const session = sessionOf(game.engine, ai);
    const before = pool(session);
    const readyRunes = game.p2.runes({ ready: true }).length;

    await ai.act(session);

    const landed = game.zoneOf("splitter") !== "hand";
    if (!landed) {
      expect(pool(session)).toEqual(before);
      expect(game.p2.runes({ ready: true })).toHaveLength(readyRunes);
    }
    expect(landed).toBe(true);
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "splitter", controller: P2, targets: ["poro"] }),
    ]);
  });

  // ---- (c) an unfundable surcharge is not offered at all (809.1.d) -------------------------------

  test("(c) with no spare pip the deflected target is ABSENT from the menu while the untaxed one stays — never offered-then-rejected (809.1.d)", async () => {
    const game = await board().resources(P2, { energy: 2, power: { fury: 1 } }).build();
    const field = game.p2.option("cast", "splitter")?.fields.find((f) => f.name === "targets");
    const flat = (field?.options ?? []).map((v) => (Array.isArray(v) ? (v[0] as string) : (v as string)));
    expect(flat).toEqual([game.card("guard")]);

    const items = buildSeatMenu(sessionOf(game.engine), P2).items;
    expect(items.some((it) => /Cast Sky Splitter → Plain Guard/.test(it.label))).toBe(true);
    expect(items.some((it) => /Cast Sky Splitter → Loyal Poro/.test(it.label))).toBe(false);
    await expect(game.p2.cast("splitter", { targets: "poro" })).rejects.toThrow();
  });

  test("(c) the seat therefore plays the untaxed cast on its FIRST model call — no retry cycle, no Goldfish 'End turn'", async () => {
    const game = await board().resources(P2, { energy: 2, power: { fury: 1 } }).build();
    const rec = recorder((req) => chooseByLabel(req, /^Cast Sky Splitter/, /^End turn/));
    const ai = new ClaudeOpponent("haiku", "sk-ant-api03-testkeytestkey", { ...FAST, callModel: rec.callModel, lookupTools: [] });
    const session = sessionOf(game.engine, ai);
    await ai.act(session);

    expect(game.zoneOf("splitter")).not.toBe("hand");
    expect(session.log.some((e) => /🤖 Haiku: Cast Sky Splitter → Plain Guard/u.test(e.text))).toBe(true);
    expect(session.log.some((e) => /fallback/.test(e.text))).toBe(false);
    expect(session.log.some((e) => /is stuck/.test(e.text))).toBe(false);
    expect(session.engine.getState().turn.activePlayer).toBe(P2); // the turn was not thrown away
    // Exactly one action reached the human as a 🤖 line for the cast itself.
    expect(session.log.filter((e) => /^🤖 Haiku: Cast Sky Splitter/u.test(e.text))).toHaveLength(1);
  });

  // ---- (d) a stale menu item is re-asked, never pushed at the engine -----------------------------

  test("(d) a surcharge that appears between menu build and apply invalidates the item's signature: a re-ask against the CURRENT menu, no engine rejection", async () => {
    const game = await board().resources(P2, { energy: 2, power: { fury: 1 } }).runes(P2, "fury", 1).build();
    let session!: GameSession;
    const rejected: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      const line = args.map(String).join(" ");
      if (line.includes("[ai] move rejected") || line.includes("play after payment rejected")) {
        rejected.push(line);
      }
    };
    let staleIndex = -1;
    try {
      const rec = recorder((req, n) => {
        if (n === 1) {
          const hit = req.meta.menu?.find((it) => /Cast Sky Splitter → Plain Guard/.test(it.label));
          staleIndex = hit?.index ?? -1;
          // While the model was thinking, the second unit became buffed — Spirit's Refuge now grants
          // it [Deflect] too, so the quote the model is answering is a pip short. (The board change is
          // staged directly and then committed by a real move, which is what re-runs the static pass.)
          const meta = getInternalSnapshot(session.engine).cardMetas[game.card("guard")] as unknown as Record<string, unknown>;
          meta.buffed = true;
          meta.__flags = { ...((meta.__flags as Record<string, boolean> | undefined) ?? {}), buffed: true };
          expect(applySessionMove(session, P2, "exhaustRune", { playerId: P2, runeId: game.p2.runes()[0] }).success).toBe(true);
          return { input: { index: staleIndex, rationale: "stale" }, name: "choose" };
        }
        return chooseByLabel(req, /^End turn/);
      });
      const ai = new ClaudeOpponent("haiku", "sk-ant-api03-testkeytestkey", { ...FAST, callModel: rec.callModel, lookupTools: [] });
      session = sessionOf(game.engine, ai);
      await ai.act(session);

      expect(staleIndex).toBeGreaterThanOrEqual(0);
      expect(game.state("guard").keywords).toContain("Deflect"); // the surcharge really did appear
      // The second request carries the invalidation note and a menu WITHOUT the now-taxed line.
      expect(rec.calls.length).toBeGreaterThanOrEqual(2);
      expect(String(rec.calls[1]?.messages[0]?.content)).toMatch(/no longer legal/);
      expect(rec.calls[1]?.meta.menu?.some((it) => /Cast Sky Splitter/.test(it.label))).toBe(false);
      // Nothing was pushed at the engine and refused; the spell is still in hand.
      expect(rejected).toEqual([]);
      expect(game.zoneOf("splitter")).toBe("hand");
      expect(session.log.filter((e) => /^🤖 /u.test(e.text))).toHaveLength(1);
      expect(session.log[session.log.length - 1]?.text).toMatch(/End turn/);
    } finally {
      console.log = origLog;
    }
  });
});
