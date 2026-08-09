/**
 * Interaction: Wild Claw (ven-089-166) · Spell · Body · 7 + [body]
 *     "Look at the top 5 cards of your Main Deck. You may banish a unit or gear from among them and play it,
 *      reducing its Energy cost by [5]. Recycle the rest. Then you may do this: Empower it."
 *   × Scrapheap (ogn-182-298) · Gear · Chaos · 2 — "When this is played, discarded, or killed, draw 1."
 *   × Ravenbloom Prefect (ven-102-166) · Unit · Chaos · 3 · 3 Might
 *     "When an opponent plays a gear, you may banish me to banish it."
 *
 * Rules: 354.2 / 354.3 (a card played mid-resolution goes to the chain Pending and waits for the resolving
 * effect to finish), 387.1 / 388.1 / 401.2 ("Then you may do this: Empower it" is a reflexive trigger → a new
 * Pending ability, appended after the Scrapheap play), 337.1.b (Pending items finalize oldest-first), 337.2 +
 * 359.2.d (a finalized gear resolves at once and enters READY in base), 419.4.a + 383.4.a.2 (on-play triggers
 * fire when the play completes), 383.3.d.1 (simultaneous triggers: turn player's first), 383.3.a / 402.1 (a
 * leading "you may" is decided at finalization), 204.3.a / 383.3.b / 383.3.b.1 ("banish me to banish it" is the
 * Prefect trigger's base cost, paid during finalization), 337.1.a / 337.4 (no priority until nothing is
 * Pending; then the controller of the next item gets it), 340.1 (newest resolves first), 355.10.d ("it" is
 * determined, not targeted), 359.3.e.6 / 359.3.e.12 + 441.2 + 124.1 (Empowering an object that has left the
 * board is impossible → ignored).
 *
 * Question: P1's turn; P2 controls Ravenbloom Prefect. P1 casts Wild Claw, finds Scrapheap, plays it and opts
 * into the Empower.
 *   (a) Chain order of: the Scrapheap play, Wild Claw's "Empower it", Scrapheap's draw, Prefect's trigger —
 *       and when does P2 pay "banish me"?
 *   (b) When is the first moment anyone has priority?
 *   (c) Resolution order — does Prefect banish Scrapheap before/after the Empower and the draw? Does P1 draw?
 *   (d) Contrast with no Prefect.
 *
 * Expected:
 *   (a) Pending [Scrapheap-play, Empower-it]; Scrapheap finalizes for 2−5 → 0 and enters ready in P1's base;
 *       that raises Scrapheap-draw (P1) and Prefect (P2), turn player first → chain oldest→newest
 *       [Empower-it, Scrapheap-draw, Prefect]. P2's opt-in and "banish me" happen at finalization — Prefect is
 *       in banishment before anyone has had priority. Wild Claw itself is finished → trash.
 *   (b) Only after all of that (337.4) — and it is P2 (controller of the newest item) who holds it first.
 *   (c) LIFO: Prefect's ability banishes Scrapheap; then the draw still resolves (+1 card); then "Empower it"
 *       finds Scrapheap off the board → ignored. Net: Scrapheap + Prefect banished, P1 +1 card, nothing
 *       Empowered.
 *   (d) Without Prefect: [Empower-it, Scrapheap-draw] → draw first, then Scrapheap (ready, in base) is Empowered.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WILD_CLAW = "ven-089-166";
const SCRAPHEAP = "ogn-182-298";
const RAVENBLOOM_PREFECT = "ven-102-166";
const SKULKER = "ogn-175-298"; // vanilla 3-cost unit — a second legal pick so the reveal is a real choice
const RUNE_PRISON = "ogn-050-298"; // a spell — seen, never pickable

/**
 * P1's turn with exactly Wild Claw's cost floating. Deck top 5 = Scrapheap, Skulker, 3 spells; 6th = "sixth".
 * P2: a bystander unit and (optionally) Ravenbloom Prefect in base.
 */
