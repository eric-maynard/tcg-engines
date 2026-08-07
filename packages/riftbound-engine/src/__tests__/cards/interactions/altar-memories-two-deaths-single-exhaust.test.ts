/**
 * Interaction: Altar of Memories (sfd-169-221) — Gear
 *     "When a friendly unit dies, you may exhaust me to draw 1, then put a card from your hand on
 *      the top or bottom of your Main Deck."
 *   × Watchful Sentry (ogn-096-298) — 1 Might, "[Deathknell] — Draw 1."  (two copies)
 *   × Flurry of Blades (ogn-133-298) — "[Reaction] Deal 1 to all units at battlefields."
 *
 * Question: P1 controls a READY Altar in base and two Watchful Sentries at bf1. P2 resolves Flurry
 * of Blades; both Sentries die in the same cleanup. How many triggers does P1 get, can the Altar
 * draw twice (once per death), and does the position of the Altar items relative to the Sentry
 * items matter? Contrast: P1 declines the Altar's "you may".
 *
 * Rules: 323.4 / 323.5 (both lethal-damaged units note their triggers, then die, in ONE cleanup →
 * simultaneous), 383.3.d (P1 controls all four triggers — Sentry DK ×2, Altar ×2 — and orders
 * them), 337.1.b (items finalize in append order), 383.3.a + 383.3.b + 383.3.b.1 ("you may" +
 * "exhaust me" up front = opt-in AND base cost paid at FINALIZATION), 383.3.a.2 (declined /
 * unpayable → removed, treated as not having triggered).
 *
 * Expected: four pending triggers, order Decision for P1. First Altar item finalized: P1 opts in
 * and exhausts the Altar. Second Altar item: Altar already exhausted → cost unpayable → removed.
 * Exactly ONE Altar resolution regardless of order → 3 draws total (2 Sentry + 1 Altar), 1 card put
 * back → hand net +2, Altar ends exhausted. LIFO nuance: Altar resolving before a Sentry item and
 * putting the card on TOP means that Sentry redraws the same card; Altar resolving LAST means P1
 * sees three fresh cards before choosing. Decline: both Altar items removed, P1 just draws 2 off
 * the Sentries, Altar stays ready.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ALTAR = "sfd-169-221";
const WATCHFUL_SENTRY = "ogn-096-298";
const FLURRY_OF_BLADES = "ogn-133-298";
const FILLER = "ogn-175-298";

function board(altarMeta?: { exhausted?: boolean }) {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .gear(P1, ALTAR, "altar", altarMeta)
    .unit(P1, "bf1", WATCHFUL_SENTRY, "s1")
    .unit(P1, "bf1", WATCHFUL_SENTRY, "s2")
    .unit(P2, "base", { might: 3, name: "Bystander" }, "bystander") // in a base: Flurry misses it
    .deck(P1, [FILLER, FILLER, FILLER, FILLER, FILLER], ["d1", "d2", "d3", "d4", "d5"])
    .hand(P1, FILLER, "keep")
    .hand(P2, FLURRY_OF_BLADES, "flurry");
}

interface Trace {
  /** canAccept value of each Altar opt-in question, in the order asked. */
  optIns: boolean[];
  /** P1's hand at the moment the FIRST opt-in question was asked. */
  handAtFirstOptIn?: string[];
  /** cards offered by the "put a card from your hand back" pick. */
  putBackOffered: string[][];
  orderPrompts: number;
}

/**
 * Drive every pending prompt until an open main phase: pass priority for both seats, answer the
 * Altar's opt-in with `pay`, put `put` back on `dest`, take any order prompt as offered.
 */
