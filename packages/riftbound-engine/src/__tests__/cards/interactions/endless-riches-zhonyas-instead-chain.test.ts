/**
 * Interaction: Endless Riches (ven-022-166) · Gear · Fury · 5
 *     "… If a card would go to your trash from anywhere other than your Main Deck, banish it instead."
 *   × Zhonya's Hourglass (ogn-077-298) · Gear · Calm · 2
 *     "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × LeBlanc, Fragmented (unl-172-219) · Unit · Order · 3 Might · "[Deathknell] Draw 1. …"
 *
 * Question: P2 controls Endless Riches, a face-up Zhonya's Hourglass and LeBlanc (3 Might) at bf1.
 * P1 deals LeBlanc lethal spell damage. A kill is "board → trash" (428.1), so BOTH of P2's
 * replacements match her death: Zhonya's ("would die") and Endless Riches ("would go to your
 * trash"). (a) Is P2 prompted to order them? (b) Zhonya's first: LeBlanc saved, Hourglass "killed
 * instead" — is THAT replacing event itself replaced by Endless Riches so the Hourglass ends up
 * BANISHED (an "instead" chain)? (c) Endless Riches first: LeBlanc banished — can Zhonya's still
 * save her, does Deathknell draw? (d) Control without Zhonya's.
 *
 * Rules: 372 (same event, two replacements → controller of the affected object orders them),
 * 370.2 (a replacement applies once to an event OR to the events that replace it), 370.1.b,
 * 428.1 (kill = board → trash), 427.2.a (banish is not a kill), 808.1.d / 808.1.d.1 (Deathknell
 * needs "killed and sent to the trash"; a replaced death removes the trigger), 370.1.a.1, 369.1.
 *
 * Expected: (a) order decision for P2 over {Zhonya's, Endless Riches}. (b) Zhonya's first →
 * LeBlanc in base exhausted at 0 damage; the Hourglass's own board→trash is then replaced by
 * Endless Riches → Hourglass in BANISHMENT, P2 trash unchanged, no draw. (c) Riches first →
 * LeBlanc banished; no "would die" event remains so Zhonya's stays unspent; no draw. (d) No
 * Zhonya's → only Riches applies, no prompt: LeBlanc banished, hand unchanged.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";
import type { Decision } from "../../../harness";

const ENDLESS_RICHES = "ven-022-166";
const ZHONYAS = "ogn-077-298";
const LEBLANC = "unl-172-219";

/** Inline 1-energy action spell: deal 3 to a unit (exactly lethal on a 3-Might LeBlanc). */
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
};

function board(opts: { zhonyas: boolean }) {
  const s = scenario()
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", LEBLANC, "leblanc")
    .gear(P2, ENDLESS_RICHES, "riches")
    .hand(P1, BOLT, "bolt");
  return opts.zhonyas ? s.gear(P2, ZHONYAS, "zh") : s;
}

/** Cards named by a replacement-ordering prompt, whether surfaced as a pick or an order decision. */
function orderingChoices(d: Decision | null): string[] {
  if (d?.kind === "pick") {
    return d.options.map((o) => o.card ?? o.key);
  }
  if (d?.kind === "order") {
    return d.items.map((o) => o.card ?? o.key);
  }
  return [];
}

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** Answer the ordering prompt so that `first` is the replacement applied first. */
async function applyFirst(game: Game, first: string): Promise<void> {
  const d = game.decision();
  if (d?.kind === "order") {
    const keys = d.items.map((i) => i.key);
    const k = d.items.find((i) => i.card === first || i.key === first)?.key ?? first;
    await game.p2.order([k, ...keys.filter((x) => x !== k)]);
  } else {
    await game.p2.pick(first);
  }
  await game.settle();
}

