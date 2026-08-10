/**
 * Interaction: Rebuttal (ven-152-166) × Stand United played from HIDDEN (ogn-053-298)
 *
 *   Rebuttal — Spell (Reaction) · Mind/Chaos · 1 + [C]
 *     "Choose a spell with Energy cost no more than [4]. You may pay [rainbow]. If you do, gain control
 *      of it and you may make new choices for it. Otherwise, counter it."
 *   Stand United — Spell (Action) · Calm · 3 · [Hidden]
 *     "Buff a friendly unit. Buffs give an additional +1 [Might] to friendly units this turn."
 *
 * Rules: 811.1.d.2 (a hidden spell's targets must be chosen from options AT THAT BATTLEFIELD) and 811.2
 * (this very card: the buff target is "here"-locked, the second sentence is global); 752 / 752.1 (the
 * re-choosable choices are the finalization choices — so the finalization constraints ride along;
 * Mystic-Reversal-on-hidden ruling); 753.1 / 753.2 (no new choice that would be illegal; if no legal
 * new choice exists, none may be made — the old target is simply kept, never "no target"); 754 (a
 * re-target is a new targeting event); 359.3.e.5 (an illegal kept target is unaffected, the rest of the
 * spell still resolves — "friendly" read from the NEW controller); 359.3.d (resolved spell → owner's trash).
 *
 * Question. P1 hid Stand United at bf1 on an earlier turn; P1's A (3) holds bf1; P1 also has an
 * already-buffed C in base; P2 has an already-buffed Zed in base and X at bf2.
 *   NO case (P1's turn, no combat): P1 flips Stand United for 0 on A; P2 Rebuttals (3 ≤ 4), pays, gains
 *   control. P2 has no unit at bf1 — may P2 re-target X at bf2, or elect "no target"? What resolves?
 *   YES case (P2's turn): P2 attacks bf1 with Y (4); in the showdown P1 flips Stand United on A; P2
 *   Rebuttals and pays. May P2 re-target Y (at bf1)? X (at bf2)? Result in combat?
 *
 * Expected. The "must choose from options at that battlefield" restriction is a property of how this
 * chain item was played and persists for new choices. NO case: legal new targets = P2-friendly units at
 * bf1 = ∅ → no re-choice may be made (prompt absent or keep-only); X is not offered / not pickable, and
 * there is no "no target" election — A stays the target. Resolution under P2: A is not friendly to P2 →
 * buff ignored; the second sentence is target-independent and applies for the controller: P2's buffed
 * Zed is +1 this turn, P1's C is NOT. Stand United → P1's trash. YES case: Y is P2-friendly and at bf1 →
 * offered and legal; X (bf2) and Zed (base) are not. P2 re-targets Y (no cost): Y gets a buff (+1) and,
 * being a buffed P2 unit, +1 more → fights as 6 vs A's 3; Zed also +1; C not. A dies, Y conquers bf1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REBUTTAL = "ven-152-166";
const STAND_UNITED = "ogn-053-298";

/**
 * Turn 3 (Stand United was hidden at bf1 on an earlier turn). bf1: P1's A (3) + facedown Stand United.
 * bf2: P2's X (2). P1 base: buffed C (2 → 3). P2 base: buffed Zed (2 → 3), Y (4, the YES-case attacker).
 * P2 holds Rebuttal with exactly 1 energy + [mind] for it and one [rainbow] for the optional payment.
 */
function board(active: typeof P1 | typeof P2) {
  return scenario()
    .turn(3)
    .active(active)
    .resources(P2, { energy: 1, power: { mind: 1, rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Anchor A" }, "a")
    .unit(P1, "base", { might: 2, name: "Comrade C" }, "c", { buffed: true })
    .unit(P2, "base", { might: 2, name: "Zed" }, "zed", { buffed: true })
    .unit(P2, "bf2", { might: 2, name: "Xeno X" }, "x")
    .unit(P2, "base", { might: 4, name: "Yeoman Y" }, "y")
    .facedown(P1, "bf1", STAND_UNITED, "su")
    .hand(P2, REBUTTAL, "reb");
}

/** P1 flips Stand United (A is the only friendly unit at bf1 → locked), passes; P2 Rebuttals it; pass until Rebuttal resolves (P2's pay prompt). */
async function flipAndRebut(game: Game): Promise<void> {
  expect(game.p1.can("reveal", "su")).toBe(true);
  await game.p1.reveal("su");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "su", controller: P1 })]);
  await game.p1.passPriority();
  expect(game.p2.can("cast", "reb")).toBe(true); // Stand United costs 3 ≤ 4
  await game.p2.cast("reb", { targets: "su" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["su", "reb"]);
  while (game.decision()?.kind === "action" && game.chain().some((c) => c.cardId === "reb")) {
    await game.acting().passPriority();
  }
  expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P2 });
}

/** NO case: P1's turn, no combat. Flip → Rebuttal → P2 pays the [rainbow]. Stops at whatever P2 is shown next. */
async function noCase(): Promise<Game> {
  const game = await board(P1).build();
  await flipAndRebut(game);
  await game.p2.yes();
  return game;
}

