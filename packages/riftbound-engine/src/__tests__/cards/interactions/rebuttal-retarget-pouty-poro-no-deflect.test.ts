/**
 * Interaction: Rebuttal (ven-152-166) × Void Seeker (ogn-024-298) × Pouty Poro (ogn-013-298)
 *
 *   Rebuttal — Spell (Reaction) · Mind/Chaos · 1 + [C]
 *     "Choose a spell with Energy cost no more than [4]. You may pay [rainbow]. If you do, gain control
 *      of it and you may make new choices for it. Otherwise, counter it."
 *   Void Seeker — Spell (Action) · Fury · 3 + [fury]
 *     "Deal 4 to a unit at a battlefield. Draw 1."
 *   Pouty Poro — Unit · Fury · 2 · 2 Might · "[Deflect] (Opponents must pay [rainbow] to choose me with a
 *     spell or ability.)"
 *
 * Rules: 751/751.1 (new choices for a FINALIZED item), 752.1 (targets are re-choosable), 753 (any legal
 * subset), 754 (a newly-targeted object's targeting effects trigger), 755/755.1 (costs "to play" incurred by
 * new choices are IGNORED — the spell is already played and paid), 809.1.c/809.1.d (Deflect = mandatory
 * additional cost TO PLAY), 337.1 (only Pending items get finalized), 340.4 (after a resolution the
 * controller of the newest item gets priority), 359.3.d (resolved spell → owner's trash).
 *
 * Question: P1's turn. bf1: P1's Pouty Poro (2, Deflect) + P2's X (4). P1 casts Void Seeker at X. P2
 * answers with Rebuttal holding exactly 1 + [C] + [rainbow]; pays on resolution (0 power left), gains
 * control and re-targets Void Seeker onto Pouty Poro.
 *  (a) Is Poro offered / legal although P2 cannot afford a Deflect pip? Is the pip demanded?
 *  (b) Is Void Seeker re-finalized / re-paid / refunded, and who gets priority?
 *  (c) Contrast: P2 casting its OWN Void Seeker at Poro with no spare power.
 *
 * Expected: (a) Poro is offered and legal; the Deflect surcharge is a cost "to play" and is ignored under
 * 755/755.1 — no payment prompt, no unwind, no counter. (b) Void Seeker stays the same Finalized chain item
 * (now P2's), nothing is charged or refunded (P1 stays at 0/0, P2 at 0/0), P2 — controller of the newest
 * item — gets priority first (340.4), P1 still gets a response window; then it resolves: Poro takes 4 and
 * dies, P2 draws 1, Void Seeker lands in P1's (owner's) trash. (c) A fresh Void Seeker at Poro costs
 * 3 + [fury] + [rainbow] (809.1.c); with no spare power Poro is not a legal target and the play is rejected.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REBUTTAL = "ven-152-166";
const VOID_SEEKER = "ogn-024-298";
const POUTY_PORO = "ogn-013-298";
const SKULKER = "ogn-175-298";

/**
 * P1's turn. bf1 (P1's): P1's Pouty Poro + P2's X (4). P1 exactly affords Void Seeker (3 + [fury]);
 * P2 affords Rebuttal (1 + chaos for [C]) plus `extra` for the optional [rainbow].
 */
function board(extra: Record<string, number> = { rainbow: 1 }) {
  return scenario()
    .resources(P1, { energy: 3, power: { fury: 1 } })
    .resources(P2, { energy: 1, power: { chaos: 1, ...extra } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", POUTY_PORO, "poro")
    .unit(P2, "bf1", { might: 4, name: "Unit X" }, "x")
    .deck(P1, [SKULKER, SKULKER], ["a1", "a2"])
    .deck(P2, [SKULKER, SKULKER], ["b1", "b2"])
    .hand(P1, VOID_SEEKER, "vs")
    .hand(P2, REBUTTAL, "reb");
}

/** P1 casts Void Seeker at X and passes; P2 Rebuttals it; both pass until Rebuttal resolves (P2's pay prompt). */
async function rebutted(extra?: Record<string, number>): Promise<Game> {
  const game = await board(extra).build();
  await game.p1.cast("vs", { targets: "x" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  await game.p1.passPriority();
  await game.p2.cast("reb", { targets: "vs" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["vs", "reb"]);
  while (game.decision()?.kind === "action" && game.chain().some((c) => c.cardId === "reb")) {
    await game.acting().passPriority();
  }
  return game;
}

/** …P2 pays the [rainbow]; returns the game standing at P2's new-choices prompt (if any). */
async function paidAndOffered(): Promise<Game> {
  const game = await rebutted();
  expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P2 });
  await game.p2.yes();
  expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0, rainbow: 0 } });
  return game;
}

function offeredCards(game: Game): string[] {
  const d = game.decision();
  return d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
}

/** Pass priority around until the chain is empty. */
async function resolveChain(game: Game): Promise<void> {
  while (game.chain().length > 0 && game.decision()?.kind === "action") {
    await game.acting().passPriority();
  }
}

