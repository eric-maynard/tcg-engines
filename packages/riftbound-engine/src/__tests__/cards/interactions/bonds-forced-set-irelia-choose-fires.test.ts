/**
 * Interaction: a FORCED target set is still a set of CHOICES — and choosing your own [Deflect]
 * bodies costs nothing.
 *
 *   Bonds of Strength (sfd-151-221) [Reaction] Spell · 2 · [Repeat] [2]
 *     "Give two friendly units each +1 [Might] this turn."
 *   Irelia, Fervent   (sfd-057-221) 4 Might · [Deflect]
 *     "When you choose or ready me, give me +1 [Might] this turn."
 *   Pouty Poro        (ogn-013-298) 2 Might · [Deflect]
 *
 * Rules: 355.5 (targets are chosen as the spell is played) · 355.10.d.2 (an object that is the only
 * valid choice when the spell goes on the chain is still CHOSEN, not programmatically selected) ·
 * 355.14.d (each target of a multi-target instruction is valid and counted individually) ·
 * 383.3 (the resulting trigger is its own chain item) · 402.2 · 809.1.c (the [Deflect] surcharge is
 * owed only by a spell or ability an OPPONENT controls).
 *
 * Q: P1 controls EXACTLY two units — Irelia and the Poro — and plays Bonds of Strength, whose legal
 *    answer set has exactly one member.
 *    (a) does the frame mark the forced pair as a sole option, and does the engine record TWO
 *        chosen targets?
 *    (b) does confirming actually count as CHOOSING Irelia — her "when you choose me" trigger on
 *        the chain, ending 4 + 1 (Bonds) + 1 (her own trigger) = 6, with the Poro at 3?
 *    (c) is ANY Power owed for the two [Deflect] units? (No — they are P1's own.)
 *    (d) NO side: a third friendly unit makes three legal 2-subsets → ordinary targeting.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const BONDS_OF_STRENGTH = "sfd-151-221";
const IRELIA = "sfd-057-221";
const POUTY_PORO = "ogn-013-298";
const SHIPYARD_SKULKER = "ogn-175-298";

/** The served client bundle — `server/config.ts` serves `apps/riftbound-app/public` verbatim. */
const MODALS_JS = resolve(import.meta.dir, "../../../../../../apps/riftbound-app/public/js/gameplay/render/modals.js");

/**
 * P1's turn, EXACTLY 2 energy and a COMPLETELY EMPTY Power pool (so any surcharge would make the
 * play unaffordable), Irelia + Pouty Poro in base, Bonds of Strength in hand.
 * `interactive()` so a `soleOption` prompt would be handed back rather than auto-confirmed.
 */
function board(thirdUnit = false) {
  const s = scenario()
    .interactive()
    .active(P1)
    .resources(P1, { energy: 2 })
    .unit(P1, "base", IRELIA, "irelia")
    .unit(P1, "base", POUTY_PORO, "poro")
    .hand(P1, BONDS_OF_STRENGTH, "bonds");
  return thirdUnit ? s.unit(P1, "base", SHIPYARD_SKULKER, "skulker") : s;
}

interface TargetsField {
  readonly name: string;
  readonly min?: number;
  readonly max?: number;
  readonly options?: readonly unknown[];
  readonly soleOption?: true;
}
const targetsField = (game: Game): TargetsField | undefined =>
  game.p1.option("cast", "bonds")?.fields.find((f) => f.name === "targets") as TargetsField | undefined;