function board(withPrefect: boolean) {
  const s = scenario()
    .resources(P1, { energy: 7, power: { body: 1 } })
    .deck(P1, [SCRAPHEAP, SKULKER, RUNE_PRISON, RUNE_PRISON, RUNE_PRISON, SKULKER], ["scrap", "skulker", "s1", "s2", "s3", "sixth"])
    .hand(P1, WILD_CLAW, "wc")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "grunt");
  return withPrefect ? s.unit(P2, "base", RAVENBLOOM_PREFECT, "prefect") : s;
}

interface Step {
  readonly kind: Decision["kind"] | "priority";
  readonly seat: string;
  readonly source?: string;
  readonly chain: { cardId: string; controller: string; triggered: boolean }[];
  readonly scrapZone: string;
  readonly scrapEmpowered: boolean;
  readonly prefectZone?: string;
  readonly p1Hand: number;
}

function step(game: Game, d: Decision): Step {
  return {
    chain: game.chain().map((c) => ({ cardId: c.cardId, controller: c.controller, triggered: c.triggered })),
    kind: d.kind === "action" ? "priority" : d.kind,
    p1Hand: game.p1.hand().length,
    prefectZone: game.has("prefect") ? game.zoneOf("prefect") : undefined,
    scrapEmpowered: game.state("scrap").isEmpowered,
    scrapZone: game.zoneOf("scrap"),
    seat: d.seat,
    source: d.source?.cardId,
  };
}

/** Cast Wild Claw and pass until its reveal-and-pick; pick Scrapheap. Returns the game positioned right after the pick. */
async function clawIntoScrapheap(withPrefect: boolean): Promise<Game> {
  const game = await board(withPrefect).build();
  await game.p1.cast("wc");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  const look = game.decision() as PickDecision;
  expect(look).toMatchObject({ allowDecline: true, kind: "pick", seat: P1, semantics: "from-revealed" });
  expect(look.options.map((o) => o.card ?? o.key).sort()).toEqual(["scrap", "skulker"]);
  await game.p1.pick("scrap");
  return game;
}

/**
 * From right after the pick: answer every prompt (P1 and P2 both say YES to their "you may"), pass every
 * priority window, until P1's open Main Phase. Returns the ordered log of what was asked / who held priority.
 */
async function playOut(game: Game, opts: { p2Accepts?: boolean } = {}): Promise<Step[]> {
  const log: Step[] = [];
  for (let i = 0; i < 40; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    log.push(step(game, d));
    if (d.kind === "action") {
      await game.seat(d.seat).passPriority();
    } else if (d.kind === "yes-no") {
      await (d.seat === P2 && opts.p2Accepts === false ? game.p2.no() : game.seat(d.seat).yes());
    } else if (d.kind === "order") {
      await game.acceptTriggerOrder();
    } else if (d.kind === "pick" && d.seat === P1) {
      // a destination / follow-up with a single sensible answer
      await game.p1.pick(d.options[0]!.key);
    } else {
      throw new Error(`unexpected ${d.kind} for ${d.seat}: ${d.prompt}`);
    }
  }
  return log;
}

