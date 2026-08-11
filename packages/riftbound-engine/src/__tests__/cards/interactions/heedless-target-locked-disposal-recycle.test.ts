/**
 * Interaction: Heedless Resurrection's trash target is chosen and LOCKED as it is played — so a Disposal Order in
 * response can strand it.
 *   × Heedless Resurrection (unl-142-219) · Spell · Chaos · 2+[chaos] · Reaction
 *     "As an additional cost to play this, kill a friendly unit. Play a unit from your trash that costs no more
 *      Energy and no more Power than the killed unit, ignoring its cost."                              — P1
 *   × Disposal Order (unl-103-219) · Spell · Body · 2 · Reaction
 *     "Choose one — Choose up to 3 cards from opponents' trashes. Their owners recycle them. / Draw 1." — P2
 *   × Sprite token (unl-t07) · 3 Might, cost 0, [Temporary]                                            — P1's board
 *
 * Rules: 355.5 / 355.8 / 355.10.a (the trash is PUBLIC → "a unit from your trash" is a TARGET chosen in step 2 of
 * playing Heedless), 355.15 (locked), 355.16 / 357.3 (no choice / payment that deterministically breaks a later
 * step), 356.2.a.1 (mandatory additional cost), 357.2 (non-standard costs are paid in step 4 — before anyone gets
 * priority), 358.1 / 358.5, 359.3.e.2 / 359.3.e.5 (a target that left its zone is illegal → its instruction can't
 * be followed), 356.1.b.1 (ignoring cost → 0), 354.3 (the played unit waits for Heedless to finish), 355.2.a
 * (location), 359.2.c (enters exhausted), 419.4.a.
 *
 * Position: P1's turn, Open. P1: exactly 2 energy + 1 chaos; board = Sprite token (0), Mid (3), Big (6+[fury]) in
 * base; trash = T2 (2), T5 (5), T7 (7), T5F2 (5+[fury][fury]); Heedless in hand. P2: Disposal Order + 2 energy.
 *
 * Question / Expected:
 *  (a) The trash unit is chosen WHILE PUTTING HEEDLESS ON THE CHAIN (before the kill, before P2's window), from
 *      {T2, T5} only — T7 (> Big's 6) and T5F2 (2 fury pips > Big's 1) are absent (355.16).
 *  (b) Target T5 → kill options {Big}; target T2 → {Mid, Big}; the Sprite is never a legal sacrifice here (no trash
 *      unit costs ≤ 0). The kill and 2+[chaos] are paid immediately — Big is in the trash before P2 gets priority —
 *      and the finalized chain item publicly shows target = T5.
 *  (c) P1: T5 / kill Big. P2 responds with Disposal Order recycling T5 only. Heedless resolves: its only target left
 *      the trash → NOTHING is played, no re-pick (not Big, not T2); Heedless → trash; Big stays in trash; T5 at the
 *      bottom of P1's deck; P1 is out 2 energy + chaos + Big for nothing.
 *  (d) P2 passes instead → T5 is played to P1's base, exhausted, for 0; Heedless → trash.
 *  (e) Board = Sprite only, trash = {T2}: Heedless is NOT a legal play. Add a 0-cost unit Z to the trash → legal:
 *      target {Z}, kill {Sprite} (the token ceases to exist), Z ends up in base.
 */
import { describe, expect, test } from "bun:test";
import type { Game, Seat } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HEEDLESS = "unl-142-219";
const DISPOSAL_ORDER = "unl-103-219";
const SPRITE = "unl-t07";

const MID = { energyCost: 3, might: 3, name: "Mid" } as const;
const BIG = { energyCost: 6, might: 6, name: "Big", powerCost: ["fury"] } as const;
const T2 = { energyCost: 2, might: 2, name: "T2" } as const;
const T5 = { energyCost: 5, might: 5, name: "T5" } as const;
const T7 = { energyCost: 7, might: 7, name: "T7" } as const;
const T5F2 = { energyCost: 5, might: 5, name: "T5F2", powerCost: ["fury", "fury"] } as const;
const ZERO = { energyCost: 0, might: 1, name: "Zero Z" } as const;

function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .resources(P2, { energy: 2 })
    .unit(P1, "base", SPRITE, "sprite")
    .unit(P1, "base", MID, "mid")
    .unit(P1, "base", BIG, "big")
    .unit(P2, "base", { might: 2, name: "Enemy Bystander" }, "enemy")
    .trash(P1, T2, "t2")
    .trash(P1, T5, "t5")
    .trash(P1, T7, "t7")
    .trash(P1, T5F2, "t5f2")
    .hand(P1, HEEDLESS, "hr")
    .hand(P2, DISPOSAL_ORDER, "disposal");
}

