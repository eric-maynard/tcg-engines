/**
 * Interaction: Undying Loyalty (unl-168-219) · Spell · Order · 2 + [order]
 *     "This costs [2] less if you choose a Bird, Cat, Dog, or Poro.
 *      Play a unit with cost no more than [2] and no more than [rainbow] from your trash, ignoring its cost."
 *   × Stalwart Poro (ogn-052-298) · Unit · Calm · 2 · 2 Might · PORO · [Shield]
 *   × Watchful Sentry (ogn-096-298) · Unit · Mind · 2 · 1 Might · (no pet tag) [Deathknell] — Draw 1
 *   (+ Vanguard Sergeant ogn-219-298 · vanilla 4-cost unit — over the [2] cap; Mageseeker Warden ogn-070-298
 *    "While I'm at a battlefield, opponents can only play units to their base."; Disposal Order unl-103-219 ·
 *    Reaction · "Choose up to 3 cards from opponents' trashes. Their owners recycle them." — P2's trash hate;
 *    Ravenbloom Student ogn-103-298 "When you play a spell, give me +1 [Might] this turn" — a play detector.)
 *
 * Rules: 355.5 / 355.9.a / 355.10.a (the trash is PUBLIC → "a unit … from your trash" is a TARGET chosen in
 * step 2 as the spell is played; ruling b1ad14fc…), 356.4 (the −[2] is applied in step 3 off that choice),
 * 357 (payment in step 4) → affordability is target-dependent, and 355.16 / 419.2.a prune targets whose choice
 * would make the spell unpayable from the OFFERED set; 355.8 (no legal+payable target → not playable at all);
 * 358.2 / 358.5 (a play that cannot be paid is undone atomically); 355.15 (targets are locked at
 * finalization); 419.3.b (the resolution-time play is a Limited play obeying every normal step: 355.2.a
 * location = base or a controlled battlefield, as narrowed by the Warden — 054.1 can't beats can), 356.1.b.1
 * ("ignoring its cost"), 359.2.c / 143.4 (enters exhausted), 359.3.e-style impossible instruction (target
 * gone → the play is skipped, the spell still resolves, nothing is refunded).
 *
 * Question — P1's turn, Neutral Open, P1 controls bf1. Trash: Stalwart Poro (2, Poro), Watchful Sentry (2, no
 * tag), Vanguard Sergeant (4).
 *   (a) pool 0 + [order]: offered? which trash units are choices? play it — what is paid, where may the Poro go?
 *   (b) pool 2 + [order]: choices; cost choosing Sentry vs Poro?
 *   (c) 0 + [order] with only Sentry + Sergeant in the trash; and 2 energy with NO [order]: offered?
 *   (d) rollback probe on (a): raw {play Undying Loyalty → Sentry}.
 *   (e) P2's Mageseeker Warden at bf2, board (b) choosing Sentry: where may it be played?
 *   (f) board (b), target Poro; P2 responds by removing the Poro from the trash: resolution? refund?
 *
 * Expected: Sergeant is never a choice. (a) offered, choices = {Poro} ONLY; pay [order] only; P2 window; on
 * resolution the Poro is played ignoring cost, P1 picks base or bf1, it enters exhausted; spell → trash.
 * (b) {Poro, Sentry}; Sentry → 2 + [order] (pool 0/0), Poro → [order] only (2 energy left). (c) neither board
 * offers the spell (absent from legal()). (d) refused atomically: trash unchanged (same order), pool 0+[order],
 * spell in hand, chain empty, Student not pumped. (e) base ONLY (no prompt; never bf1) — the play is not
 * skipped. (f) the play has no object → skipped; spell → trash; nothing refunded; no re-pick.
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const UNDYING_LOYALTY = "unl-168-219";
const STALWART_PORO = "ogn-052-298";
const WATCHFUL_SENTRY = "ogn-096-298";
const VANGUARD_SERGEANT = "ogn-219-298";
const MAGESEEKER_WARDEN = "ogn-070-298";
const DISPOSAL_ORDER = "unl-103-219";
const RAVENBLOOM_STUDENT = "ogn-103-298";

interface BoardOpts {
  readonly energy: number;
  readonly order: number;
  readonly poro?: boolean;
  readonly warden?: "bf2" | "base";
}

/**
 * P1's turn 2, Neutral Open. bf1: P1's, held by Ravenbloom Student (2 Might — also the "you played a spell"
 * detector). bf2: P2's with a bystander (and the Warden when asked). P1's trash, in order: Watchful Sentry,
 * Vanguard Sergeant, Stalwart Poro (unless `poro:false`). Hand: Undying Loyalty. P2 holds Disposal Order + 2 energy.
 */
