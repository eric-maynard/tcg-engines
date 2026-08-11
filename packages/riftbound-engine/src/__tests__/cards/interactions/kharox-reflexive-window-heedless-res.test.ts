/**
 * Interaction: Kharox (ven-114-166) · Unit · Chaos · 6 · 5 Might
 *     "[Empower] [6][chaos][chaos]. When I become [Empowered], choose an opponent. They [Burn 3]. Then you
 *      may do this: Choose a unit in their trash and play it, ignoring its cost."
 *   × Sanction (ven-035-166) · Reaction spell · Calm · 3 + [calm]
 *     "Choose one — Empower a unit. Disempower it at end of turn. / Disempower a unit that's [Empowered]…"
 *   × Heedless Resurrection (unl-142-219) · Reaction spell · Chaos · 2 + [chaos]
 *     "As an additional cost to play this, kill a friendly unit. Play a unit from your trash that costs no
 *      more Energy and no more Power than the killed unit, ignoring its cost."
 *
 * Question: P1's turn. P1: Kharox (not Empowered) in base + Sanction. P2: vanilla F (3-cost, 3 Might) in
 * base, Heedless Resurrection with [2]+[chaos]; P2's deck top→ [U (2-cost 2-Might unit), spell S1, spell S2];
 * P2's trash already holds an older unit W. P1 casts Sanction mode 1 on Kharox.
 *   (a) How many separate chain items / reaction windows, and what is in P2's trash at each?
 *   (b) When does P1 decide the "you may" and pick the unit — before or after the Burn 3 — and is W legal?
 *   (c) P1 picks U; P2 responds with Heedless Resurrection killing F and playing U from its own trash. What
 *       does Kharox's reflexive item do on resolution?
 *   (d) P2 passes instead — where is U, who controls/owns it, where does it go when it dies?
 *   (e) P2's top three are all spells and the trash has no unit — what happens to the "do this"?
 *
 * Rules: 387.1 / 387.2 ("do this:" = Reflexive Trigger), 388.1 (a NEW pending item is created), 401.2 /
 * 354.3 (it waits for the resolving effect to finish), 402.1 (leading "you may" decided at finalization),
 * 402.2 (choices made at finalization), 402.4 (no legal choice → removed, never finalized), 359.3.e.2
 * (target that changed zones is illegal → nothing happens), 441.2.a (becoming Empowered is an event),
 * 127.1 (owner = who brought the card), 390.2 (Sanction's "at end of turn" is a delayed trigger).
 *
 * Expected:
 *   (a) three respondable items: Sanction; Kharox's "when I become Empowered" trigger (window #1, before any
 *       burn — P2's trash = {W}); after it resolves (U, S1, S2 burned) a NEW reflexive item on which P1 says
 *       yes/no and picks "a unit in their trash" (W legal, U legal, spells not) — then window #2.
 *   (c) Heedless resolves first: F dies (cost), U is played from P2's trash into P2's base exhausted. Kharox's
 *       reflexive item then finds its chosen card gone from the trash → nothing is played, no re-pick of W.
 *   (d) U enters P1's base under P1's control, owned by P2; when it dies it goes to P2's trash.
 *   (e) no unit in P2's trash → the reflexive item is removed without a prompt; nothing is played.
 *   Always: Kharox is disempowered at end of turn by Sanction.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const KHAROX = "ven-114-166";
const SANCTION = "ven-035-166";
const HEEDLESS = "unl-142-219";

const UNIT_U = { energyCost: 2, might: 2, name: "Unit U" } as const;
const UNIT_F = { energyCost: 3, might: 3, name: "Unit F" } as const;
const UNIT_W = { energyCost: 2, might: 2, name: "Old Unit W" } as const;
const SPELL_S = { abilities: [], cardType: "spell", energyCost: 1, name: "Spell S", timing: "action" } as const;
/** 0-cost "Deal 5 to a unit" — only used to kill U later in the turn for the owner's-trash facet. */
const FINISHER = {
  abilities: [{ effect: { amount: 5, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Finisher",
  timing: "action",
} as const;

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1's turn. P1: Kharox in base, Sanction (+ a 0-cost finisher) in hand, exactly 3 + [calm].
 * P2: F (3/3) in base, Heedless in hand, exactly 2 + [chaos]; trash = {W}; deck top = U, S1, S2 (then filler).
 * `spellsOnly` makes the top three S0, S1, S2 and empties the trash.
 */
function board(opts: { spellsOnly?: boolean } = {}) {
  const s = scenario()
    .resources(P1, { energy: 3, power: { calm: 1 } })
    .resources(P2, { energy: 2, power: { chaos: 1 } })
    .unit(P1, "base", KHAROX, "kharox")
    .unit(P2, "base", UNIT_F, "f")
    .hand(P1, SANCTION, "sanction")
    .hand(P1, FINISHER, "fin")
    .hand(P2, HEEDLESS, "hr");
  return opts.spellsOnly
    ? s.deck(P2, [SPELL_S, SPELL_S, SPELL_S], ["s0", "s1", "s2"])
    : s.trash(P2, UNIT_W, "w").deck(P2, [UNIT_U, SPELL_S, SPELL_S], ["u", "s1", "s2"]);
}

/** P1 casts Sanction (mode 1: Empower) on Kharox; both pass → it resolves and Kharox's trigger is on the chain with P1 holding priority. */
async function sanctionResolved(game: Game): Promise<void> {
  await game.p1.cast("sanction", { mode: 0, targets: "kharox" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sanction", controller: P1, mode: 0, targets: ["kharox"] })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
}

/** …then both pass on Kharox's trigger so it resolves (Burn 3) and P1 is looking at the "you may … choose a unit in their trash" prompt. */
async function burned(game: Game): Promise<void> {
  await sanctionResolved(game);
  await game.p1.passPriority();
  await game.p2.passPriority();
}

const pickOptions = (game: Game) => {
  const d = game.decision();
  return d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
};

describe("Kharox empowered by Sanction — trigger, Burn 3, reflexive 'do this', and Heedless Resurrection in the window", () => {
  // ── (a) item #1: Sanction ─────────────────────────────────────────────────────────────────

  test("(a) item #1 — Sanction sits on the chain and P2 gets a reaction window on it (Heedless is castable there); P1 paid 3 + [calm]", async () => {
    const game = await board().build();
    await game.p1.cast("sanction", { mode: 0, targets: "kharox" });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "hr")).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.state("kharox").isEmpowered).toBe(false); // not yet
  });

  test("(a) item #2 — Sanction resolves: Kharox becomes Empowered (441.2.a) and its 'When I become Empowered' trigger is a chain item controlled by P1; window #1 opens (P1, then P2) BEFORE any burn — P2's trash is still just {W}, deck untouched", async () => {
    const game = await board().build();
    const p2Deck = game.p2.deck();
    await sanctionResolved(game);
    expect(game.zoneOf("sanction")).toBe("trash");
    expect(game.state("kharox").isEmpowered).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kharox", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p2.trash()).toEqual(["w"]);
    expect(game.p2.deck()).toEqual(p2Deck);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "hr")).toBe(true);
    expect(game.p2.trash()).toEqual(["w"]); // still nothing burned while P2 holds priority
  });

  test("(a) the trigger resolves: P2 Burns exactly its top three — U, S1, S2 go to P2's trash (now {W, U, S1, S2}); P1's deck is untouched", async () => {
    const game = await board().build();
    const p1Deck = game.p1.deck().length;
    const p2Deck = game.p2.deck().length;
    await burned(game);
    expect(game.p2.trash().sort()).toEqual(["s1", "s2", "u", "w"]);
    expect(game.p2.deck()).toHaveLength(p2Deck - 3);
    expect(game.p2.deck()).not.toContain("u");
    expect(game.p1.deck()).toHaveLength(p1Deck);
  });

  // ── (b) the "you may / choose a unit in their trash" happens AFTER the burn ───────────────

  test("(b) P1 is asked only AFTER the Burn 3, may decline ('you may'), and is offered every UNIT in P2's trash — the pre-existing W as well as the freshly burned U — but neither spell", async () => {
    const game = await board().build();
    await burned(game);
    const d = game.decision();
    expect(d?.seat).toBe(P1);
    expect(["pick", "yes-no"]).toContain(d?.kind as string);
    if (d?.kind === "yes-no") {
      await game.p1.yes();
    }
    const pick = game.decision();
    expect(pick).toMatchObject({ kind: "pick", seat: P1 });
    expect(pickOptions(game)).toEqual(["u", "w"]);
    if (pick?.kind === "pick" && d?.kind === "pick") {
      expect(pick.allowDecline).toBe(true);
    }
  });

  // Expected (387.1 / 388.1 / 401.2): "Then you may do this:" is a Reflexive Trigger — once the Burn-3 item
  // finishes, a NEW Kharox item is added to the chain and P1's yes/no + trash pick are that item's
  // finalization choices, made while it sits on the chain.
  // Actual: the burn item resolves the "then you may play" inline — the pick is asked with an EMPTY chain
  // and the chosen unit is played immediately; no second Kharox item ever exists.
  test("(a/b) item #3 — after the burn a NEW Kharox reflexive item is on the chain while P1 makes its 'you may' / trash choice (387.1, 388.1, 402.1–402.2)", async () => {
    const game = await board().build();
    await burned(game);
    expect(game.p2.trash()).toContain("u"); // burn already done
    expect(game.decision()?.seat).toBe(P1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kharox", controller: P1, triggered: true })]);
  });

  // Expected: after P1 picks U the reflexive item is finalized (choice: U, still in P2's trash) and priority
  // passes P1 → P2 — window #2, where P2 may cast Heedless Resurrection.
  // Actual: picking U plays it into P1's base at once; the chain is empty and it is P1's open main phase.
  test("(a) window #2 — after P1 picks U the finalized reflexive item (choice U) waits on the chain, U is still in P2's trash, and P2 gets priority to respond", async () => {
    const game = await board().build();
    await burned(game);
    if (game.decision()?.kind === "yes-no") {
      await game.p1.yes();
    }
    await game.p1.pick("u");
    expect(game.zoneOf("u")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kharox", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "hr")).toBe(true);
  });

  // ── (c) Heedless Resurrection snatches U in window #2 ────────────────────────────────────

  // Expected: in window #2 P2 casts Heedless (kill F: 3/0 ≥ U's 2/0), resolves first (LIFO): U is played from
  // P2's trash into P2's base, exhausted; F is in P2's trash. Kharox's item then resolves: its chosen card left
  // the trash (359.3.e.2) → nothing is played and P1 is NOT re-offered W. P1's base = Kharox only.
  // Actual: there is no window #2 (see above) — U is already in P1's base before P2 could act.
  test("(c) P2 answers the U-pick with Heedless Resurrection (kill F, replay U): U ends in P2's base exhausted, F in P2's trash, Kharox's item does nothing and offers no re-pick; W stays in the trash", async () => {
    const game = await board().build();
    await burned(game);
    if (game.decision()?.kind === "yes-no") {
      await game.p1.yes();
    }
    await game.p1.pick("u");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    if (game.decision()?.seat === P1) {
      await game.p1.passPriority();
    }
    await game.p2.cast("hr", { sacrifice: "f", targets: "u" }); // rule 355.5: named as it is played
    expect(game.zoneOf("f")).toBe("trash"); // paid at play time
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Heedless resolves
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      expect(pickOptions(game)).toContain("u");
      await game.p2.pick("u");
    }
    await game.settle(); // U's pending play finalizes, then Kharox's item resolves into nothing
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("u")).toBe("base");
    expect(game.state("u")).toMatchObject({ controller: P2, isExhausted: true, owner: P2 });
    expect(game.p2.units("base")).toContain("u");
    expect(game.p1.units("base")).toEqual(["kharox"]);
    expect(game.zoneOf("w")).toBe("trash");
    expect(game.p2.trash().sort()).toEqual(["f", "hr", "s1", "s2", "w"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // no re-pick prompt
  });

  test("(c′) contrast — Heedless in window #1 (BEFORE the burn) can only reach W: F dies, W is replayed to P2's base; the burn then still happens and Kharox may even pick the freshly killed F (any unit in their trash)", async () => {
    const game = await board().build();
    await sanctionResolved(game);
    await game.p1.passPriority();
    const sac = game.p2.option("cast", "hr")?.fields.find((fld) => fld.arg === "sacrifice");
    expect(sac?.options ?? []).toEqual(["f"]);
    await game.p2.cast("hr", { sacrifice: "f" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["kharox", "hr"]);
    expect(game.zoneOf("f")).toBe("trash");
    await game.p2.passPriority();
    await game.p1.passPriority(); // Heedless resolves
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      expect(pickOptions(game)).toEqual(["w"]); // U is not in the trash yet
      await game.p2.pick("w");
    }
    expect(game.zoneOf("w")).toBe("base");
    expect(game.state("w")).toMatchObject({ controller: P2, isExhausted: true });
    expect(game.chain().map((c) => c.cardId)).toEqual(["kharox"]);
    // both pass on Kharox's trigger → Burn 3, then the trash pick
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.p2.trash().sort()).toEqual(["f", "hr", "s1", "s2", "u"]);
    if (game.decision()?.kind === "yes-no") {
      await game.p1.yes();
    }
    expect(pickOptions(game)).toEqual(["f", "u"]);
  });

  // ── (d) P2 passes: U joins P1 ────────────────────────────────────────────────────────────

  test("(d) P2 passes: P1 plays U from P2's trash ignoring its cost — U enters P1's base under P1's CONTROL, still OWNED by P2 (127.1), exhausted; P1 paid nothing more; W, S1, S2 stay in P2's trash", async () => {
    const game = await board().build();
    await burned(game);
    if (game.decision()?.kind === "yes-no") {
      await game.p1.yes();
    }
    await game.p1.pick("u");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("u")).toBe("base");
    expect(game.state("u")).toMatchObject({ controller: P1, isExhausted: true, might: 2, owner: P2 });
    expect(game.p1.units("base").sort()).toEqual(["kharox", "u"]);
    expect(game.p2.units("base")).toEqual(["f"]);
    expect(game.p2.trash().sort()).toEqual(["s1", "s2", "w"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.p2.hand()).toEqual(["hr"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(d) when the borrowed U later dies it goes to its OWNER's trash — P2's, not P1's", async () => {
    const game = await board().build();
    await burned(game);
    if (game.decision()?.kind === "yes-no") {
      await game.p1.yes();
    }
    await game.p1.pick("u");
    await game.settle();
    await game.p1.cast("fin", { targets: "u" });
    await game.settle();
    expect(game.zoneOf("u")).toBe("trash");
    expect(game.p2.trash()).toContain("u");
    expect(game.p1.trash()).not.toContain("u");
    expect(game.p1.trash().sort()).toEqual(["fin", "sanction"]);
  });

  test("(b) declining the 'you may': nothing is played — U and W stay in P2's trash, P1's base is just Kharox", async () => {
    const game = await board().build();
    await burned(game);
    if (game.decision()?.kind === "yes-no") {
      await game.p1.no();
    } else {
      await game.p1.decline();
    }
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.units("base")).toEqual(["kharox"]);
    expect(game.p2.trash().sort()).toEqual(["s1", "s2", "u", "w"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // ── (e) nothing to choose ────────────────────────────────────────────────────────────────

  test("(e) top three all spells and no unit in P2's trash: the Burn 3 still happens (S0, S1, S2 → trash) but there is no legal 'unit in their trash' → no prompt for P1 at all, nothing played, straight back to P1's main phase (402.4)", async () => {
    const game = await board({ spellsOnly: true }).build();
    await sanctionResolved(game);
    await game.p1.passPriority();
    await game.p2.passPriority(); // trigger resolves
    expect(game.p2.trash().sort()).toEqual(["s0", "s1", "s2"]);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.units("base")).toEqual(["kharox"]);
    expect(game.p2.units("base")).toEqual(["f"]);
    expect(game.state("kharox").isEmpowered).toBe(true);
  });

  // ── always: Sanction's delayed disempower ────────────────────────────────────────────────

  test("always: Kharox stays Empowered for the rest of the turn and is Disempowered at end of turn by Sanction's delayed trigger (390.2)", async () => {
    const game = await board().build();
    await burned(game);
    if (game.decision()?.kind === "yes-no") {
      await game.p1.yes();
    }
    await game.p1.pick("u");
    await game.settle();
    expect(game.state("kharox").isEmpowered).toBe(true);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("kharox").isEmpowered).toBe(false);
    expect(game.zoneOf("u")).toBe("base"); // the borrowed unit is not "this turn" — it stays
    expect(game.state("u").controller).toBe(P1);
  });
});