describe("Endless Riches × Zhonya's Hourglass × LeBlanc — chained 'instead' replacements", () => {
  // ---- baseline ------------------------------------------------------------------------------

  test("baseline (no Riches, no Zhonya's): lethal 3 kills LeBlanc → trash, Deathknell draws 1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", LEBLANC, "leblanc")
      .hand(P1, BOLT, "bolt")
      .build();
    const hand = game.p2.hand().length;
    await game.p1.cast("bolt", { targets: "leblanc" });
    await game.settle();
    expect(game.zoneOf("leblanc")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(hand + 1);
  });

  // ---- (d) control: Endless Riches only ------------------------------------------------------

  // Expected (428.1, 571-style blanket replacement): the kill is board→trash, Endless Riches
  // replaces the trash destination with banishment; mandatory, single replacement → no prompt.
  // Actual: the leave-board path never consults the trash→banish replacement for kills, so
  // LeBlanc lands in the trash.
  test("(d) without Zhonya's, Endless Riches banishes the killed LeBlanc instead of trashing her — no prompt (428.1, 370.1.b)", async () => {
    const game = await board({ zhonyas: false }).build();
    await game.p1.cast("bolt", { targets: "leblanc" });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.actingSeat()).toBe(P1);
    expect(game.zoneOf("leblanc")).toBe("banishment");
    expect(game.p2.trash()).toEqual([]);
  });

  // Expected (808.1.d / 808.1.d.1): she was not "killed and sent to the trash" → Deathknell is
  // removed, P2 draws nothing. Actual: she goes to the trash and P2 draws 1.
  test("(d) without Zhonya's, a banished-instead LeBlanc does not Deathknell — P2's hand and deck unchanged (808.1.d.1)", async () => {
    const game = await board({ zhonyas: false }).build();
    const hand = game.p2.hand().length;
    const deck = game.p2.deck().length;
    await game.p1.cast("bolt", { targets: "leblanc" });
    await game.settle();
    expect(game.p2.hand()).toHaveLength(hand);
    expect(game.p2.deck()).toHaveLength(deck);
    expect(game.chain()).toEqual([]);
  });

  test("(d) Endless Riches itself is untouched by the kill and stays in P2's base", async () => {
    const game = await board({ zhonyas: false }).build();
    await game.p1.cast("bolt", { targets: "leblanc" });
    await game.settle();
    expect(game.zoneOf("riches")).toBe("base");
    expect(game.p2.gear()).toContain("riches");
    expect(game.zoneOf("bolt")).toBe("trash"); // P1's spell goes to P1's trash — Riches only reads "your trash"
    expect(game.p1.trash()).toContain("bolt");
  });

  // ---- (a) both replacements present: ordering prompt ----------------------------------------

  // Expected (372): one event (LeBlanc board→trash), two applicable replacements both controlled
  // by P2 who also controls LeBlanc → P2 is asked to order {Zhonya's, Endless Riches}.
  // Actual: Zhonya's is applied silently (LeBlanc recalled, Hourglass to trash); no prompt.
  test("(a) P2 is prompted to order Zhonya's Hourglass vs Endless Riches for LeBlanc's death (372)", async () => {
    const game = await board({ zhonyas: true }).build();
    await game.p1.cast("bolt", { targets: "leblanc" });
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    const d = game.decision();
    expect(d?.seat).toBe(P2);
    expect(["pick", "order"]).toContain(d?.kind as string);
    expect(orderingChoices(d).sort()).toEqual(["riches", "zh"]);
  });

  // ---- (b) Zhonya's first → Hourglass's own kill is redirected to banishment -----------------

  // Expected (370.1.b, 370.2): Zhonya's replaces the death with [kill Hourglass; heal/exhaust/
  // recall LeBlanc]. Endless Riches has not yet applied in this chain and "Hourglass board→your
  // trash" qualifies → Hourglass is BANISHED; P2's trash stays empty.
  test("(b) Zhonya's first — LeBlanc saved to base (exhausted, 0 damage) and the Hourglass is BANISHED, not trashed (370.2 'instead' chain)", async () => {
    const game = await board({ zhonyas: true }).build();
    await game.p1.cast("bolt", { targets: "leblanc" });
    await game.settle();
    expect(game.actingSeat()).toBe(P2);
    await applyFirst(game, "zh");
    expect(game.zoneOf("leblanc")).toBe("base");
    expect(game.state("leblanc").damage).toBe(0);
    expect(game.state("leblanc").isExhausted).toBe(true);
    expect(game.zoneOf("zh")).toBe("banishment");
    expect(game.p2.banishment()).toContain("zh");
    expect(game.p2.trash()).toEqual([]);
  });

  // The save half of (b) is observable today because the engine applies Zhonya's by default.
  test("(b) engine default (Zhonya's applied): LeBlanc is in P2's base, exhausted, fully healed, not in trash/banishment (370.1.b)", async () => {
    const game = await board({ zhonyas: true }).build();
    await game.p1.cast("bolt", { targets: "leblanc" });
    const r = await game.settle();
    if (r.reason === "unanswered" && game.actingSeat() === P2) {
      await applyFirst(game, "zh");
    }
    expect(game.zoneOf("leblanc")).toBe("base");
    expect(game.locationOf("leblanc")).toBe("base");
    expect(game.state("leblanc").damage).toBe(0);
    expect(game.state("leblanc").isExhausted).toBe(true);
    expect(game.p2.trash()).not.toContain("leblanc");
    expect(game.p2.banishment()).not.toContain("leblanc");
    expect(game.zoneOf("zh")).not.toBe("base"); // the Hourglass was spent
  });

  test("(b) Zhonya's-first save: the replaced death removes Deathknell — P2 draws nothing (808.1.d.1, 370.1.a.1)", async () => {
    const game = await board({ zhonyas: true }).build();
    const hand = game.p2.hand().length;
    const deck = game.p2.deck().length;
    await game.p1.cast("bolt", { targets: "leblanc" });
    const r = await game.settle();
    if (r.reason === "unanswered" && game.actingSeat() === P2) {
      await applyFirst(game, "zh");
    }
    expect(game.zoneOf("leblanc")).toBe("base");
    expect(game.p2.hand()).toHaveLength(hand);
    expect(game.p2.deck()).toHaveLength(deck);
    expect(game.chain()).toEqual([]);
  });

  // ---- (c) Endless Riches first → banish; Zhonya's cannot chain onto a banish ----------------

  // Expected (427.2.a, 370.2): Riches replaces board→trash with a banish; a banish is not a kill
  // so no "would die" event remains for Zhonya's → LeBlanc in banishment, Hourglass unspent in
  // base. Actual: no ordering prompt is offered, so this branch is unreachable (Zhonya's always
  // applies).
  test("(c) Endless Riches first — LeBlanc is banished and Zhonya's stays on the board unspent (427.2.a: banish is not a kill)", async () => {
    const game = await board({ zhonyas: true }).build();
    await game.p1.cast("bolt", { targets: "leblanc" });
    await game.settle();
    expect(game.actingSeat()).toBe(P2);
    await applyFirst(game, "riches");
    expect(game.zoneOf("leblanc")).toBe("banishment");
    expect(game.zoneOf("zh")).toBe("base");
    expect(game.p2.gear().sort()).toEqual(["riches", "zh"]);
    expect(game.p2.trash()).toEqual([]);
  });

  // Expected (808.1.d, 808.1.d.1): not "killed and sent to the trash" → no Deathknell draw.
  // Actual: branch unreachable (see above).
  test("(c) Endless Riches first — Deathknell does not resolve, P2's hand unchanged (808.1.d.1)", async () => {
    const game = await board({ zhonyas: true }).build();
    const hand = game.p2.hand().length;
    await game.p1.cast("bolt", { targets: "leblanc" });
    await game.settle();
    expect(game.actingSeat()).toBe(P2);
    await applyFirst(game, "riches");
    expect(game.zoneOf("leblanc")).toBe("banishment");
    expect(game.p2.hand()).toHaveLength(hand);
    expect(game.chain()).toEqual([]);
  });

  test("in every branch P1's spell resolved normally: Bolt in P1's trash, P1 at 0 energy, no invariant violations", async () => {
    for (const zhonyas of [false, true]) {
      const game = await board({ zhonyas }).build();
      await game.p1.cast("bolt", { targets: "leblanc" });
      const r = await game.settle();
      if (r.reason === "unanswered" && game.actingSeat() === P2) {
        await applyFirst(game, "zh");
      }
      expect(game.zoneOf("bolt")).toBe("trash");
      expect(game.p1.energy()).toBe(0);
      expect(game.violations()).toEqual([]);
    }
  });
});