function board(o: BoardOpts) {
  let s = scenario()
    .resources(P1, { energy: o.energy, power: { order: o.order } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", RAVENBLOOM_STUDENT, "student")
    .unit(P2, "bf2", { might: 2, name: "Bystander" }, "theirs")
    .trash(P1, WATCHFUL_SENTRY, "sentry")
    .trash(P1, VANGUARD_SERGEANT, "sarge")
    .hand(P1, UNDYING_LOYALTY, "ul")
    .hand(P2, DISPOSAL_ORDER, "dispo");
  if (o.poro !== false) {
    s = s.trash(P1, STALWART_PORO, "poro");
  }
  if (o.warden) {
    s = s.unit(P2, o.warden, MAGESEEKER_WARDEN, "warden");
  }
  return s;
}

/** The trash units offered as Undying Loyalty's play-time target (flattened, sorted). */
function choicesOffered(game: Game): string[] {
  const field = game.p1.option("cast", "ul")?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].sort();
}

/** Cast on `target`, both pass once → the spell resolves; returns the pool right after payment. */
async function castAndResolve(game: Game, target: string): Promise<{ energy: number; power: Record<string, number> }> {
  await game.p1.cast("ul", { targets: target });
  const paid = game.p1.resources();
  await game.p1.passPriority();
  await game.p2.passPriority();
  return paid;
}

/** The destination prompt (if any) for the unit being played on resolution. */
function destinationPrompt(game: Game): PickDecision | undefined {
  const d = game.decision();
  return d?.kind === "pick" && d.seat === P1 && d.semantics === "destination" ? d : undefined;
}

describe("(a) pool 0 + [order] — the Poro discount is what makes the spell playable, so only the Poro is a target", () => {
  test("the spell IS offered, and its play-time target set is exactly {Stalwart Poro}: the Sentry (would cost 2 P1 lacks) and the 4-cost Sergeant are absent (355.16 / 419.2.a, cost cap)", async () => {
    const game = await board({ energy: 0, order: 1 }).build();
    expect(game.p1.can("cast", "ul")).toBe(true);
    expect(choicesOffered(game)).toEqual(["poro"]);
    await expect(game.p1.cast("ul", { targets: "sentry" })).rejects.toThrow();
    await expect(game.p1.cast("ul", { targets: "sarge" })).rejects.toThrow();
    expect(game.zoneOf("ul")).toBe("hand");
  });

  test("casting it on the Poro pays [order] ONLY (2 − 2 = 0 energy): pool → 0/0; the spell is finalized on the chain with the Poro as its target; P1 then P2 get priority", async () => {
    const game = await board({ energy: 0, order: 1 }).build();
    await game.p1.cast("ul", { targets: "poro" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ul", controller: P1, targets: ["poro"], triggered: false })]);
    expect(game.zoneOf("poro")).toBe("trash"); // nothing moves before resolution
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("on resolution the Poro is played from the trash ignoring its cost (356.1.b.1) as a Limited play: P1 chooses base or bf1 (355.2.a) — bf2 is never offered", async () => {
    const game = await board({ energy: 0, order: 1 }).build();
    await castAndResolve(game, "poro");
    const d = destinationPrompt(game);
    expect(d).toBeDefined();
    expect(d?.options.map((o) => o.key).sort()).toEqual(["base", "battlefield-bf1"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } }); // still nothing more to pay
  });

  test("choosing bf1: the Poro enters bf1 EXHAUSTED beside the Student, nothing further is paid, Undying Loyalty → trash; the Student (a spell was played) gets +1", async () => {
    const game = await board({ energy: 0, order: 1 }).build();
    await castAndResolve(game, "poro");
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    expect(game.state("poro")).toMatchObject({ controller: P1, isExhausted: true, location: "bf1", might: 2 });
    expect(game.p1.units("bf1").sort()).toEqual(["poro", "student"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.zoneOf("ul")).toBe("trash");
    expect(game.p1.trash()).toEqual(["sentry", "sarge", "ul"]);
    expect(game.state("student").might).toBe(3);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("choosing base works the same way (enters base exhausted)", async () => {
    const game = await board({ energy: 0, order: 1 }).build();
    await castAndResolve(game, "poro");
    await game.p1.pick("base");
    await game.settle();
    expect(game.state("poro")).toMatchObject({ isExhausted: true, location: "base" });
  });
});

describe("(b) pool 2 + [order] — both 2-drops are targets; the price depends on which", () => {
  test("target set = {Poro, Sentry}; the Sergeant (4 > [2]) is still absent", async () => {
    const game = await board({ energy: 2, order: 1 }).build();
    expect(choicesOffered(game)).toEqual(["poro", "sentry"]);
    await expect(game.p1.cast("ul", { targets: "sarge" })).rejects.toThrow();
  });

  test("Sentry → full 2 + [order]: pool 0/0; it is played (to base here) exhausted, spell → trash", async () => {
    const game = await board({ energy: 2, order: 1 }).build();
    const paid = await castAndResolve(game, "sentry");
    expect(paid).toEqual({ energy: 0, power: { order: 0 } });
    if (destinationPrompt(game)) {
      await game.p1.pick("base");
    }
    await game.settle();
    expect(game.state("sentry")).toMatchObject({ isExhausted: true, location: "base" });
    expect(game.zoneOf("ul")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("trash");
  });

  test("Poro → [order] only: 2 energy REMAIN after payment (the discount is decided by the step-2 choice, 356.4)", async () => {
    const game = await board({ energy: 2, order: 1 }).build();
    const paid = await castAndResolve(game, "poro");
    expect(paid).toEqual({ energy: 2, power: { order: 0 } });
    await game.p1.pick("base");
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 2, power: { order: 0 } });
    expect(game.locationOf("poro")).toBe("base");
    expect(game.zoneOf("sentry")).toBe("trash");
  });
});

describe("(c) no payable target → the spell is not offered at all (not offered-then-failed)", () => {
  test("0 + [order] with only Sentry + Sergeant in the trash: Sentry needs 2 energy P1 lacks → absent from legal(), can() false", async () => {
    const game = await board({ energy: 0, order: 1, poro: false }).build();
    expect(game.p1.trash()).toEqual(["sentry", "sarge"]);
    expect(game.p1.can("cast", "ul")).toBe(false);
    expect(game.p1.legal().some((o) => o.card === "ul")).toBe(false);
    expect(choicesOffered(game)).toEqual([]);
  });

  test("2 energy but NO [order] pip (Poro present): no target makes the [order] go away → not offered", async () => {
    const game = await board({ energy: 2, order: 0 }).build();
    expect(game.p1.can("cast", "ul")).toBe(false);
    expect(game.p1.legal().some((o) => o.card === "ul")).toBe(false);
    const r = await game.p1.try((p) => p.cast("ul", { targets: "poro" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("ul")).toBe("hand");
  });

  test("control: the same Sentry-only trash IS enough at 2 + [order]", async () => {
    const game = await board({ energy: 2, order: 1, poro: false }).build();
    expect(game.p1.can("cast", "ul")).toBe(true);
    expect(choicesOffered(game)).toEqual(["sentry"]);
  });
});

describe("(d) rollback probe on board (a): a raw {Undying Loyalty → Sentry} at 0 + [order] is refused atomically (358.2 → 358.5)", () => {
  test("the engine rejects the move; trash unchanged and in the same order, Poro still there, pool still 0 + [order], spell still in hand, chain empty, no pending play, Student not pumped, still P1's open main phase", async () => {
    const game = await board({ energy: 0, order: 1 }).build();
    const r = await game.p1.try((p) => p.do("playSpell", { cardId: "ul", playerId: P1, targets: ["sentry"] }));
    expect(r.ok).toBe(false);
    expect(game.p1.trash()).toEqual(["sentry", "sarge", "poro"]);
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 1 } });
    expect(game.zoneOf("ul")).toBe("hand");
    expect(game.p1.hand()).toEqual(["ul"]);
    expect(game.chain()).toEqual([]);
    expect(game.state("student").might).toBe(2);
    expect(game.p1.units("base")).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "ul")).toBe(true); // and the legal Poro line is still available afterwards
    expect(game.violations()).toEqual([]);
  });
});

describe("(e) Mageseeker Warden at bf2 — the resolution-time play still obeys location legality", () => {
  test("board (b), Sentry chosen: the Warden makes base the ONLY destination → no destination prompt, the Sentry lands in base exhausted (never bf1); the play is NOT skipped", async () => {
    const game = await board({ energy: 2, order: 1, warden: "bf2" }).build();
    expect(game.locationOf("warden")).toBe("bf2");
    expect(choicesOffered(game)).toEqual(["poro", "sentry"]); // the Warden does not touch targeting/cost
    await castAndResolve(game, "sentry");
    expect(destinationPrompt(game)).toBeUndefined();
    await game.settle();
    expect(game.state("sentry")).toMatchObject({ controller: P1, isExhausted: true, location: "base" });
    expect(game.p1.units("bf1")).toEqual(["student"]);
    expect(game.zoneOf("ul")).toBe("trash");
  });

  test("control — Warden in P2's BASE ('while I'm at a battlefield' off): the same play offers {base, bf1} and bf1 works", async () => {
    const game = await board({ energy: 2, order: 1, warden: "base" }).build();
    await castAndResolve(game, "sentry");
    const d = destinationPrompt(game);
    expect(d?.options.map((o) => o.key).sort()).toEqual(["base", "battlefield-bf1"]);
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    expect(game.locationOf("sentry")).toBe("bf1");
  });
});

describe("(f) the target leaves the trash in response — the play is skipped, nothing is refunded, no re-pick", () => {
  /** Board (b): P1 targets the Poro (pays [order], keeps 2 energy), passes; P2 answers with Disposal Order recycling the Poro. */
  async function poroRecycledInResponse(): Promise<Game> {
    const game = await board({ energy: 2, order: 1 }).build();
    await game.p1.cast("ul", { targets: "poro" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { order: 0 } });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "dispo")).toBe(true);
    await game.p2.cast("dispo", { mode: 0, targets: "poro" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ul", "dispo"]);
    return game;
  }

  test("Disposal Order resolves first (LIFO): the Poro is recycled to the bottom of P1's deck — Undying Loyalty is still on the chain with its (now absent) target", async () => {
    const game = await poroRecycledInResponse();
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("poro")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("poro");
    expect(game.chain().map((c) => c.cardId)).toEqual(["ul"]);
  });

  test("Undying Loyalty then resolves doing NOTHING: no prompt to pick another trash unit (355.15), no destination prompt; the Sentry stays in the trash; the spell → trash", async () => {
    const game = await poroRecycledInResponse();
    await game.p2.passPriority();
    await game.p1.passPriority();
    // both pass again on the remaining item
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d?.kind).not.toBe("pick");
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("mainDeck");
    expect(game.zoneOf("ul")).toBe("trash");
    expect(game.p1.units("base")).toEqual([]);
    expect(game.p1.units("bf1")).toEqual(["student"]);
  });

  test("…and nothing is refunded: P1 keeps exactly the 2 energy left after paying [order] (order stays 0); the Student still gets +1 because the spell WAS played; back to P1's main phase with no violations", async () => {
    const game = await poroRecycledInResponse();
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 2, power: { order: 0 } });
    expect(game.state("student").might).toBe(3);
    expect(game.p1.trash()).toEqual(["sentry", "sarge", "ul"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