describe("Wild Claw × Scrapheap × Ravenbloom Prefect — pending play, reflexive Empower, two on-play triggers", () => {
  // ---- (a) what goes on the chain, in what order, and when P2 pays -------------------------------------------

  test("(a) Scrapheap is played for 2−5 → 0 (nothing beyond Wild Claw's 7+[body] is spent) and enters P1's base READY (359.2.d); the other four are recycled and Wild Claw goes to the trash", async () => {
    const game = await clawIntoScrapheap(true);
    expect(game.zoneOf("scrap")).toBe("base");
    expect(game.state("scrap")).toMatchObject({ controller: P1, isExhausted: false, isReady: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    const deck = game.p1.deck();
    expect(deck[0]).toBe("sixth");
    expect(deck.slice(-4).sort()).toEqual(["s1", "s2", "s3", "skulker"]);
    expect(game.zoneOf("wc")).toBe("trash");
  });

  test("(a) once Scrapheap has entered, the chain reads oldest→newest [Wild Claw's 'Empower it' (P1), Scrapheap's draw (P1), Prefect (P2)] — reflexive item appended before the play completed, then the two on-play triggers turn-player-first (388.1, 419.4.a, 383.3.d.1)", async () => {
    const game = await clawIntoScrapheap(true);
    // Accept a soft trigger-order offer if one is pending, without answering anything else.
    await game.acceptTriggerOrder();
    expect(game.chain().map((c) => [c.cardId, c.controller, c.triggered])).toEqual([
      ["wc", P1, true],
      ["scrap", P1, true],
      ["prefect", P2, true],
    ]);
  });

  test("(a) P2 decides the Prefect's leading 'you may' and pays 'banish me' during FINALIZATION: P2 is asked before anyone holds priority, and the Prefect is already in banishment at the first priority window (383.3.a, 204.3.a, 383.3.b.1)", async () => {
    const game = await clawIntoScrapheap(true);
    const log = await playOut(game);
    const firstPriority = log.findIndex((s) => s.kind === "priority");
    const p2Ask = log.findIndex((s) => s.kind === "yes-no" && s.seat === P2);
    expect(p2Ask).toBeGreaterThanOrEqual(0);
    expect(firstPriority).toBeGreaterThan(p2Ask);
    expect(log[p2Ask]!.prefectZone).toBe("base"); // asked while still on the board…
    expect(log[firstPriority]!.prefectZone).toBe("banishment"); // …paid before priority opened
    expect(log[firstPriority]!.scrapZone).toBe("base"); // the EFFECT (banish it) has not happened yet
  });

  test("(a) P1's 'you may do this: Empower it' is likewise decided up front — while Wild Claw resolves / the reflexive item is finalized — not when that item finally resolves (383.3.a, 402.1, 387/388)", async () => {
    // Expected: P1's Empower opt-in is asked BEFORE the first priority window (and not again afterwards).
    // Actual: the reflexive item is put on the chain unconditionally and P1 is only asked "Use Wild Claw's
    // optional ability?" when it resolves — after Prefect's ability and Scrapheap's draw have both resolved.
    const game = await clawIntoScrapheap(true);
    const log = await playOut(game);
    const firstPriority = log.findIndex((s) => s.kind === "priority");
    const p1Ask = log.findIndex((s) => s.kind === "yes-no" && s.seat === P1);
    expect(p1Ask).toBeGreaterThanOrEqual(0);
    expect(p1Ask).toBeLessThan(firstPriority);
    expect(log.slice(firstPriority).some((s) => s.kind === "yes-no" && s.seat === P1)).toBe(false);
  });

  // ---- (b) the first priority window ---------------------------------------------------------------------------

  test("(b) nobody has priority until nothing is Pending: at the first window all three items are finalized on the chain, Prefect is banished (cost), Scrapheap is still in base un-Empowered, P1 has not drawn — and P2, controller of the newest item, holds it (337.1.a, 337.4)", async () => {
    const game = await clawIntoScrapheap(true);
    const log = await playOut(game);
    const first = log.find((s) => s.kind === "priority");
    expect(first).toBeDefined();
    expect(first!.chain.map((c) => c.cardId)).toEqual(["wc", "scrap", "prefect"]);
    expect(first).toMatchObject({ p1Hand: 0, prefectZone: "banishment", scrapEmpowered: false, scrapZone: "base", seat: P2 });
  });

  // ---- (c) resolution order and net result ---------------------------------------------------------------------

  test("(c) LIFO: Prefect's ability resolves first and banishes Scrapheap; Scrapheap's draw STILL resolves (+1 card) although its source left the board; 'Empower it' then finds nothing on the board and is ignored (340.1, 355.10.d, 359.3.e.6, 441.2)", async () => {
    const game = await clawIntoScrapheap(true);
    const log = await playOut(game);
    // Order of departures from the chain: prefect first, then scrap, then wc.
    const topOverTime = log.filter((s) => s.kind === "priority").map((s) => s.chain.at(-1)?.cardId);
    const order = topOverTime.filter((id, i) => i === 0 || topOverTime[i - 1] !== id);
    expect(order).toEqual(["prefect", "scrap", "wc"]);
    // While Scrapheap's draw is on top, Scrapheap is already banished and P1 has not drawn yet.
    const scrapOnTop = log.find((s) => s.kind === "priority" && s.chain.at(-1)?.cardId === "scrap");
    expect(scrapOnTop).toMatchObject({ p1Hand: 0, scrapZone: "banishment" });
    // While the Empower item is on top, the draw has happened.
    const wcOnTop = log.find((s) => s.kind === "priority" && s.chain.length === 1 && s.chain[0]!.cardId === "wc");
    expect(wcOnTop).toMatchObject({ p1Hand: 1, scrapEmpowered: false, scrapZone: "banishment" });
    // Net.
    expect(game.zoneOf("scrap")).toBe("banishment");
    expect(game.state("scrap").isEmpowered).toBe(false);
    expect(game.zoneOf("prefect")).toBe("banishment");
    expect(game.p1.hand()).toEqual(["sixth"]); // drew exactly 1 — the card that was 6th
    expect(game.p1.base()).toEqual([]);
    expect(game.p2.base()).toEqual(["grunt"]);
    expect(game.zoneOf("wc")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(c) if P2 DECLINES the Prefect's 'you may', nothing is paid or banished: chain is just [Empower-it, draw] → P1 draws 1 and Scrapheap ends up Empowered in base; Prefect stays", async () => {
    const game = await clawIntoScrapheap(true);
    const log = await playOut(game, { p2Accepts: false });
    const first = log.find((s) => s.kind === "priority");
    expect(first!.chain.map((c) => c.cardId)).toEqual(["wc", "scrap"]);
    expect(game.zoneOf("prefect")).toBe("base");
    expect(game.zoneOf("scrap")).toBe("base");
    expect(game.state("scrap").isEmpowered).toBe(true);
    expect(game.p1.hand()).toEqual(["sixth"]);
  });

  // ---- (d) contrast: no Prefect ---------------------------------------------------------------------------------

  test("(d) without Prefect: chain [Empower-it, Scrapheap-draw]; the draw resolves first (+1), then Scrapheap — still on the board — becomes Empowered; it sits ready in P1's base", async () => {
    const game = await clawIntoScrapheap(false);
    const log = await playOut(game);
    const first = log.find((s) => s.kind === "priority");
    expect(first).toBeDefined();
    expect(first!.chain.map((c) => [c.cardId, c.controller])).toEqual([
      ["wc", P1],
      ["scrap", P1],
    ]);
    expect(first).toMatchObject({ p1Hand: 0, scrapEmpowered: false, scrapZone: "base" });
    const wcOnTop = log.find((s) => s.kind === "priority" && s.chain.length === 1 && s.chain[0]!.cardId === "wc");
    expect(wcOnTop).toMatchObject({ p1Hand: 1, scrapEmpowered: false }); // draw done, Empower not yet
    expect(game.zoneOf("scrap")).toBe("base");
    expect(game.state("scrap")).toMatchObject({ controller: P1, isEmpowered: true, isReady: true });
    expect(game.p1.hand()).toEqual(["sixth"]);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.zoneOf("wc")).toBe("trash");
    expect(game.state("wc").isEmpowered).toBe(false); // "it" = the played card, never the spell
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(d) the Prefect only cares about GEAR an OPPONENT plays: Wild Claw into the Skulker (a unit) raises no Prefect trigger at all", async () => {
    const game = await board(true).build();
    await game.p1.cast("wc");
    await game.settle();
    await game.p1.pick("skulker");
    const log = await playOut(game);
    expect(log.some((s) => s.seat === P2 && s.kind === "yes-no")).toBe(false);
    expect(log.every((s) => s.chain.every((c) => c.cardId !== "prefect"))).toBe(true);
    expect(game.zoneOf("prefect")).toBe("base");
    expect(game.zoneOf("skulker")).toBe("base");
    expect(game.state("skulker").isEmpowered).toBe(true);
  });
});