async function drive(game: Game, opts: { pay: boolean; put?: string; dest?: "top" | "bottom" }): Promise<Trace> {
  const t: Trace = { optIns: [], orderPrompts: 0, putBackOffered: [] };
  for (let i = 0; i < 40; i++) {
    const r = await game.settle();
    if (r.reason !== "unanswered") {
      break;
    }
    const d = game.decision() as Decision;
    if (d.seat !== P1) {
      throw new Error(`unexpected prompt for ${d.seat}: ${d.kind} ${d.prompt}`);
    }
    if (d.kind === "yes-no") {
      t.handAtFirstOptIn ??= game.p1.hand();
      const canAccept = d.canAccept !== false;
      t.optIns.push(canAccept);
      await (opts.pay && canAccept ? game.p1.yes() : game.p1.no());
    } else if (d.kind === "order") {
      t.orderPrompts += 1;
      await game.p1.order(d.items.map((x) => x.key));
    } else if (d.kind === "pick") {
      const keys = d.options.map((o) => o.key);
      if (keys.some((k) => /mainDeck-(top|bottom)/.test(k))) {
        await game.p1.pick(keys.find((k) => k.endsWith(opts.dest ?? "bottom")) as string);
      } else {
        t.putBackOffered.push(d.options.map((o) => o.card ?? o.key).sort());
        const want = opts.put && keys.includes(opts.put) ? opts.put : (keys[0] as string);
        await game.p1.pick(want);
      }
    } else {
      throw new Error(`unexpected ${d.kind} prompt: ${d.prompt}`);
    }
  }
  return t;
}

async function flurry(altarMeta?: { exhausted?: boolean }): Promise<Game> {
  const game = await board(altarMeta).build();
  await game.p2.cast("flurry");
  return game;
}