describe("Bonds of Strength forced 2-set × Irelia's choose-trigger (355.10.d.2 / 809.1.c)", () => {
  test("BUILD CHECK: the served client bundle carries the sole-option strings", () => {
    const src = readFileSync(MODALS_JS, "utf8");
    expect(src).toContain("Only one legal choice — confirm it");
    expect(src).toContain('"Confirm "');
  });

  // Expected (355.10.d.2): the frame flags a choice with exactly one legal answer so the client can
  // render a confirm — and that must hold for a MULTI-pick answer (this forced 2-set) exactly as it
  // does for a single one. Actual: `soleOption` is stamped only where `options.length === 1`
  // (`harness/decision.ts`, `moves/chain/resolve.ts`), and a spell's play-time target set is a move
  // PARAMETER rather than a pendingChoice, so nothing marks the one legal pair at all — a client
  // cannot tell a forced pair from ordinary targeting.
  test("the FORCED 2-set is marked as a sole option — `soleOption` is stamped only on single-option prompts, never on a multi-pick whose answer set has exactly one member (355.10.d.2)", async () => {
    const game = await board().build();
    expect(targetsField(game)?.options).toHaveLength(1);
    expect(targetsField(game)?.soleOption).toBe(true);
  });

  test("(a) what is NOT optional: the engine records TWO chosen targets — the targets field is a 2-of-2 pick whose single legal answer is exactly [Irelia, Poro]", async () => {
    const game = await board().build();
    const f = targetsField(game);
    expect(f).toMatchObject({ max: 2, min: 2 });
    expect(f?.options).toEqual([["irelia", "poro"]]);
  });

  test("(b) confirming IS choosing Irelia: her trigger goes on the chain as a separate item (383.3), and both units are targets (355.14.d)", async () => {
    const game = await board().build();
    await game.p1.cast("bonds", { targets: ["irelia", "poro"] });
    // Bonds itself plus Irelia's "when you choose me" trigger — one item each. (LIFO puts the
    // trigger on top, so it resolves first; the total is the same either way.)
    expect(game.chain()).toHaveLength(2);
    expect(game.chain().map((i) => i.cardId)).toEqual(expect.arrayContaining(["bonds", "irelia"]));
    expect(game.chain().find((i) => i.cardId === "irelia")?.triggered).toBe(true);
  });

  test("(b) she ends 4 + 1 (Bonds) + 1 (her own trigger) = 6 this turn and the Poro ends 3 — the choose-trigger fires exactly ONCE off that one choice", async () => {
    const game = await board().build();
    await game.p1.cast("bonds", { targets: ["irelia", "poro"] });
    await game.settle();
    expect(game.state("irelia").might).toBe(6);
    expect(game.state("poro").might).toBe(3);
    expect(game.zoneOf("bonds")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("(b) it is 'this turn' only: both bonuses lapse in the Expiration Step", async () => {
    const game = await board().build();
    await game.p1.cast("bonds", { targets: ["irelia", "poro"] });
    await game.settle();
    await game.advanceTurn();
    expect(game.state("irelia").might).toBe(4);
    expect(game.state("poro").might).toBe(2);
  });

  test("(c) NOTHING is owed for choosing your own [Deflect] bodies (809.1.c prices only an OPPONENT's spell): the play is legal at a completely empty Power pool and costs exactly the printed 2 energy", async () => {
    const game = await board().build();
    expect(game.p1.resources()).toEqual({ energy: 2, power: {} });
    expect(game.p1.can("cast", "bonds")).toBe(true);
    await game.p1.cast("bonds", { targets: ["irelia", "poro"] });
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.resources().power).toEqual({}); // no surcharge pip was taken or demanded
    await game.settle();
    expect(game.state("irelia").might).toBe(6);
  });

  test("(c) and no surcharge is even quoted: the cast option carries a single variant with no extra cost field beyond `targets`", async () => {
    const game = await board().build();
    const opt = game.p1.option("cast", "bonds");
    expect(opt?.fields.map((f) => f.name)).toEqual(["targets"]);
    expect(opt?.variantCount).toBe(1);
  });

  test("(d) NO side: a third friendly unit gives three legal 2-subsets — ordinary targeting, a 2-of-3 pick, and no sole-option marking", async () => {
    const game = await board(true).build();
    const f = targetsField(game);
    expect(f).toMatchObject({ max: 2, min: 2 });
    expect(f?.options).toHaveLength(3);
    expect(f?.options).toEqual([
      ["irelia", "poro"],
      ["irelia", "skulker"],
      ["poro", "skulker"],
    ]);
    expect(f?.soleOption).toBeUndefined();
    // Nothing is auto-bound: the caster must name a pair.
    const ambiguous = await game.p1.try((p) => p.cast("bonds"));
    expect(ambiguous.ok).toBe(false);

    await game.p1.cast("bonds", { targets: ["poro", "skulker"] });
    await game.settle();
    expect(game.state("poro").might).toBe(3);
    expect(game.state("skulker").might).toBe(4);
    expect(game.state("irelia").might).toBe(4); // not chosen → no Bonds bonus and no trigger
  });
});
