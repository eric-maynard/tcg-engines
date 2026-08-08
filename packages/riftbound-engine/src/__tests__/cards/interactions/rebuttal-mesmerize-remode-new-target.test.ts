/**
 * Interaction: Rebuttal (ven-152-166) × Mesmerize (ven-052-166)
 *
 *   Rebuttal — Spell (Reaction) · Mind/Chaos · 1 + [C]
 *     "Choose a spell with Energy cost no more than [4]. You may pay [rainbow]. If you do, gain control
 *      of it and you may make new choices for it. Otherwise, counter it."
 *   Mesmerize — Spell (Reaction) · Mind · 1 + [mind]
 *     "Choose one — Return a friendly unit to its owner's hand. · Give an enemy unit -2 [Might] this turn."
 *
 * Rules: 355.3 / 355.5 (mode and target are chosen at play and ride on the public chain item);
 * 751 / 751.1 (new choices must be objects/modes NOT previously chosen); 752 / 752.1 (re-choosable:
 * locations, MODES, destinations, targets; 752.2 not "as you play" choices / optional costs);
 * 359.3.f.4 + 359.3.e.4 ("enemy" is evaluated relative to the item's controller at resolution — a
 * stolen item left unchanged mistargets); 359.3.e.5 / 359.3.e.10 (illegal target → unaffected, spell
 * may do nothing); 359.3.d (a resolved spell goes to its OWNER's trash).
 *
 * Question: P2's turn; X (P2, 4 Might) attacks D (P1, 3 Might) at bf1. In the showdown P1 Mesmerizes
 * X with mode 2 (-2 Might). (a) Is the mode/target public before P2 responds? (b) P2 Rebuttals it and
 * pays [rainbow]: may P2 change mode as well as target? keep mode 2 on X? sensible lines? (c) P2 pays
 * but makes no new choices — what does Mesmerize do to X under P2's control? (d) P2 doesn't pay.
 * (e) Whose trash?
 *
 * Expected: (a) yes. (b) modes AND targets are re-choosable, but not the same mode-2-on-X (751.1);
 * e.g. mode 2 → D: D is 1 Might this turn, dies in combat, X conquers; or mode 1 → X (bounce own
 * attacker — legal, self-defeating). (c) X is no longer "enemy" to the controller → mistarget, nothing
 * happens; combat 4 v 3, D dies, X conquers. (d) countered, no effect. (e) always P1's (owner's) trash.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REBUTTAL = "ven-152-166";
const MESMERIZE = "ven-052-166";

/**
 * P2's turn. bf1: P1's D (3). P2 base: X (4) + an idle P2 unit; P1 base: an idle P1 unit (so both modes
 * have more than one candidate on each side). P1 exactly affords Mesmerize; P2 affords Rebuttal
 * (1 + chaos for the [C] pip) plus `extra` for the optional [rainbow].
 */