/** Sprite-only board; trash = {T2} (+ optionally the 0-cost Z). */
function spriteOnly(opts: { withZero?: boolean } = {}) {
  let s = scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .unit(P1, "base", SPRITE, "sprite")
    .trash(P1, T2, "t2")
    .hand(P1, HEEDLESS, "hr");
  if (opts.withZero) {
    s = s.trash(P1, ZERO, "zero");
  }
  return s;
}

function field(game: Game, seat: Seat, alias: string, name: string) {
  return game.seat(seat).option("cast", alias)?.fields.find((f) => f.name === name || f.arg === name);
}

function offered(game: Game, seat: Seat, alias: string, name: string): string[] {
  return [...new Set((field(game, seat, alias, name)?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : v == null ? [] : [v]) as string[]))].sort();
}

/** (target, sacrifice) pairs the cast option enumerates as legal variants. */
function pairs(game: Game): string[] {
  const opt = game.p1.option("cast", "hr");
  return (opt?.variants ?? [])
    .map((v) => {
      const p = v.params as { targets?: readonly string[]; sacrificeId?: string };
      return `${(p.targets ?? ["?"]).join("+")}/${p.sacrificeId ?? "?"}`;
    })
    .sort();
}

/**
 * Cast Heedless naming T5 as the trash unit and Big as the kill. The rules take the target at play time; if the
 * engine's cast option has no `targets` field (it defers the pick to resolution) fall back to naming only the kill,
 * so the downstream facets can still be exercised — the timing itself is pinned by the (a) tests.
 */
async function castHeedlessT5KillBig(game: Game): Promise<void> {
  if (field(game, P1, "hr", "targets")) {
    await game.p1.cast("hr", { sacrifice: "big", targets: "t5" });
  } else {
    await game.p1.cast("hr", { sacrifice: "big" });
  }
}

/** If the engine is (wrongly) asking for the trash unit at resolution, name `card` so the line can continue. */
async function pickIfAskedAtResolution(game: Game, card: string): Promise<void> {
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1 && d.source?.cardId === "hr") {
    await game.p1.pick(card);
  }
}