/** YES case: P2's turn. Y attacks bf1, P2 passes Focus, P1 flips Stand United on A, P2 Rebuttals and pays. */
async function yesCase(): Promise<Game> {
  const game = await board(P2).build();
  await game.p2.move("y", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  await flipAndRebut(game);
  await game.p2.yes();
  return game;
}

/** The card ids a P2 re-choice prompt offers right now ([] when P2 is not being asked to pick anything). */
function reChoiceOffered(game: Game): string[] {
  const d = game.decision();
  return d?.kind === "pick" && d.seat === P2 ? d.options.map((o) => o.card ?? o.key) : [];
}

/** If a declinable re-choice prompt is up, keep the old target; then pass until the chain is empty (stop before any combat step). */
async function keepAndResolve(game: Game): Promise<void> {
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P2 && d.allowDecline) {
    await game.p2.decline();
  }
  while (game.chain().length > 0 && game.decision()?.kind === "action") {
    await game.acting().passPriority();
  }
  expect(game.chain()).toEqual([]);
}

describe("Rebuttal × hidden Stand United — the 'here' lock survives the control change", () => {
  // ── controls ─────────────────────────────────────────────────────────────────────────────

  test("control: un-rebutted, Stand United flipped for [0] buffs A and gives every buffed P1 unit +1 more this turn — A 3→5, C 3→4; P2's buffed Zed stays 3 (811.2)", async () => {
    const game = await board(P1).build();
    await game.p1.reveal("su");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("a")).toMatchObject({ isBuffed: true, might: 5 });
    expect(game.state("c").might).toBe(4);
    expect(game.state("zed").might).toBe(3);
    expect(game.state("x")).toMatchObject({ isBuffed: false, might: 2 });
    expect(game.zoneOf("su")).toBe("trash");
  });

  test("control: at play time the hidden flip only offers friendly units AT bf1 — with a second P1 unit there the FIN pick is {A, B}, never base-dwelling C (811.1.d.2)", async () => {
    const game = await board(P1).unit(P1, "bf1", { might: 1, name: "Buddy B" }, "b").build();
    await game.p1.reveal("su");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : [];
    expect(offered).toEqual(["a", "b"]);
    await game.p1.pick("a");
    expect(game.view().chain).toEqual([expect.objectContaining({ cardId: "su", controller: P1, targets: ["a"] })]);
  });

  // ── NO case: P1's turn, P2 has nothing at bf1 ────────────────────────────────────────────

  test("NO: paying the [rainbow] hands the Stand United chain item to P2 (Rebuttal 1 + [mind] + [rainbow] all spent, Rebuttal → P2's trash)", async () => {
    const game = await noCase();
    expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 0, rainbow: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "su", controller: P2, countered: false })]);
    expect(game.zoneOf("reb")).toBe("trash");
    expect(game.p2.trash()).toContain("reb");
  });

  // Expected (752 + 811.1.d.2, 753.2): the only legal new targets are P2-friendly units AT bf1 — there are
  // none, so P2 may not make a new choice at all: either no prompt, or a keep-only prompt offering nothing
  // off-battlefield. Actual: the engine offers every P2 unit anywhere (Zed in base, Y in base, X at bf2).
  test("NO — with no P2 unit at bf1 no re-choice may be made: X (bf2) / Zed / Y (base) are NOT offered (811.1.d.2 persists via 752; 753.2)", async () => {
    const game = await noCase();
    const offered = reChoiceOffered(game);
    expect(offered).not.toContain("x");
    expect(offered).not.toContain("zed");
    expect(offered).not.toContain("y");
    expect(offered).toEqual([]);
  });

  // Expected (753.1): choosing X would be an illegal new choice (wrong battlefield) → rejected.
  // Actual: the pick is accepted and X becomes the chain item's target.
  test("NO — explicitly picking X at bf2 as the new target is rejected (753.1)", async () => {
    const game = await noCase();
    const r = await game.p2.try((p) => p.pick("x"));
    expect(r.ok).toBe(false);
    expect(game.view().chain).toEqual([expect.objectContaining({ cardId: "su", controller: P2, targets: ["a"] })]);
  });

  test("NO: there is no 'no target' election — whatever P2 is shown has no empty/none option, and keeping leaves A as the (now illegal) target on a P2-controlled item (753.1; Gust / Drag Under rulings)", async () => {
    const game = await noCase();
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P2) {
      // Every option is a concrete card; "decline" means KEEP the old target, not "target nothing".
      expect(d.options.every((o) => typeof (o.card ?? o.key) === "string" && game.has(o.card ?? o.key))).toBe(true);
      expect(d.allowDecline).toBe(true);
      await game.p2.decline();
    }
    expect(game.view().chain).toEqual([expect.objectContaining({ cardId: "su", controller: P2, countered: false, targets: ["a"] })]);
  });

  test("NO: resolution under P2 with A kept — A is not friendly to P2 → NOT buffed, stays 3 (359.3.e.5); the spell is not countered/fizzled and lands in its OWNER P1's trash (359.3.d)", async () => {
    const game = await noCase();
    await keepAndResolve(game);
    expect(game.state("a")).toMatchObject({ isBuffed: false, might: 3 });
    expect(game.state("x")).toMatchObject({ isBuffed: false, might: 2 });
    expect(game.zoneOf("su")).toBe("trash");
    expect(game.state("su").owner).toBe(P1);
    expect(game.p1.trash()).toContain("su");
    expect(game.p2.trash()).not.toContain("su");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // Expected (811.2 second sentence is target-independent; 359.3.f.4 "friendly" = the controller P2 at
  // resolution): P2's buffed Zed 3→4 this turn, P1's buffed C stays 3. Actual: the turn-scoped "+1 to buffed
  // friendly units" is applied for the ORIGINAL caster P1 — C becomes 4 and Zed stays 3.
  test("NO — the second sentence still applies, for the NEW controller: P2's buffed Zed is +1 (→4) this turn, P1's buffed C is not (stays 3)", async () => {
    const game = await noCase();
    await keepAndResolve(game);
    expect(game.state("zed").might).toBe(4);
    expect(game.state("c").might).toBe(3);
  });

  test("NO: the +1 (wherever it landed) is 'this turn' only — next turn every buffed unit is back to base+1", async () => {
    const game = await noCase();
    await keepAndResolve(game);
    await game.advanceTurn();
    expect(game.state("zed").might).toBe(3);
    expect(game.state("c").might).toBe(3);
    expect(game.state("a").might).toBe(3);
  });

  // ── YES case: P2's turn, Y is attacking bf1 ──────────────────────────────────────────────

  test("YES: in the showdown P1 may flip Stand United on A for [0]; P2 may Rebuttal it and pay — the item is now P2's and P2 IS shown a re-choice that includes Y (P2-friendly, at bf1)", async () => {
    const game = await yesCase();
    expect(game.state("y").combatRole).toBe("attacker");
    expect(game.state("a").combatRole).toBe("defender");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "su", controller: P2 })]);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2, semantics: "target" });
    expect(reChoiceOffered(game)).toContain("y");
  });

  // Expected: the re-choice set is exactly {Y} — X (bf2) and Zed (base) are P2-friendly but not at bf1
  // (811.1.d.2 carried by 752). Actual: Zed and X are offered too.
  test("YES — the re-choice offers ONLY Y; X at bf2 and Zed in base are still excluded by the 'here' lock", async () => {
    const game = await yesCase();
    expect(reChoiceOffered(game).toSorted()).toEqual(["y"]);
  });

  test("YES: P2 re-targets Y — a new targeting choice at no further cost (754); the chain item now reads targets [Y] under P2", async () => {
    const game = await yesCase();
    const before = game.p2.resources();
    await game.p2.pick("y");
    expect(game.p2.resources()).toEqual(before);
    expect(game.view().chain).toEqual([expect.objectContaining({ cardId: "su", controller: P2, countered: false, targets: ["y"] })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("YES: on resolution Y (friendly to P2, at bf1) receives the buff; A does not; Stand United → P1's trash, Rebuttal → P2's", async () => {
    const game = await yesCase();
    await game.p2.pick("y");
    await keepAndResolve(game);
    expect(game.state("y").isBuffed).toBe(true);
    expect(game.state("y").might).toBeGreaterThanOrEqual(5);
    expect(game.state("a")).toMatchObject({ isBuffed: false, might: 3 });
    expect(game.p1.trash()).toContain("su");
    expect(game.p2.trash()).toContain("reb");
  });

  // Expected: Y = 4 + 1 (buff) + 1 (buffed & friendly to controller P2 this turn) = 6; Zed 3→4; P1's C
  // stays 3. Actual: Y is 5, Zed 3, and P1's C is the one that gets +1 (4) — the second sentence is
  // evaluated for the original caster instead of the controller.
  test("YES — Y fights as 6 (buff +1 and the controller-relative extra +1), Zed is 4, P1's C stays 3", async () => {
    const game = await yesCase();
    await game.p2.pick("y");
    await keepAndResolve(game);
    expect(game.state("y").might).toBe(6);
    expect(game.state("zed").might).toBe(4);
    expect(game.state("c").might).toBe(3);
  });

  test("YES: combat — Y (≥5) vs A (3): A dies, Y survives and conquers bf1 for P2 (+1 point)", async () => {
    const game = await yesCase();
    await game.p2.pick("y");
    await keepAndResolve(game);
    await game.settle();
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("y")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("YES control: if P2 does NOT pay, Stand United is countered — A unbuffed at 3, Y attacks at 4: A dies anyway, but nobody got a buff", async () => {
    const game = await board(P2).build();
    await game.p2.move("y", "bf1");
    await game.p2.passFocus();
    await flipAndRebut(game);
    await game.p2.no();
    expect(game.chain()).toEqual([]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 0, rainbow: 1 } });
    expect(game.p1.trash()).toContain("su");
    expect(game.state("a")).toMatchObject({ isBuffed: false, might: 3 });
    expect(game.state("y")).toMatchObject({ isBuffed: false, might: 4 });
    await game.settle();
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.locationOf("y")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });
});