function board(extra: Record<string, number> = { rainbow: 1 }) {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 1, power: { mind: 1 } })
    .resources(P2, { energy: 1, power: { chaos: 1, ...extra } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Defender D" }, "d")
    .unit(P2, "base", { might: 4, name: "Attacker X" }, "x")
    .unit(P2, "base", { might: 2, name: "P2 Idler" }, "idle2")
    .unit(P1, "base", { might: 2, name: "P1 Idler" }, "idle1")
    .hand(P1, MESMERIZE, "mes")
    .hand(P2, REBUTTAL, "reb");
}

/** X attacks bf1; P2 passes Focus; P1 Mesmerizes X (mode 2 = index 1). Chain: [mes]. P1 holds priority. */
async function mesmerized(extra?: Record<string, number>): Promise<Game> {
  const game = await board(extra).build();
  await game.p2.move("x", "bf1");
  await game.p2.passFocus();
  await game.p1.cast("mes", { mode: 1, targets: "x" });
  return game;
}

/** …then P1 passes, P2 Rebuttals Mesmerize, both pass until Rebuttal resolves (stops at P2's pay prompt, if any). */
async function rebutted(extra?: Record<string, number>): Promise<Game> {
  const game = await mesmerized(extra);
  await game.p1.passPriority();
  await game.p2.cast("reb", { targets: "mes" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["mes", "reb"]);
  while (game.decision()?.kind === "action" && game.chain().some((c) => c.cardId === "reb")) {
    await game.acting().passPriority();
  }
  return game;
}

/** Pass priority around until the chain is empty (Mesmerize resolved/countered) — but stop short of ending the showdown. */
async function resolveChain(game: Game): Promise<void> {
  while (game.chain().length > 0 && game.decision()?.kind === "action") {
    await game.acting().passPriority();
  }
}

/** The new-choices prompt P2 is shown after paying (pick, possibly behind a yes/no gate), or null. */
async function newChoicesPrompt(game: Game) {
  for (let i = 0; i < 3; i++) {
    const d = game.decision();
    if (!d || d.seat !== P2 || d.kind === "action") {
      return null;
    }
    if (d.kind === "yes-no") {
      await game.p2.yes();
      continue;
    }
    return d;
  }
  return null;
}

describe("Rebuttal × Mesmerize — steal a modal spell mid-combat and re-choose", () => {
  // ── (a) public information ────────────────────────────────────────────────────────────────

  test("(a) the chosen mode and target are locked at play and visible to P2 on the chain item before P2 responds (355.3, 355.5)", async () => {
    const game = await mesmerized();
    const seen = game.p2.view().chain;
    expect(seen).toEqual([expect.objectContaining({ cardId: "mes", controller: P1, mode: 1, targets: ["x"] })]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "reb")).toBe(true); // Mesmerize (cost 1 ≤ 4) is a legal choice
    expect(game.p2.option("cast", "reb")?.fields.find((f) => f.name === "targets")?.options).toEqual([["mes"]]);
  });

  // ── (b) pay [rainbow] → gain control → new choices ────────────────────────────────────────

  test("(b) paying the [rainbow] on resolution hands the Mesmerize chain item to P2 (still mode 2 on X until re-chosen); Rebuttal cost 1 + [C] + [rainbow]", async () => {
    const game = await rebutted();
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P2 });
    await game.p2.yes();
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0, rainbow: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mes", controller: P2, countered: false })]);
    expect(game.zoneOf("reb")).toBe("trash");
  });

  // Expected (752.1): after paying, P2 is offered to re-make Mesmerize's finalization choices — its
  // MODE and its target — evaluated from P2's seat: mode-2 candidates are P1's units (D, P1 Idler),
  // never X again (751.1: must be objects not previously chosen; X is also no longer "enemy").
  // Actual: the engine's gain-control re-choice only handles a plain top-level target; a modal
  // ("Choose one —") spell gets no new-choices prompt at all.
  test("(b) P2 is offered new choices for the stolen modal spell — enemy-to-P2 units (D, P1 Idler) selectable, X not re-selectable (751.1, 752.1)", async () => {
    const game = await rebutted();
    await game.p2.yes();
    const d = await newChoicesPrompt(game);
    expect(d).not.toBeNull();
    expect(d?.seat).toBe(P2);
    // Either a mode prompt first (752.1 — modes are re-choosable) or straight to targets under mode 2.
    if (d?.kind === "pick" && d.semantics === "mode") {
      expect(d.options.map((o) => o.mode ?? Number(o.key)).sort()).toEqual([0, 1]);
      await game.p2.chooseMode(1);
    }
    const t = game.decision();
    expect(t?.kind).toBe("pick");
    const offered = t?.kind === "pick" ? t.options.map((o) => o.card ?? o.key) : [];
    expect(offered).toContain("d");
    expect(offered).toContain("idle1");
    expect(offered).not.toContain("x"); // 751.1 — previously chosen; and friendly to P2 anyway
    expect(offered).not.toContain("idle2");
  });

  // Expected: P2 keeps mode 2 but points it at D → D is 3−2 = 1 Might this turn; combat 4 v 1 → D dies,
  // X conquers bf1, P2 scores; Mesmerize still lands in its OWNER P1's trash (359.3.d).
  // Actual: no re-choice is offered (see above), so D stays 3 Might.
  test("(b) mode 2 re-aimed at D: D drops to 1 Might this turn, dies to X's 4, X conquers bf1 (+1 P2); Mesmerize → P1's trash", async () => {
    const game = await rebutted();
    await game.p2.yes();
    const d = await newChoicesPrompt(game);
    expect(d).not.toBeNull();
    if (d?.kind === "pick" && d.semantics === "mode") {
      await game.p2.chooseMode(1);
    }
    await game.p2.pick("d");
    await resolveChain(game);
    expect(game.state("d")).toMatchObject({ might: 1, mightModifier: -2 });
    expect(game.state("x").might).toBe(4);
    expect(game.p1.trash()).toContain("mes");
    await game.settle();
    expect(game.zoneOf("d")).toBe("trash");
    expect(game.zoneOf("x")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });

  // Expected (752.1 — modes are among the re-choosable choices): P2 may instead switch to mode 1
  // "Return a friendly unit to its owner's hand" — friendly to P2 now — e.g. X itself: legal, if
  // self-defeating (X goes back to P2's hand, the attack evaporates, bf1 stays P1's).
  // Actual: no mode re-choice exists.
  test("(b) switching to mode 1 on X is legal: X returns to P2's hand, no combat, bf1 stays with P1 (752.1)", async () => {
    const game = await rebutted();
    await game.p2.yes();
    const d = await newChoicesPrompt(game);
    expect(d).toMatchObject({ kind: "pick", semantics: "mode", seat: P2 });
    await game.p2.chooseMode(0);
    const t = game.decision();
    const offered = t?.kind === "pick" ? t.options.map((o) => o.card ?? o.key) : [];
    expect(offered.sort()).toEqual(["idle2", "x"]); // friendly to the NEW controller
    await game.p2.pick("x");
    await resolveChain(game);
    expect(game.zoneOf("x")).toBe("hand");
    expect(game.p2.hand()).toContain("x");
    await game.settle();
    expect(game.zoneOf("d")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    expect(game.p1.trash()).toContain("mes");
  });

  // ── (c) pay but keep the old choices ─────────────────────────────────────────────────────

  test("(c) paid but no new choices: 'enemy unit' is read from the NEW controller P2 at resolution → X is not enemy → Mesmerize does nothing (359.3.f.4, 359.3.e.4/5/10)", async () => {
    const game = await rebutted();
    await game.p2.yes();
    const d = await newChoicesPrompt(game);
    if (d?.kind === "pick" && d.allowDecline) {
      await game.p2.decline(); // "you MAY make new choices" — keep them
    }
    await resolveChain(game);
    expect(game.chain()).toEqual([]);
    expect(game.state("x")).toMatchObject({ might: 4, mightModifier: 0, zone: "battlefield-bf1" });
    expect(game.state("d")).toMatchObject({ might: 3, mightModifier: 0 });
    expect(game.zoneOf("idle1")).toBe("base"); // the other mode did not happen either
    expect(game.zoneOf("idle2")).toBe("base");
  });

  test("(c) …so combat is the printed 4 v 3: D dies, X survives with 3 damage… and conquers bf1 for P2 (+1)", async () => {
    const game = await rebutted();
    await game.p2.yes();
    const d = await newChoicesPrompt(game);
    if (d?.kind === "pick" && d.allowDecline) {
      await game.p2.decline();
    }
    await game.settle();
    expect(game.zoneOf("d")).toBe("trash");
    expect(game.zoneOf("x")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("(e) after (c) the resolved-under-P2 Mesmerize is in its OWNER P1's trash; Rebuttal in P2's (359.3.d)", async () => {
    const game = await rebutted();
    await game.p2.yes();
    const d = await newChoicesPrompt(game);
    if (d?.kind === "pick" && d.allowDecline) {
      await game.p2.decline();
    }
    await resolveChain(game);
    expect(game.zoneOf("mes")).toBe("trash");
    expect(game.state("mes").owner).toBe(P1);
    expect(game.p1.trash()).toContain("mes");
    expect(game.p2.trash()).not.toContain("mes");
    expect(game.p2.trash()).toContain("reb");
  });

  // ── (d) don't pay → counter ─────────────────────────────────────────────────────────────

  test("(d) declining the [rainbow]: 'Otherwise, counter it' — Mesmerize leaves the chain with no effect, X keeps 4 Might, P2 keeps the rainbow", async () => {
    const game = await rebutted();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    await game.p2.no();
    expect(game.chain()).toEqual([]);
    expect(game.state("x")).toMatchObject({ might: 4, mightModifier: 0 });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0, rainbow: 1 } });
    expect(game.zoneOf("mes")).toBe("trash");
    expect(game.p1.trash()).toContain("mes"); // (e) countered → owner's trash too
    expect(game.p2.trash()).toEqual(["reb"]);
  });

  test("(d) with no power left for the [rainbow] there is nothing to accept — Rebuttal simply counters; combat 4 v 3: D dies, X conquers", async () => {
    const game = await rebutted({}); // chaos only: pays the pip, nothing for the option
    const d = game.decision();
    if (d?.kind === "yes-no") {
      expect(d.canAccept).toBe(false);
      await game.p2.no();
    }
    await resolveChain(game);
    expect(game.chain()).toEqual([]);
    expect(game.state("x").might).toBe(4);
    expect(game.p1.trash()).toContain("mes");
    await game.settle();
    expect(game.zoneOf("d")).toBe("trash");
    expect(game.locationOf("x")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });

  // ── control: the un-rebutted line ───────────────────────────────────────────────────────

  test("control: without Rebuttal, Mesmerize (mode 2 on X) resolves for P1 — X fights at 2, D (3) survives and kills it, bf1 stays P1's", async () => {
    const game = await mesmerized();
    await resolveChain(game);
    expect(game.state("x")).toMatchObject({ might: 2, mightModifier: -2 });
    await game.settle();
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.zoneOf("d")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    expect(game.p1.trash()).toContain("mes");
  });
});