describe("Heedless Resurrection — trash target locked at play time × Disposal Order", () => {
  // ── (a) WHEN is the trash unit chosen, and from what set ────────────────────────────────────

  // 355.5 / 355.10.a: the trash is public, so "a unit from your trash" is a target chosen in step 2 of playing the
  // spell — the cast option must carry a `targets` field. Engine: the option only has `sacrifice`; the unit is asked
  // for at RESOLUTION as "Pick a revealed card to play", after P2's reaction window (and hidden from P2 until then).
  test.failing("BUG: (a) the trash unit is a play-time TARGET (355.5 / 355.10.a) — the cast option has a `targets` field and it offers exactly {T2, T5}: T7 (7 > Big's 6) and T5F2 (2 fury > Big's 1) are absent, not merely rejected later (355.16)", async () => {
    const game = await board().build();
    expect(field(game, P1, "hr", "targets")).toBeDefined();
    expect(offered(game, P1, "hr", "targets")).toEqual(["t2", "t5"]);
    await expect(game.p1.cast("hr", { sacrifice: "big", targets: "t7" })).rejects.toThrow();
    expect(game.zoneOf("hr")).toBe("hand");
    await expect(game.p1.cast("hr", { sacrifice: "big", targets: "t5f2" })).rejects.toThrow();
    expect(game.zoneOf("hr")).toBe("hand");
  });

  // 355.15 + ruling 15742de493366d50: the opponent reacts KNOWING the target. Engine: the chain item has no targets.
  test.failing("BUG: (a/b) after P1 plays Heedless (T5, kill Big) the finalized chain item publicly shows target = T5 before P2 receives priority", async () => {
    const game = await board().build();
    await castHeedlessT5KillBig(game);
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "hr", controller: P1, targets: ["t5"] });
    // P2's view of the chain shows it too (public information)
    expect(game.p2.view().chain[0]?.targets).toEqual(["t5"]);
  });

  // ── (b) which units may pay the kill ────────────────────────────────────────────────────────

  test("(b) 356.2.a.1 / 357.3: the kill is REQUIRED, only friendly units are candidates, and the Sprite (cost 0) is never a legal sacrifice on this board — no trash unit costs ≤ 0/0 — while Mid and Big are; the enemy unit never is", async () => {
    const game = await board().build();
    const sac = field(game, P1, "hr", "sacrifice");
    expect(sac?.required).toBe(true);
    const units = offered(game, P1, "hr", "sacrifice");
    expect(units).toEqual(["big", "mid"]);
    expect(units).not.toContain("sprite");
    expect(units).not.toContain("enemy");
    await expect(game.p1.cast("hr", { sacrifice: "sprite" })).rejects.toThrow();
    expect(game.zoneOf("hr")).toBe("hand");
    expect(game.zoneOf("sprite")).toBe("base");
  });

  // 357.3: given the locked target, the kill may not deterministically strand it. Engine: no target at play time, so
  // the (target, kill) pairing cannot be expressed — only bare kills {mid, big} are enumerated.
  test.failing("BUG: (b) legal (target / kill) pairs are exactly T5/Big, T2/Mid, T2/Big — T5 cannot be paired with Mid (3 < 5) and nothing pairs with the Sprite (357.3 / 355.16)", async () => {
    const game = await board().build();
    expect(pairs(game)).toEqual(["t2/big", "t2/mid", "t5/big"]);
    await expect(game.p1.cast("hr", { sacrifice: "mid", targets: "t5" })).rejects.toThrow();
    expect(game.zoneOf("mid")).toBe("base");
  });

  test("(b) 357.2: the kill and 2+[chaos] are paid IMMEDIATELY as Heedless is played — Big is already in P1's trash and the pool is empty while Heedless waits on the chain; P1 (controller) holds priority first, then P2, who may answer with Disposal Order", async () => {
    const game = await board().build();
    await castHeedlessT5KillBig(game);
    expect(game.zoneOf("big")).toBe("trash");
    expect(game.zoneOf("mid")).toBe("base");
    expect(game.zoneOf("sprite")).toBe("base");
    expect(game.zoneOf("hr")).toBe("chain");
    expect(game.zoneOf("t5")).toBe("trash"); // chosen, not yet played
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["hr"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "disposal")).toBe(true);
  });

  // ── (c) Disposal Order recycles the locked target ───────────────────────────────────────────

  test("(c) Disposal Order (mode 1) offers P2 the cards in P1's trash — including T5 and the freshly killed Big; P2 recycles T5 only: LIFO, it resolves first → T5 goes to the BOTTOM of P1's main deck, Big is left in the trash, Heedless still pending", async () => {
    const game = await board().build();
    await castHeedlessT5KillBig(game);
    await game.p1.passPriority();
    const forP2 = offered(game, P2, "disposal", "targets");
    expect(forP2).toEqual(expect.arrayContaining(["t5", "big", "t2", "t7", "t5f2"]));
    await game.p2.cast("disposal", { mode: 0, targets: ["t5"] });
    expect(game.p2.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["hr", "disposal"]);
    expect(game.chain()[1]).toMatchObject({ controller: P2, mode: 0, targets: ["t5"] });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("disposal")).toBe("trash");
    expect(game.zoneOf("t5")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("t5"); // bottom
    expect(game.zoneOf("big")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["hr"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  // 359.3.e.2 / 359.3.e.5 + 355.15: T5 left the trash → illegal target → "play it" cannot be followed; targets are
  // never re-chosen, so neither Big (now in the trash) nor T2 may be taken instead. Heedless simply finishes and goes
  // to the trash. Engine: having deferred the choice, it now prompts "Pick a revealed card to play" offering T2
  // (min 1, no decline) — P1 dodges the Disposal Order entirely.
  test.failing("BUG: (c) Heedless then resolves doing NOTHING — no unit is played and P1 gets no re-pick (Big and T2 stay in the trash); Heedless → P1's trash; P1 is simply out 2 energy + [chaos] + Big", async () => {
    const game = await board().build();
    await castHeedlessT5KillBig(game);
    await game.p1.passPriority();
    await game.p2.cast("disposal", { mode: 0, targets: ["t5"] });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Disposal Order resolves
    await game.p1.passPriority();
    await game.p2.passPriority(); // Heedless resolves
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toEqual([]); // nobody is offered anything
    expect(d).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("hr")).toBe("trash");
    expect(game.zoneOf("t2")).toBe("trash");
    expect(game.zoneOf("big")).toBe("trash");
    expect(game.zoneOf("t5")).toBe("mainDeck");
    expect(game.p1.base().sort()).toEqual(["mid", "sprite"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } }); // nothing refunded
  });

  test("(c) whatever the engine asks next, the costs are gone for good: after Disposal Order resolved and both passed on Heedless, Big is still in the trash, T5 is in the deck, P1's pool is empty and Mid + Sprite are all that is left on P1's board", async () => {
    const game = await board().build();
    await castHeedlessT5KillBig(game);
    await game.p1.passPriority();
    await game.p2.cast("disposal", { mode: 0, targets: ["t5"] });
    await game.p2.passPriority();
    await game.p1.passPriority();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("big")).toBe("trash");
    expect(game.zoneOf("t5")).toBe("mainDeck");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.p1.base().sort()).toEqual(["mid", "sprite"]);
    // and in no case is Big (killed to pay for this very spell) or T5 (no longer in the trash) on offer
    const d = game.decision();
    const late = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(late).not.toContain("big");
    expect(late).not.toContain("t5");
    expect(late).not.toContain("t7");
    expect(late).not.toContain("t5f2");
  });

  // ── (d) NO-contrast: P2 passes ──────────────────────────────────────────────────────────────

  test("(d) P2 passes instead: Heedless resolves and T5 is PLAYED from the trash — it lands in P1's base (P1 controls no battlefield, 355.2.a), EXHAUSTED (359.2.c), for 0 (356.1.b.1 — the pool was already empty); Heedless → trash, Big stays dead, the rest of the trash untouched", async () => {
    const game = await board().build();
    await castHeedlessT5KillBig(game);
    await game.p1.passPriority();
    await game.p2.passPriority();
    await pickIfAskedAtResolution(game, "t5");
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.zoneOf("t5")).toBe("base");
    expect(game.state("t5")).toMatchObject({ controller: P1, isExhausted: true, might: 5, zone: "base" });
    expect(game.zoneOf("hr")).toBe("trash");
    expect(game.zoneOf("big")).toBe("trash");
    expect(game.zoneOf("t2")).toBe("trash");
    expect(game.zoneOf("t7")).toBe("trash");
    expect(game.zoneOf("t5f2")).toBe("trash");
    expect(game.p1.base().sort()).toEqual(["mid", "sprite", "t5"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.hand()).toContain("disposal");
    expect(game.violations()).toEqual([]);
  });

  // ── (e) edge: Sprite-only board ─────────────────────────────────────────────────────────────

  // 355.8 + 356.2.a.1 + 355.16: the only killable unit costs 0 and the only trash unit costs 2 — no (target, kill)
  // pair is legal, so Heedless cannot be played at all. Engine: offers the cast with sacrifice = Sprite.
  test("(e) board = Sprite only, trash = {T2}: Heedless Resurrection is NOT a legal play (no trash unit costs ≤ the Sprite's 0)", async () => {
    const game = await spriteOnly().build();
    expect(game.p1.can("cast", "hr")).toBe(false);
    await expect(game.p1.cast("hr", { sacrifice: "sprite" })).rejects.toThrow();
    expect(game.zoneOf("sprite")).toBe("base");
    expect(game.zoneOf("hr")).toBe("hand");
  });

  test("(e) add a 0-cost unit Z to the trash → legal: kill set = {Sprite}; the token is killed to pay (it ceases to exist), and Z — never T2 — is what comes back, into P1's base, exhausted", async () => {
    const game = await spriteOnly({ withZero: true }).build();
    expect(game.p1.can("cast", "hr")).toBe(true);
    expect(offered(game, P1, "hr", "sacrifice")).toEqual(["sprite"]);
    if (field(game, P1, "hr", "targets")) {
      expect(offered(game, P1, "hr", "targets")).toEqual(["zero"]);
      await game.p1.cast("hr", { sacrifice: "sprite", targets: "zero" });
    } else {
      await game.p1.cast("hr", { sacrifice: "sprite" });
    }
    expect(game.zoneOf("sprite")).toBe("gone");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    const d = game.decision();
    if (d?.kind === "pick") {
      expect(d.options.map((o) => o.card ?? o.key)).toEqual(["zero"]); // T2 (2 > 0) is not on offer
      await game.p1.pick("zero");
      await game.settle();
    }
    expect(game.zoneOf("zero")).toBe("base");
    expect(game.state("zero").isExhausted).toBe(true);
    expect(game.zoneOf("t2")).toBe("trash");
    expect(game.zoneOf("hr")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