describe("Altar of Memories × two Watchful Sentries dying to one Flurry of Blades", () => {
  test("Flurry of Blades kills both 1-Might Sentries in the same cleanup (323.4/323.5); the unit in a base is untouched", async () => {
    const game = await flurry();
    await drive(game, { pay: false });
    expect(game.zoneOf("s1")).toBe("trash");
    expect(game.zoneOf("s2")).toBe("trash");
    expect(game.state("bystander").damage).toBe(0);
    expect(game.zoneOf("flurry")).toBe("trash");
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
  });

  // Expected: Sentry DK ×2 + Altar ×2 trigger simultaneously, all P1's → P1 gets an ORDER decision
  // over the four pending items (383.3.d). Actual: no order prompt; the engine sequences them itself.
  test.failing("BUG: P1 controls four simultaneous triggers (2× Deathknell, 2× Altar) and must be asked to order them (383.3.d)", async () => {
    const game = await flurry();
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    const d = game.decision();
    expect(d?.seat).toBe(P1);
    expect(d?.kind).toBe("order");
    const items = d?.kind === "order" ? d.items.map((i) => i.card) : [];
    expect(items.filter((c) => c === "altar")).toHaveLength(2);
    expect(items.filter((c) => c === "s1" || c === "s2")).toHaveLength(2);
  });

  // Expected: the opt-in ("you may exhaust me") is asked at FINALIZATION, before any chain item has
  // resolved — so P1's hand is still just [keep] when first asked (383.3.a, 383.3.b).
  // Actual: one Sentry's Deathknell draw has already happened (hand [keep, d1]) before the question.
  test("the first Altar opt-in is a finalization question — nothing has resolved yet, P1 still holds only 'keep' (383.3.a, 337.1.b)", async () => {
    const game = await flurry();
    const t = await drive(game, { pay: true, put: "keep" });
    expect(t.optIns[0]).toBe(true);
    expect(t.handAtFirstOptIn).toEqual(["keep"]);
  });

  test("opting in exhausts the Altar as the trigger's base cost (383.3.b.1)", async () => {
    const game = await flurry();
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    // Skip an order prompt if the engine ever offers one.
    if (game.decision()?.kind === "order") {
      const d = game.decision() as Extract<Decision, { kind: "order" }>;
      await game.p1.order(d.items.map((i) => i.key));
      await game.settle();
    }
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(game.state("altar").isReady).toBe(true);
    await game.p1.yes();
    expect(game.state("altar").isExhausted).toBe(true);
  });

  // Expected: after opting in (cost paid) the Altar item merely sits finalized on the chain; its
  // "draw 1, then put a card back" runs when it RESOLVES, i.e. only after both players pass.
  // Actual: the draw and the put-back prompt happen immediately at finalization.
  test.failing("BUG: the Altar's draw waits for RESOLUTION — right after opting in P1 has not drawn yet and P2 still gets priority (383.3, 337)", async () => {
    const game = await flurry();
    await game.settle();
    if (game.decision()?.kind === "order") {
      const d = game.decision() as Extract<Decision, { kind: "order" }>;
      await game.p1.order(d.items.map((i) => i.key));
      await game.settle();
    }
    const handBefore = game.p1.hand().length;
    await game.p1.yes();
    expect(game.p1.hand()).toHaveLength(handBefore);
    expect(game.decision()?.kind).toBe("action");
    expect(game.chain().some((c) => c.cardId === "altar")).toBe(true);
  });

  test("the second Altar trigger cannot be finalized: the Altar is already exhausted, so any second question is unacceptable and it never draws twice (383.3.b.1, 383.3.a.2)", async () => {
    const game = await flurry();
    const t = await drive(game, { pay: true, put: "keep" });
    expect(t.optIns[0]).toBe(true);
    expect(t.optIns.slice(1).every((ok) => ok === false)).toBe(true);
    expect(t.putBackOffered).toHaveLength(1); // exactly one Altar resolution
    expect(game.state("altar").isExhausted).toBe(true);
  });

  test("net result when P1 opts in: 3 draws (2 Deathknell + 1 Altar), 1 card put back → hand goes from 1 to 3, deck shrinks by 2, Altar exhausted", async () => {
    const game = await flurry();
    const deck = game.p1.deck().length;
    await drive(game, { dest: "bottom", pay: true, put: "keep" });
    expect(game.p1.hand()).toHaveLength(3);
    expect(game.p1.hand()).not.toContain("keep");
    expect(game.p1.deck()).toHaveLength(deck - 2);
    expect(game.p1.deck().at(-1)).toBe("keep");
    expect(game.state("altar").isExhausted).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("LIFO nuance: the Altar item that got paid is the OLDEST pending item (finalized first, 337.1.b) and so resolves LAST — both Deathknells draw first, then the Altar draws d3 and 'keep' put on TOP stays there", async () => {
    // rule 383.3.b.1 / 337.1.b: the exhaust cost is paid while the first Altar item is finalized;
    // the second copy can no longer be paid and leaves the chain. Bottom→top: Altar, DK, DK.
    const game = await flurry();
    await drive(game, { dest: "top", pay: true, put: "keep" });
    expect(game.p1.hand()).toHaveLength(3);
    expect(game.p1.hand().sort()).toEqual(["d1", "d2", "d3"]);
    expect(game.p1.deck()[0]).toBe("keep");
  });

  // Expected: if P1 orders the Altar item FIRST onto the chain it resolves LAST (LIFO): both
  // Deathknells draw d1 and d2, then the Altar draws d3 and the put-back pick offers all four of
  // keep/d1/d2/d3. Actual: no order prompt; the Altar always resolves early and offers 3 cards.
  test.failing("BUG: P1 may order the Altar to resolve last and then chooses the put-back from keep + d1 + d2 + d3 (383.3.d, LIFO)", async () => {
    const game = await flurry();
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    const d = game.decision();
    expect(d?.kind).toBe("order");
    if (d?.kind === "order") {
      const altarKeys = d.items.filter((i) => i.card === "altar").map((i) => i.key);
      const rest = d.items.filter((i) => i.card !== "altar").map((i) => i.key);
      await game.p1.order([...altarKeys, ...rest]); // appended first → resolves last
    }
    const t = await drive(game, { dest: "bottom", pay: true, put: "keep" });
    expect(t.putBackOffered[0]).toEqual(["d1", "d2", "d3", "keep"]);
    expect(game.p1.hand().sort()).toEqual(["d1", "d2", "d3"]);
  });

  // ---- contrast: decline ---------------------------------------------------------------------------

  test("contrast — P1 declines the 'you may': both Altar items are removed (383.3.a.2), P1 just draws 2 off the Sentries, nothing is put back, Altar stays READY", async () => {
    const game = await flurry();
    const deck = game.p1.deck().length;
    const t = await drive(game, { pay: false });
    expect(t.optIns.length).toBeGreaterThanOrEqual(1);
    expect(t.putBackOffered).toEqual([]);
    expect(game.state("altar").isReady).toBe(true);
    expect(game.p1.hand().sort()).toEqual(["d1", "d2", "keep"]);
    expect(game.p1.deck()).toHaveLength(deck - 2);
    expect(game.p1.deck()[0]).toBe("d3");
    expect(game.chain()).toEqual([]);
  });

  test("contrast — Altar already exhausted before the deaths: no acceptable question at all, only the two Deathknell draws happen", async () => {
    const game = await flurry({ exhausted: true });
    const t = await drive(game, { pay: true, put: "keep" });
    expect(t.optIns.every((ok) => ok === false)).toBe(true);
    expect(t.putBackOffered).toEqual([]);
    expect(game.p1.hand().sort()).toEqual(["d1", "d2", "keep"]);
  });
});
