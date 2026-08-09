/**
 * Interaction: Blood Rose (unl-109-219) · Gear · Body · 1
 *     "When you play a unit, you may pay [1] to gain 1 XP.
 *      Spend 3 XP, [Exhaust]: Ready a unit."
 *   × Shipyard Skulker (ogn-175-298) · Unit · Chaos · 3 · 3 Might (vanilla)
 *
 * Question: P1 controls Blood Rose. Trigger half: (a) P1 plays Skulker with their LAST energy;
 * (b) P1 plays Skulker with 1 energy left over; (c) P2 plays a unit. Activated half — when is
 * "Spend 3 XP, [Exhaust]: Ready a unit" in P1's legal actions: (d) 2 XP, Rose ready, exhausted
 * Skulker; (e) 3 XP, Rose ready, exhausted Skulker; (f) 3 XP, Rose exhausted; (g) 3 XP, Rose
 * ready, but NO unit anywhere on the board?
 *
 * Rules: 383.3.a (a leading "you may" is decided at FINALIZATION by the controller), 383.3.b /
 * 383.3.b.1 (a cost right after that "you may" is the trigger's BASE COST and must be paid to
 * finalize), 404.2 / 404.2.a (declining/unpayable → removed from the chain, not countered), 402.3
 * (an activated ability with no legal option / unpayable cost is not legal to activate), 355.8
 * (valid targets required to put it on the chain), 355.9.a.1 ("a unit" = a unit on the board).
 *
 * Expected: (a) cost unpayable → the trigger can never be finalized: it is removed, XP unchanged,
 * and no Yes/No should be shown at all (its only honest answer is "no"). (b) P1 is asked at
 * finalization; YES deducts the [1] immediately (before P2 gets priority) and +1 XP on
 * resolution; NO keeps the energy. (c) P2's play triggers nothing. (d) absent. (e) listed;
 * activating spends 3 XP + exhausts the Rose up front, auto-binds the sole unit, readies it on
 * resolution. (f) absent. (g) absent — no unit on the board means no legal target (402.3, 355.8).
 */
import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BLOOD_ROSE = "unl-109-219";
const SKULKER = "ogn-175-298";

const ACTIVATE_KEY = "activateAbility:rose#1";

/** P1: Blood Rose in base, Skulker (3) in hand, `energy` in pool. P2 holds a Skulker too. */
function board(energy: number) {
  return scenario()
    .resources(P1, { energy })
    .resources(P2, { energy: 3 })
    .gear(P1, BLOOD_ROSE, "rose")
    .hand(P1, SKULKER, "sk")
    .hand(P2, SKULKER, "theirs");
}

/** P1: Blood Rose + `xp`; optionally an exhausted Skulker on the board. */
function activation(opts: { xp: number; roseExhausted?: boolean; skulker?: boolean }) {
  const s = scenario()
    .xp(P1, opts.xp)
    .gear(P1, BLOOD_ROSE, "rose", opts.roseExhausted ? { exhausted: true } : undefined);
  return opts.skulker === false ? s : s.unit(P1, "base", SKULKER, "sk", { exhausted: true });
}

