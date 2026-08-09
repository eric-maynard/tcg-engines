/**
 * Interaction: Heedless Resurrection (unl-142-219) · Reaction spell · Chaos · 2 + [chaos]
 *     "As an additional cost to play this, kill a friendly unit. Play a unit from your trash that costs
 *      no more Energy and no more Power than the killed unit, ignoring its cost."
 *   × Cruel Patron (ogn-208-298) · Unit · Order · 4 · 6 Might
 *     "As an additional cost to play me, kill a friendly unit."
 *
 * Rules: 355.5 / 355.10.a (the trash is public → the unit to resurrect is Heedless's target), 357.2 (the
 * Heedless kill is paid in step 4 of ITS play), 354.2–354.3 (on resolution Patron becomes a Pending play
 * and waits for Heedless to finish), 355.2.a (location = base or a controlled battlefield), 356.1.b.1
 * ("ignoring its cost" zeroes base Energy/Power only), 356.1.b.3 + 356.2.a.1 (a MANDATORY additional cost
 * is still added and must be paid), 358.2 / 358.5 (unpayable → the play is undone), 359.2.c / 143.4
 * (enters exhausted), 128.6 a-contrario + 359.3.e.6 (public zone → "Play" is not optional), 419.3.b.
 *
 * Question: P1 controls Victim A (4-cost vanilla) and Bystander B; Cruel Patron is in P1's trash. P1 plays
 * Heedless Resurrection killing A and resurrecting Patron.
 *   (a) Must P1 STILL kill a second friendly unit (B) to finish playing Patron, when is it chosen relative
 *       to Heedless's own kill, and can A serve for both?  → Yes; A dies first as Heedless's cost, Patron's
 *       victim is chosen only when Patron is finalized after Heedless resolved; A is long dead by then.
 *   (b) Only A on board: Heedless is castable, A dies, but Patron's cost cannot be paid → play undone,
 *       Patron back in the trash, nothing refunded.
 *   (c) No opt-out: "Play" from a public zone is compulsory unless impossible.
 *   (d) Contrast: Patron from hand — same kill + full 4 energy, only on P1's turn; Heedless does it all at
 *       Reaction speed, even on P2's turn.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HEEDLESS = "unl-142-219";
const CRUEL_PATRON = "ogn-208-298";
const DISCIPLINE = "ogn-058-298"; // P2's 2-cost spell, only used to open a chain on P2's turn

const VICTIM_A = { energyCost: 4, might: 4, name: "Victim A" } as const;
const BYSTANDER = { energyCost: 1, might: 1, name: "Bystander" } as const;

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1's turn, exactly 2 + [chaos]. P1: Victim A (4) + Bystander B (1) in base, Cruel Patron in trash,
 * Heedless in hand. P2: one enemy unit in base (never a kill candidate). `withC` adds a second bystander so
 * Patron's kill is a real choice; `withBf` gives P1 a controlled battlefield so the location is a choice.
 */
function board(opts: { withB?: boolean; withC?: boolean; withBf?: boolean } = {}) {
  let s = scenario().resources(P1, { energy: 2, power: { chaos: 1 } });
  if (opts.withBf) {
    s = s.battlefield("bf1", { controller: P1 });
  }
  s = s.unit(P1, "base", VICTIM_A, "victimA");
  if (opts.withB !== false) {
    s = s.unit(P1, "base", { ...BYSTANDER, name: "Bystander B" }, "bystB");
  }
  if (opts.withC) {
    s = s.unit(P1, "base", { ...BYSTANDER, name: "Bystander C" }, "bystC");
  }
  return s
    .unit(P2, "base", { might: 2, name: "Enemy" }, "enemy")
    .trash(P1, CRUEL_PATRON, "patron")
    .hand(P1, HEEDLESS, "hr");
}

/** Cast Heedless killing A, let it resolve, and name Patron as the unit to play from the trash. */
async function heedlessIntoPatron(game: Game): Promise<void> {
  await game.p1.cast("hr", { sacrifice: "victimA" });
  await game.settle();
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("patron");
  }
}

