/**
 * Interaction: Fire Below the Mountain (sfd-189-221, Legend · Ornn)
 *     "[Exhaust]: [Reaction] — [Add] [rainbow]. Use only to play gear or use gear abilities."
 *   vs Daughter of the Void (ogn-247-298, Legend · Kai'Sa)
 *     "[Exhaust]: [Reaction] — [Add] [rainbow]. Use only to play spells."
 *   × Hextech Anomaly (sfd-083-221, Gear) "[Exhaust]: [Reaction] — Pay any amount of [rainbow] to [Add] that much Energy."
 *   with an inline pip-less 1-cost unit ("Grunt") and an inline 0 + [fury] spell ("Spark": draw 1) in hand.
 *
 * Question: P1's turn, pool 0/0, ready Anomaly. P1 exhausts the legend → 1 earmarked [rainbow].
 *   (a) Is Hextech Anomaly's activation with X = 1 enumerated — may the earmarked rainbow be PAID INTO the Anomaly?
 *   (b) If so, is the resulting Energy itself earmarked — is the pip-less 1-cost unit enumerated afterwards?
 *   (c) Daughter side: which X values are offered and what can the rainbow still do?
 *
 * Rules: 429.1 / 166.1 (Adding puts a NEW resource into the pool — the Anomaly's Energy is created by the Anomaly's own
 * Add instruction, so an earmark on the resource that PAID for it does not propagate), 429.2 (Add abilities resolve at
 * once, no chain), 444.1 (paying = removing from the pool; the printed "use only to …" restricts what that removal may
 * be for), 135.2.e.5.b ([rainbow] pays a Power pip of any domain), 317.2.d (unspent resources empty at end of turn).
 *
 * Expected: (a) Fire Below: paying the Anomaly's [rainbow] cost is "using a gear ability" → X ∈ {0, 1}. Daughter: using a
 * gear ability is not playing a spell → only the inert X = 0 is offered; X = 1 is illegal. (b) Fire Below → Anomaly X=1:
 * both exhausted, pool = 1 ORDINARY Energy / 0 Power, the Grunt is now enumerated (it was not before) and playing it
 * empties the pool. (c) Daughter: pool keeps 1 spell-only rainbow; Spark (a spell, [fury] pip payable by rainbow) is
 * enumerated, the Grunt is not; unspent, the rainbow is lost at end of turn.
 */
import { describe, expect, test } from "bun:test";
import type { Game, SeatHandle } from "../../../harness";
import { P1, scenario } from "../../../harness";

const FIRE_BELOW = "sfd-189-221";
const DAUGHTER = "ogn-247-298";
const HEXTECH_ANOMALY = "sfd-083-221";

/** P1's turn, empty pool, ready Anomaly, Grunt (1, no pip) + Spark (0 + [fury]) in hand; `legend` decides the side. */
function board(legend: string) {
  return scenario()
    .legend(P1, legend, "legend")
    .gear(P1, HEXTECH_ANOMALY, "anomaly")
    .hand(P1, { cardType: "unit", energyCost: 1, might: 1, name: "Grunt" }, "grunt")
    .hand(
      P1,
      {
        abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
        cardType: "spell",
        domain: "fury",
        energyCost: 0,
        name: "Spark",
        powerCost: ["fury"],
        timing: "action",
      },
      "spark",
    );
}

/** The X values the Anomaly's activation currently offers (union of the x field options and enumerated variants). */
function xOffered(seat: SeatHandle): number[] {
  const opt = seat.option("activate", "anomaly");
  if (!opt) {
    return [];
  }
  const fromFields = opt.fields.filter((f) => f.name === "xAmount").flatMap((f) => (f.options ?? []) as number[]);
  const fromVariants = opt.variants.map((v) => v.params.xAmount).filter((x): x is number => typeof x === "number");
  return [...new Set([...fromFields, ...fromVariants])].sort();
}

/** Activate the Anomaly choosing X (however the engine exposes X). */
async function anomalyX(seat: SeatHandle, x: number): Promise<void> {
  const opt = seat.option("activate", "anomaly");
  if (!opt) {
    await seat.activate("anomaly", 0); // throws with the legal menu
    return;
  }
  await seat.choose(opt.key, { params: { xAmount: x }, x });
  const d = seat.game.decision();
  if (d?.kind === "integer" && d.seat === seat.seat) {
    await seat.chooseX(x);
  }
}

function restrictedEnergy(game: Game): unknown {
  return (game.gameState as { restrictedEnergy?: Record<string, unknown> }).restrictedEnergy?.[P1];
}