describe("Blood Rose — 'you may pay [1]' is a finalization cost; unpayable ⇒ no prompt; activated half needs cost AND a target", () => {
  // ---- (a) last energy spent on the unit ---------------------------------------------------

  // DESIGN (DESIGN.md §Paying costs): deliberate deviation from 404.2 — the engine does NOT drop
  // the unpayable opt-in silently. The Yes/No is still offered with canAccept:false so a live
  // player may tap runes / use a Reaction [Add] source and only then accept ("pays demanded while
  // an ability resolves keep their prompt open"); the sibling specs assert that open prompt
  // (core-rules/paying-costs-energy-power "case 1 — cannot pay …", trigger-finalization, sfd-119,
  // sfd-180, sfd-210, ven-009, Blind Fury). "Yes" is rejected while it stays unpayable, and "no" —
  // or settle(), which auto-declines an opt-in nobody can accept — removes the item un-countered
  // with nothing paid (404.2, 383.3.b.1).
  test("(a) Skulker takes the last 3 energy → the Rose opt-in is OFFERED with canAccept:false; 'yes' is rejected; settle() declines it and lands back in P1's open main phase, XP unchanged", async () => {
    const game = await board(3).build();
    await game.p1.play("sk");
    expect(game.p1.energy()).toBe(0);
    expect(game.decision()).toMatchObject({ canAccept: false, kind: "yes-no", seat: P1, source: { cardId: "rose" }, timing: "FIN" });
    expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
    await game.settle(); // handed back once (the prompt stays open for a live player)
    const r = await game.settle(); // settling again declines it — it never blocks for good
    expect(r.reason).toBe("open");
    expect((game.decision() as ActionDecision)).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("sk")).toBe("base");
    expect(game.p1.xp()).toBe(0);
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(a) whatever the UI does, the rules outcome holds: 'yes' is not a legal answer, the trigger leaves the chain un-countered, Skulker resolves, XP stays 0, energy stays 0", async () => {
    const game = await board(3).build();
    await game.p1.play("sk");
    expect(game.p1.energy()).toBe(0);
    const d = game.decision();
    if (d?.kind === "yes-no") {
      expect(d).toMatchObject({ canAccept: false, seat: P1, source: { cardId: "rose" } });
      expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
      await game.p1.no();
    }
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("sk")).toBe("base");
    expect(game.p1.xp()).toBe(0);
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.chain().some((i) => i.countered)).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  // ---- (b) one energy left over ------------------------------------------------------------

  test("(b) 4 energy → Skulker paid (1 left): P1 — and only P1 — is asked Yes/No at FINALIZATION (timing FIN, source = the Rose), with 'yes' available", async () => {
    const game = await board(4).build();
    await game.p1.play("sk");
    expect(game.p1.energy()).toBe(1);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "rose" }, timing: "FIN" });
    expect(game.actingSeat()).toBe(P1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rose", controller: P1, triggered: true })]);
  });

  test("(b) YES deducts the [1] immediately — before P2 ever holds priority — and the XP arrives only when the ability resolves", async () => {
    const game = await board(4).build();
    await game.p1.play("sk");
    await game.p1.yes();
    expect(game.p1.energy()).toBe(0); // paid at finalization
    expect(game.p1.xp()).toBe(0); // not yet resolved
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rose", triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2); // P2 responds only now, with the cost already paid
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.xp()).toBe(0);
    await game.p2.passPriority();
    expect(game.p1.xp()).toBe(1);
    await game.settle();
    expect(game.zoneOf("sk")).toBe("base");
    expect(game.chain()).toEqual([]);
  });

  test("(b) NO removes the trigger (404.2 — not countered): energy stays 1, XP stays 0, nothing left on the chain", async () => {
    const game = await board(4).build();
    await game.p1.play("sk");
    await game.p1.no();
    await game.settle();
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.xp()).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("sk")).toBe("base");
  });

  // ---- (c) opponent's play -----------------------------------------------------------------

  test("(c) 'When YOU play a unit': P2 playing a Skulker on P2's turn asks nobody anything and P1's XP/energy are untouched", async () => {
    const game = await board(4).active(P2).build();
    await game.p2.play("theirs");
    expect(game.chain()).toEqual([]);
    expect(game.decision()?.kind).not.toBe("yes-no");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("theirs")).toBe("base");
    expect(game.p1.xp()).toBe(0);
    expect(game.p2.xp()).toBe(0);
    expect(game.p1.energy()).toBe(4);
  });

  // ---- (d)–(g) the activated ability's presence in legalActions ----------------------------

  test("(d) 2 XP, Rose ready, exhausted Skulker → 'Spend 3 XP, [Exhaust]' is NOT listed (cost unpayable, 402.3); forcing it fails and spends nothing", async () => {
    const game = await activation({ xp: 2 }).build();
    expect(game.p1.legal().map((o) => o.key)).not.toContain(ACTIVATE_KEY);
    expect(game.p1.can("activate", "rose")).toBe(false);
    expect((await game.p1.try((p) => p.activate("rose", 1))).ok).toBe(false);
    expect(game.p1.xp()).toBe(2);
    expect(game.state("rose").isReady).toBe(true);
    expect(game.state("sk").isExhausted).toBe(true);
  });

  test("(e) 3 XP, Rose ready, exhausted Skulker → listed; the only target offered is the Skulker", async () => {
    const game = await activation({ xp: 3 }).build();
    expect(game.p1.legal().map((o) => o.key)).toContain(ACTIVATE_KEY);
    const targets = game.p1.option("activate", "rose")?.fields.find((f) => f.name === "targets");
    expect((targets?.options ?? []).flat()).toEqual(["sk"]);
  });

  test("(e) activating pays 3 XP + exhausts the Rose up front, auto-binds the sole unit as target, and readies the Skulker on resolution", async () => {
    const game = await activation({ xp: 3 }).build();
    await game.p1.activate("rose"); // no `targets` given: the sole legal unit is bound without asking
    expect(game.p1.xp()).toBe(0);
    expect(game.state("rose").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rose", controller: P1, targets: ["sk"], triggered: false })]);
    expect(game.state("sk").isExhausted).toBe(true); // not until it resolves
    await game.settle();
    expect(game.state("sk").isReady).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.p1.can("activate", "rose")).toBe(false); // Rose is now exhausted
    expect(game.violations()).toEqual([]);
  });

  test("(f) 3 XP but the Rose is EXHAUSTED → not listed ([Exhaust] unpayable); XP untouched", async () => {
    const game = await activation({ roseExhausted: true, xp: 3 }).build();
    expect(game.state("rose").isExhausted).toBe(true);
    expect(game.p1.legal().map((o) => o.key)).not.toContain(ACTIVATE_KEY);
    expect((await game.p1.try((p) => p.activate("rose", 1))).ok).toBe(false);
    expect(game.p1.xp()).toBe(3);
  });

  test("(g) 3 XP, Rose ready, but NO unit anywhere on the board → not listed: 'Ready a unit' has no legal target (402.3, 355.8, 355.9.a.1); forcing it fails, nothing is spent, nothing hits the chain", async () => {
    const game = await activation({ skulker: false, xp: 3 }).build();
    expect(game.p1.units()).toEqual([]);
    expect(game.p2.units()).toEqual([]);
    expect(game.p1.legal().map((o) => o.key)).not.toContain(ACTIVATE_KEY);
    expect(game.p1.can("activate", "rose")).toBe(false);
    expect((await game.p1.try((p) => p.activate("rose", 1))).ok).toBe(false);
    expect(game.p1.xp()).toBe(3);
    expect(game.state("rose").isReady).toBe(true);
    expect(game.chain()).toEqual([]);
  });

  test("(g′) a unit in HAND or TRASH is not 'a unit' for targeting (355.9.a.1): still not listed with only off-board Skulkers", async () => {
    const game = await activation({ skulker: false, xp: 3 }).hand(P1, SKULKER, "inHand").trash(P1, SKULKER, "inTrash").build();
    expect(game.p1.legal().map((o) => o.key)).not.toContain(ACTIVATE_KEY);
    const withEnemy = await activation({ skulker: false, xp: 3 }).unit(P2, "base", SKULKER, "foe", { exhausted: true }).build();
    expect(withEnemy.p1.legal().map((o) => o.key)).toContain(ACTIVATE_KEY); // "a unit" — an enemy one on the board suffices
  });
});
