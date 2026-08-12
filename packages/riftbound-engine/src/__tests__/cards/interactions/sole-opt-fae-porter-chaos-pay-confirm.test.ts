/**
 * Interaction: a trigger whose COST leads its effect — the opt-in, the payment and the ability's
 * own (sole) choice all happen at finalization.
 *
 *   Fae Porter  (sfd-125-221) Unit · 4 · 4 Might
 *     "When I move to a battlefield, you may pay [chaos] to move a unit you control to the same
 *      battlefield."
 *   Pouty Poro  (ogn-013-298) 2 Might · [Deflect] — the only other friendly unit on the YES side.
 *   Shipyard Skulker (ogn-175-298) 3 Might — the second candidate on the NO side.
 *
 * Rules: 204.3.a (a cost that LEADS the effect is the triggered ability's BASE cost) · 383.3.a /
 * 383.3.a.2 / 404.1 (opt-in and payment at finalization; a declined "you may" item is removed) ·
 * 402.2 (the ability's own choices are made in the same step) · 429.3 / 429.3.a (Reaction [Add]
 * abilities stay legal while a payment window is open and resolve immediately) · 357.1.a (the Add
 * is credited to this payment) · 164.2.a (a tap adds ENERGY) · 164.2.b / 164.2.b.1 (recycling a
 * Chaos rune is what adds Chaos POWER) · 355.10.d.2 (being the only valid choice does NOT make a
 * selection programmatic — a confirm, not an auto-bind, and it still counts as choosing) ·
 * 420.1 / 420.2.a (an effect move; a unit already there has no legal move to its own location) ·
 * 420.3.a (a Standard Move exhausts — an effect move does not).
 *
 * Q: P1's turn, one READY Chaos rune, empty pool. P1 Standard-Moves Fae Porter to bf1.
 *    (a) does the opt-in prompt state its cost and list ONLY the recycle affordance — never the
 *        tap? Is Yes visible-but-DISABLED until a Chaos recycle lands, and is a Yes dispatched
 *        before that refused with the state untouched?
 *    (b) after paying, is the "move a unit you control" choice a sole-option CONFIRM prompt?
 *    (c) is Fae Porter itself excluded from that option list (it is already at bf1)?
 *    NO side: with a second friendly unit there are two candidates — ordinary targeting, no
 *        sole-option wording.
 *    (d) Rewind past the Standard Move: prompt gone with its cause, Porter back in base, rune
 *        ready, pip refunded.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const FAE_PORTER = "sfd-125-221";
const POUTY_PORO = "ogn-013-298";
const SHIPYARD_SKULKER = "ogn-175-298";

/** The served client bundle — `server/config.ts` serves `apps/riftbound-app/public` verbatim. */
const MODALS_JS = resolve(import.meta.dir, "../../../../../../apps/riftbound-app/public/js/gameplay/render/modals.js");

/**
 * P1's turn. Fae Porter and Pouty Poro in P1's base, ONE ready Chaos rune, empty pool, an empty
 * bf1 to Standard-Move into. `interactive()` so a `soleOption` prompt is handed back instead of
 * being auto-confirmed by the non-interactive driver.
 */
function board(extraCandidate = false) {
  const s = scenario()
    .interactive()
    .active(P1)
    .battlefield("bf1")
    .unit(P1, "base", FAE_PORTER, "porter")
    .unit(P1, "base", POUTY_PORO, "poro")
    .rune(P1, "chaos", { alias: "chaosRune" });
  return extraCandidate ? s.unit(P1, "base", SHIPYARD_SKULKER, "skulker") : s;
}

const addActions = (game: Game) =>
  ((game.decision() as { actions?: readonly { verb: string; card?: string }[] }).actions ?? []).filter(
    (a) => a.verb !== "concede",
  );

/** Standard-Move the Porter to bf1 and stop on the opt-in prompt. */
async function moved(extraCandidate = false): Promise<Game> {
  const game = await board(extraCandidate).build();
  await game.p1.move("porter", "bf1");
  return game;
}

/** …then recycle for [chaos], accept, and stop on the ability's own target choice. */
async function paidAndAccepted(extraCandidate = false): Promise<Game> {
  const game = await moved(extraCandidate);
  await game.p1.recycleRune("chaosRune", "chaos");
  await game.p1.yes();
  return game;
}