describe("Fire Below the Mountain vs Daughter of the Void × Hextech Anomaly — can an earmarked rainbow be laundered into Energy?", () => {
  // ------------------------------------------------------------------ common ground
  test("setup (both sides): pool 0/0 → neither hand card is enumerated and the Anomaly only offers X = 0", async () => {
    for (const legend of [FIRE_BELOW, DAUGHTER]) {
      const game = await board(legend).build();
      expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
      expect(game.state("anomaly").isReady).toBe(true);
      expect(game.p1.can("play", "grunt")).toBe(false);
      expect(game.p1.can("cast", "spark")).toBe(false);
      expect(game.p1.can("activate", "legend")).toBe(true);
      expect(xOffered(game.p1)).toEqual([0]);
    }
  });

  test("exhausting either legend Adds 1 [rainbow] at once — legend exhausted, no chain item, still P1's open main phase (429.2)", async () => {
    for (const legend of [FIRE_BELOW, DAUGHTER]) {
      const game = await board(legend).build();
      await game.p1.activate("legend");
      expect(game.state("legend").isExhausted).toBe(true);
      expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
      expect(game.chain()).toEqual([]);
      expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    }
  });

  // ------------------------------------------------------------------ (a)/(b) Fire Below the Mountain — YES
  test("(a) Fire Below: the gear-earmarked rainbow may be paid INTO the Anomaly — X ∈ {0, 1} is enumerated; on its own it pays for neither the unit nor the spell", async () => {
    const game = await board(FIRE_BELOW).build();
    await game.p1.activate("legend");
    expect(xOffered(game.p1)).toEqual([0, 1]);
    expect(game.p1.can("play", "grunt")).toBe(false); // gear-only rainbow is Power anyway, and not for units
    expect(game.p1.can("cast", "spark")).toBe(false); // could pay the [fury] pip (135.2.e.5.b) — but Spark is not gear
  });

  test("(b) Fire Below → Anomaly X = 1: legend + Anomaly exhausted, pool = 1 ORDINARY Energy / 0 Power, no chain used (429.2), no energy earmark (429.1/166.1)", async () => {
    const game = await board(FIRE_BELOW).build();
    await game.p1.activate("legend");
    await anomalyX(game.p1, 1);
    expect(game.state("legend").isExhausted).toBe(true);
    expect(game.state("anomaly").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.power()).toBe(0);
    expect(restrictedEnergy(game) ?? {}).toEqual({});
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(b) …so the pip-less 1-cost Grunt is NOW enumerated (it was not before); playing it lands it in base and empties the pool", async () => {
    const game = await board(FIRE_BELOW).build();
    await game.p1.activate("legend");
    expect(game.p1.can("play", "grunt")).toBe(false);
    await anomalyX(game.p1, 1);
    expect(game.p1.can("play", "grunt")).toBe(true);
    expect(game.p1.can("cast", "spark")).toBe(false); // the rainbow is gone; 1 energy pays no [fury] pip
    await game.p1.play("grunt");
    await game.settle();
    expect(game.zoneOf("grunt")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("(a) Fire Below → Anomaly X = 0 is the inert activation: Anomaly exhausts, nothing paid, nothing added — the earmarked rainbow is still there and still can't buy the Grunt", async () => {
    const game = await board(FIRE_BELOW).build();
    await game.p1.activate("legend");
    await anomalyX(game.p1, 0);
    expect(game.state("anomaly").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(game.p1.can("play", "grunt")).toBe(false);
    expect(game.p1.can("cast", "spark")).toBe(false);
  });

  // ------------------------------------------------------------------ (c) Daughter of the Void — NO
  test("(c) Daughter: the spell-only rainbow pays Spark's [fury] pip (135.2.e.5.b) — Spark IS enumerated, the Grunt is not", async () => {
    const game = await board(DAUGHTER).build();
    await game.p1.activate("legend");
    expect(game.p1.can("cast", "spark")).toBe(true);
    expect(game.p1.can("play", "grunt")).toBe(false);
  });

  test("(c) Daughter: activating a gear ability is not 'playing a spell' — only X = 0 may be offered for the Anomaly, never X = 1 (444.1 + printed restriction)", async () => {
    // Expected: xOffered = [0] — the only Power in the pool is spell-earmarked and cannot be removed to pay a gear's
    // activation cost. Actual: the engine enumerates X ∈ {0, 1}; the earmark is only enforced against card PLAYS.
    const game = await board(DAUGHTER).build();
    await game.p1.activate("legend");
    expect(game.p1.can("activate", "anomaly")).toBe(true); // X = 0 keeps it activatable
    expect(xOffered(game.p1)).toEqual([0]);
  });

  test("(c) Daughter: forcing Anomaly X = 1 is rejected — the rainbow stays in the pool, no Energy appears, the Grunt stays unplayable", async () => {
    // Expected: the X = 1 activation is illegal (throws); pool still {0, rainbow 1}; Grunt not enumerated.
    // Actual: it succeeds — the spell-only rainbow is spent on a gear ability and laundered into 1 free Energy that
    // then plays the unit.
    const game = await board(DAUGHTER).build();
    await game.p1.activate("legend");
    const r = await game.p1.try((p) => anomalyX(p, 1));
    expect(r.ok).toBe(false);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(game.p1.can("play", "grunt")).toBe(false);
  });

  test("(c) Daughter → Anomaly X = 0 (the only legal activation): Anomaly exhausts, pays and adds nothing; Spark still castable and casting it spends the rainbow", async () => {
    const game = await board(DAUGHTER).build();
    await game.p1.activate("legend");
    await anomalyX(game.p1, 0);
    expect(game.state("anomaly").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(game.chain()).toEqual([]);
    expect(game.p1.can("play", "grunt")).toBe(false);
    expect(game.p1.can("cast", "spark")).toBe(true);
    const hand = game.p1.hand().length;
    await game.p1.cast("spark");
    await game.settle();
    expect(game.zoneOf("spark")).toBe("trash");
    expect(game.p1.power()).toBe(0);
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1); // Spark left, drew 1
  });

  test("(c) Daughter: left unspent, the spell-only rainbow empties at end of turn (317.2.d) — nothing carries into P1's next turn", async () => {
    const game = await board(DAUGHTER).build();
    await game.p1.activate("legend");
    expect(game.p1.power("rainbow")).toBe(1);
    await game.advanceTurn(); // → P2
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.advanceTurn(); // → P1 again: legend readied, pool only what the new turn channeled (no rainbow)
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.power("rainbow")).toBe(0);
    expect(game.state("legend").isReady).toBe(true);
  });
});