describe("Heedless Resurrection × Cruel Patron — the resurrected unit's own mandatory kill (356.1.b.3)", () => {
  // ── (a) two kills for one Patron ───────────────────────────────────────────────────────────

  test("(a) Heedless's own cost: only Victim A (4) can be sacrificed to reach the 4-cost Patron; A dies at play time while Heedless waits on the chain and Patron is still in the trash (357.2)", async () => {
    const game = await board().build();
    const sac = game.p1.option("cast", "hr")?.fields.find((f) => f.arg === "sacrifice");
    expect(sac?.required).toBe(true);
    expect(sac?.options ?? []).toEqual(["victimA"]); // B (1-cost) could not resurrect a 4-cost unit; enemy never
    await game.p1.cast("hr", { sacrifice: "victimA" });
    expect(game.zoneOf("victimA")).toBe("trash");
    expect(game.zoneOf("patron")).toBe("trash");
    expect(game.zoneOf("bystB")).toBe("base");
    expect(game.chain().map((c) => c.cardId)).toEqual(["hr"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  });

  test("(a) on resolution Patron is the unit named from P1's trash; it becomes a pending play on the chain only after Heedless itself has finished and gone to the trash (354.2–354.3)", async () => {
    const game = await board({ withC: true }).build();
    await game.p1.cast("hr", { sacrifice: "victimA" });
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toEqual(["patron"]);
    await game.p1.pick("patron");
    expect(game.zoneOf("hr")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["patron"]);
    expect(game.zoneOf("patron")).not.toBe("base"); // still being finalized — its cost is unpaid
  });

  test("(a) 'ignoring its cost' does NOT waive the mandatory kill: finalizing Patron asks P1 which friendly unit to kill — B or C; A (already dead) and the enemy unit are not candidates; no decline (356.2.a.1)", async () => {
    const game = await board({ withC: true }).build();
    await heedlessIntoPatron(game);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, min: 1, allowDecline: false });
    expect(d?.kind === "pick" ? d.source?.cardId : undefined).toBe("patron");
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["bystB", "bystC"]);
    expect(offered).not.toContain("victimA");
    expect(offered).not.toContain("enemy");
    await expect(game.p1.pick("victimA")).rejects.toThrow(); // A cannot serve twice
    await game.p1.pick("bystC");
    await game.settle();
    expect(game.zoneOf("bystC")).toBe("trash");
    expect(game.zoneOf("bystB")).toBe("base");
    expect(game.zoneOf("patron")).toBe("base");
  });

  test("(a) net result with a single bystander: A AND B dead, a free 6-Might Cruel Patron in P1's base, exhausted; nothing beyond 2 + [chaos] was paid (356.1.b.1, 359.2.c)", async () => {
    const game = await board().build();
    await heedlessIntoPatron(game);
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.zoneOf("victimA")).toBe("trash");
    expect(game.zoneOf("bystB")).toBe("trash");
    expect(game.zoneOf("hr")).toBe("trash");
    expect(game.zoneOf("patron")).toBe("base");
    expect(game.state("patron")).toMatchObject({ controller: P1, isExhausted: true, might: 6 });
    expect(game.p1.units()).toEqual(["patron"]);
    expect(game.zoneOf("enemy")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(a) Patron's location is chosen by P1 during its own finalization: base or a battlefield P1 controls (355.2.a)", async () => {
    const game = await board({ withBf: true }).build();
    await heedlessIntoPatron(game);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    const where = d?.kind === "pick" ? d.options.map((o) => o.zone ?? o.key).sort() : [];
    expect(where).toEqual(["base", "battlefield-bf1"]);
    await game.p1.pick("battlefield-bf1");
    await game.settle(); // B is the only kill candidate → bound without asking
    expect(game.locationOf("patron")).toBe("bf1");
    expect(game.state("patron").isExhausted).toBe(true);
    expect(game.zoneOf("bystB")).toBe("trash");
  });

  // ── (b) only A: Patron's cost is unpayable ─────────────────────────────────────────────────

  test("(b) with only A on board Heedless is still castable (A alive, Patron in trash); A dies, but Patron's kill cannot be paid → the play is undone: Patron back in P1's trash, Heedless in trash, nothing refunded (358.2, 358.5)", async () => {
    const game = await board({ withB: false }).build();
    expect(game.p1.can("cast", "hr")).toBe(true);
    expect(game.p1.option("cast", "hr")?.fields.find((f) => f.arg === "sacrifice")?.options ?? []).toEqual(["victimA"]);
    await heedlessIntoPatron(game);
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.zoneOf("victimA")).toBe("trash"); // a paid cost is never refunded
    expect(game.zoneOf("patron")).toBe("trash"); // never played
    expect(game.zoneOf("hr")).toBe("trash"); // Heedless did resolve
    expect(game.p1.units()).toEqual([]);
    expect(game.zoneOf("enemy")).toBe("base"); // an enemy unit can never pay a "friendly" kill
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // ── (c) no voluntary opt-out ───────────────────────────────────────────────────────────────

  // Expected (359.3.e.6, 128.6 a-contrario, 355.10.a.1): Heedless says "Play", the trash is PUBLIC, so P1
  // cannot simply decline to play Patron once Heedless resolves — the resolution choice must be compulsory
  // (min 1, no decline) whenever a legal unit exists. Actual: the engine surfaces an optional
  // reveal-and-pick ("… or decline", min 0, allowDecline true) and accepts a decline, leaving Patron in the
  // trash and B alive.
  test.failing("BUG: (c) the engine lets P1 decline to play Patron after Heedless resolves — 'Play a unit from your trash' from a public zone is not optional (359.3.e.6, 128.6)", async () => {
    const game = await board().build();
    await game.p1.cast("hr", { sacrifice: "victimA" });
    await game.settle();
    const d = game.decision();
    if (d?.kind === "pick") {
      expect(d).toMatchObject({ allowDecline: false, min: 1 });
      await expect(game.p1.decline()).rejects.toThrow();
    }
    // Whether or not a prompt was shown, the only legal end state is Patron played and B dead.
    await heedlessIntoPatron(game);
    await game.settle();
    expect(game.zoneOf("patron")).toBe("base");
    expect(game.zoneOf("bystB")).toBe("trash");
  });

  // ── (d) contrast: Patron from hand / Heedless at Reaction speed ────────────────────────────

  test("(d) Cruel Patron from hand: the same mandatory kill (A or B offered, enemy never) PLUS the full 4 energy; killing B leaves A alive", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .unit(P1, "base", VICTIM_A, "victimA")
      .unit(P1, "base", { ...BYSTANDER, name: "Bystander B" }, "bystB")
      .unit(P2, "base", { might: 2, name: "Enemy" }, "enemy")
      .hand(P1, CRUEL_PATRON, "patron")
      .build();
    const sac = game.p1.option("play", "patron")?.fields.find((f) => f.arg === "sacrifice");
    expect(sac?.required).toBe(true);
    expect([...(sac?.options ?? [])].sort()).toEqual(["bystB", "victimA"]);
    await expect(game.p1.play("patron", { sacrifice: "enemy" })).rejects.toThrow();
    await game.p1.play("patron", { sacrifice: "bystB" });
    await game.settle();
    expect(game.zoneOf("bystB")).toBe("trash");
    expect(game.zoneOf("victimA")).toBe("base");
    expect(game.zoneOf("patron")).toBe("base");
    expect(game.state("patron").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(0); // 4 paid — nothing is ignored from hand

    const poor = await scenario().resources(P1, { energy: 3 }).unit(P1, "base", VICTIM_A, "victimA").hand(P1, CRUEL_PATRON, "patron").build();
    expect(poor.p1.can("play", "patron")).toBe(false);
  });

  test("(d) from hand Patron is NOT playable on P2's turn; Heedless (Reaction) resurrects it there anyway — in response to P2's spell, A then B die and Patron lands exhausted in P1's base while it is still P2's turn", async () => {
    const fromHand = await scenario()
      .active(P2)
      .resources(P1, { energy: 4 })
      .unit(P1, "base", VICTIM_A, "victimA")
      .unit(P1, "base", { ...BYSTANDER, name: "Bystander B" }, "bystB")
      .hand(P1, CRUEL_PATRON, "patron")
      .build();
    expect(fromHand.p1.can("play", "patron")).toBe(false);

    const game = await board()
      .active(P2)
      .resources(P2, { energy: 2, power: { calm: 1 } })
      .hand(P2, DISCIPLINE, "disc")
      .build();
    expect(game.p1.can("cast", "hr")).toBe(false); // P2's Open main phase: no Reaction window yet
    await game.p2.cast("disc", { targets: "enemy" });
    await game.p2.passPriority();
    expect(game.p1.can("cast", "hr")).toBe(true);
    await game.p1.cast("hr", { sacrifice: "victimA" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["disc", "hr"]);
    expect(game.zoneOf("victimA")).toBe("trash");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("patron");
    }
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("bystB")).toBe("trash");
    expect(game.zoneOf("patron")).toBe("base");
    expect(game.state("patron")).toMatchObject({ controller: P1, isExhausted: true, might: 6 });
    expect(game.zoneOf("hr")).toBe("trash");
    expect(game.zoneOf("disc")).toBe("trash"); // P2's spell resolved afterwards as usual
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });
});