describe("Fae Porter [chaos] pay-in-prompt × a sole-option move confirm (355.10.d.2)", () => {
  test("BUILD CHECK: the served client bundle carries the sole-option strings and the prompt-pay block", () => {
    const src = readFileSync(MODALS_JS, "utf8");
    expect(src).toContain("Only one legal choice — confirm it");
    expect(src).toContain('"Confirm "');
    expect(src).toContain("still owed");
  });

  test("BUILD CHECK: the engine frame exposes `soleOption` on the decision it hands back", async () => {
    const game = await paidAndAccepted();
    expect(game.decision()).toMatchObject({ kind: "pick", soleOption: true });
  });

  test("(a) the opt-in prompt names the cost and is a Pay window: `needsAdd` says [chaos] is still owed, and Yes stays offered while nothing has been added", async () => {
    const game = await moved();
    expect(game.decision()).toMatchObject({
      canAccept: true, // 429.3 — payable once an Add lands, so the button is shown, not hidden
      kind: "yes-no",
      needsAdd: { power: { chaos: 1 } },
      seat: P1,
      source: { cardId: "porter", pendingChoiceType: "opt-in" },
      timing: "FIN", // 383.3.a / 404.1 — opt-in AND payment at finalization
    });
    expect(game.decision()?.prompt).toContain("Pay [chaos]");
  });

  test("(a) dispatching Yes before the pip exists is REFUSED and leaves the state untouched", async () => {
    const game = await moved();
    const attempt = await game.p1.try((p) => p.yes());
    expect(attempt.ok).toBe(false);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.p1.runes({ ready: true })).toEqual(["chaosRune"]);
    expect(game.chain()).toHaveLength(1);
    expect(game.decision()).toMatchObject({ kind: "yes-no", needsAdd: { power: { chaos: 1 } } });
    expect(game.locationOf("poro")).toBe("base");
  });

  // rule 164.2.a vs 164.2.b: [chaos] is a POWER pip, so only the recycle can pay it — but the tap
  // is offered alongside it, and correctly so. 429.3 admits every Reaction [Add] whenever a cost
  // must be paid (ruling e2a35c364b15734f answers the same question for Power Nexus: "can you float
  // energy while paying its cost?" — yes), and 594 puts no readiness condition on recycling, so a
  // tapped rune is STILL recyclable for its Domain. The tap is therefore never a one-way door that
  // could strand the [chaos]; it simply buys nothing toward it. What must not happen is the modal
  // naming the tap as the way to pay a Power pip — that is 037fdcf's affordance-row wording, not a
  // legality question.
  test("the Pay window offers BOTH rune Adds and neither can strand the payment — the tap floats Energy, and 594 leaves the same rune recyclable for the [chaos] afterwards", async () => {
    const game = await moved();
    expect(addActions(game).map((a) => a.verb).sort()).toEqual(["recycleRune", "tapRune"]);
    await game.p1.tapRune("chaosRune");
    expect(game.p1.resources()).toEqual({ energy: 1, power: {} });
    expect(game.decision()).toMatchObject({ canAccept: true, needsAdd: { power: { chaos: 1 } } });
    // 594 — the exhausted rune still recycles, so the [chaos] is never stranded.
    await game.p1.recycleRune("chaosRune", "chaos");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { chaos: 1 } });
    expect((game.decision() as { needsAdd?: unknown }).needsAdd).toBeUndefined();
  });

  test("(a) the prompt SURVIVES the Add: recycling for [chaos] resolves immediately (429.3.a), is credited to this payment (357.1.a) and flips the owed line to nothing", async () => {
    const game = await moved();
    await game.p1.recycleRune("chaosRune", "chaos");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 1 } });
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", source: { pendingChoiceType: "opt-in" } });
    expect((game.decision() as { needsAdd?: unknown }).needsAdd).toBeUndefined();
    await game.p1.yes();
    expect(game.p1.power("chaos")).toBe(0); // the base cost was paid out of the pool
    expect(game.p1.energy()).toBe(0);
  });

  test("(b)+(c) the sole legal mate is a CONFIRM, not an auto-bind: one option, flagged `soleOption`, and Fae Porter — already at bf1 — is not among the candidates (420.1 / 420.2.a)", async () => {
    const game = await paidAndAccepted();
    const d = game.decision() as unknown as { kind: string; min: number; max: number; options: { card?: string }[]; soleOption?: true };
    expect(d.kind).toBe("pick");
    expect(d.soleOption).toBe(true);
    expect(d).toMatchObject({ max: 1, min: 1 });
    expect(d.options.map((o) => o.card)).toEqual(["poro"]);
    expect(d.options.map((o) => o.card)).not.toContain("porter");
    expect(game.locationOf("poro")).toBe("base"); // nothing has moved yet — it is still a choice
  });

  test("(b) confirming moves the Poro as an EFFECT move: it lands at bf1 unexhausted (420.2.a), unlike the Standard Move that started this (420.3.a)", async () => {
    const game = await paidAndAccepted();
    await game.p1.pick("poro");
    await game.settle();
    expect(game.locationOf("poro")).toBe("bf1");
    expect(game.state("poro").isExhausted).toBe(false);
    expect(game.locationOf("porter")).toBe("bf1");
    expect(game.state("porter").isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("NO side: a second friendly unit makes two candidates — ordinary targeting, and the sole-option flag must NOT appear", async () => {
    const game = await paidAndAccepted(true);
    const d = game.decision() as unknown as { kind: string; options: { card?: string }[]; soleOption?: true };
    expect(d.kind).toBe("pick");
    expect(d.soleOption).toBeUndefined();
    expect([...d.options.map((o) => o.card)].sort()).toEqual(["poro", "skulker"]);
    await game.p1.pick("skulker");
    await game.settle();
    expect(game.locationOf("skulker")).toBe("bf1");
    expect(game.locationOf("poro")).toBe("base");
  });

  test("(d) Rewind past the Standard Move: the trigger exists only as a consequence of the move, so the prompt goes with its cause — Porter back in base and ready, rune ready again, pip refunded, chain empty", async () => {
    const game = await paidAndAccepted();
    expect(game.decision()).toMatchObject({ soleOption: true });

    expect(game.undo()).toBe(true); // un-accept: back to the opt-in prompt, pip still in pool
    expect(game.decision()).toMatchObject({ kind: "yes-no", source: { pendingChoiceType: "opt-in" } });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 1 } });

    expect(game.undo()).toBe(true); // un-recycle: pip refunded, rune ready again
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.p1.runes({ ready: true })).toEqual(["chaosRune"]);

    expect(game.undo()).toBe(true); // un-move: the cause is gone, so the pending item goes too
    expect(game.locationOf("porter")).toBe("base");
    expect(game.state("porter").isExhausted).toBe(false);
    expect(game.chain()).toHaveLength(0);
    expect(game.decision()?.kind).toBe("action");
    expect(game.locationOf("poro")).toBe("base");
    expect(game.violations()).toEqual([]);
  });
});