describe("Rebuttal re-targets a stolen Void Seeker onto Pouty Poro — Deflect is not charged (755)", () => {
  // ── (a) the offer ───────────────────────────────────────────────────────────────────────────

  test("(a) after paying, P2 is shown a new-choices pick that lists Pouty Poro even though P2 has 0 power left (752.1, 755)", async () => {
    const game = await paidAndOffered();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    expect(d?.kind === "pick" ? d.allowDecline : undefined).toBe(true); // "you MAY make new choices"
    expect(offeredCards(game)).toContain("poro");
    // Void Seeker is still one finalized item, now P2's, still pointing at X until re-chosen.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vs", controller: P2, countered: false, targets: ["x"] })]);
  });

  test("(a) picking Poro is legal and demands NO [rainbow] — no pay prompt, no counter, P2 stays at 0 power; the item now targets Poro (754, 755.1)", async () => {
    const game = await paidAndOffered();
    await game.p2.pick("poro");
    const d = game.decision();
    // Not a payment prompt of any shape for P2.
    expect(d?.kind === "yes-no" || d?.kind === "integer").toBe(false);
    expect(d?.timing).not.toBe("PAY");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0, rainbow: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vs", controller: P2, countered: false, targets: ["poro"] })]);
    expect(game.zoneOf("vs")).toBe("chain");
  });

  // ── (b) no re-finalize, no refund, priority ────────────────────────────────────────────────

  test("(b) nothing is re-paid or refunded: P1 keeps having spent 3 + [fury]; Void Seeker is not re-added as a new/pending item", async () => {
    const game = await paidAndOffered();
    const chainBefore = game.chain();
    expect(chainBefore).toHaveLength(1);
    const itemId = chainBefore[0]?.id;
    await game.p2.pick("poro");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0, rainbow: 0 } });
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]?.id).toBe(itemId); // same chain slot, not a fresh play
    expect(game.zoneOf("vs")).toBe("chain");
    expect(game.zoneOf("reb")).toBe("trash");
  });

  // Expected (340.4): Rebuttal has resolved, the chain holds one finalized item (Void Seeker) whose
  // controller is now P2 → P2 gains priority first, then P1 may respond. It is NOT re-finalized (337.1
  // only finalizes Pending items). Actual: the engine hands priority to P1 (the original caster / turn
  // player) first and P2 second.
  test("after Rebuttal resolves, priority should go to P2 — controller of the newest item (340.4) — before P1's response window; engine gives P1 priority first", async () => {
    const game = await paidAndOffered();
    await game.p2.pick("poro");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    expect(game.zoneOf("vs")).toBe("chain"); // one pass does not resolve it
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
  });

  test("(b) the re-choice is not a new finalize: straight to a priority window (no FIN/PAY prompt), and BOTH players must pass before Void Seeker resolves", async () => {
    const game = await paidAndOffered();
    await game.p2.pick("poro");
    const first = game.decision();
    expect(first).toMatchObject({ context: "chain", kind: "action", timing: "ACT" });
    const firstSeat = game.actingSeat();
    await game.acting().passPriority();
    expect(game.zoneOf("vs")).toBe("chain"); // one pass does not resolve it
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    expect(game.actingSeat()).toBe(firstSeat === P1 ? P2 : P1);
    await game.acting().passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("vs")).toBe("trash");
  });

  test("(b) all pass → Void Seeker resolves for P2: Poro takes 4 and dies, X untouched, P2 draws 1, Void Seeker → P1's (owner's) trash (359.3.d)", async () => {
    const game = await paidAndOffered();
    await game.p2.pick("poro");
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await resolveChain(game);
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.p1.trash()).toContain("poro");
    expect(game.state("x")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.p2.hand()).toContain("b1");
    expect(game.p1.hand()).toHaveLength(p1Hand); // P1 draws nothing
    expect(game.zoneOf("vs")).toBe("trash");
    expect(game.p1.trash()).toContain("vs");
    expect(game.p2.trash()).not.toContain("vs");
    expect(game.p2.trash()).toContain("reb");
    expect(game.violations()).toEqual([]);
  });

  test("control: P2 pays but declines new choices — Void Seeker (now P2's) still hits X: X takes 4 and dies, P2 draws 1", async () => {
    const game = await paidAndOffered();
    await game.p2.decline();
    const p2Hand = game.p2.hand().length;
    await resolveChain(game);
    await game.settle();
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.state("poro")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.p1.trash()).toContain("vs");
  });

  // ── (c) contrast: a REAL play at Poro owes the Deflect pip ─────────────────────────────────

  test("(c) P2 casting its own Void Seeker at Poro with only 3 + [fury]: Poro is not a legal target (needs +[rainbow], 809.1.c) — the play is rejected and nothing is spent", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 3, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", POUTY_PORO, "poro")
      .unit(P1, "bf1", { might: 4, name: "Plain" }, "plain")
      .hand(P2, VOID_SEEKER, "vs2")
      .build();
    const offered = (game.p2.option("cast", "vs2")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toContain("plain");
    expect(offered).not.toContain("poro");
    await expect(game.p2.cast("vs2", { targets: "poro" })).rejects.toThrow();
    expect(game.zoneOf("vs2")).toBe("hand");
    expect(game.p2.resources()).toEqual({ energy: 3, power: { fury: 1 } });
    expect(game.state("poro").damage).toBe(0);
  });

  test("(c) …with a spare [rainbow] the same play is legal and costs 3 + [fury] + [rainbow]; Poro takes 4 and dies", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 3, power: { fury: 1, rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", POUTY_PORO, "poro")
      .hand(P2, VOID_SEEKER, "vs2")
      .build();
    await game.p2.cast("vs2", { targets: "poro" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0, rainbow: 0 } });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.zoneOf("vs2")).toBe("trash");
  });
});
