/**
 * Interaction: stealing a spell with Rebuttal makes a formerly untargetable unit choosable.
 *
 *   Rebuttal (ven-152-166) · Spell 1 [rainbow] · [Reaction]
 *     "Choose a spell with Energy cost no more than [4]. You may pay [rainbow]. If you do,
 *      gain control of it and you may make new choices for it. Otherwise, counter it."
 *   Master Yi, Unstoppable (unl-059-219) · Unit 12 [calm][calm][calm] · 12 [Might]
 *     "[Level 16][>] I can't be chosen by enemy spells and abilities."
 *   Discipline (ogn-058-298) · Spell 2 · [Reaction] · "Give a unit +2 [Might] this turn. Draw 1."
 *   (plus Jae Medarda sfd-142-221 "When you choose me with a spell, draw 1" as the 754 witness)
 *
 * Rules: 757.1 / 758.2 / 758.2.a (a "can't be chosen by ENEMY …" restriction removes the
 * object from the choosable set relative to the CHOOSER) · 191.2 (a spell's controller owns
 * its effects, and "enemy/friendly" is read from them) · 751.1 (a new choice must include an
 * object not chosen before) · 752.1 / 752.2 (only targets, modes, destinations, locations may
 * be remade — never "as you play this" choices or optional additional costs) ·
 * 753.1 / 753.2 (no illegal new choice; no legal one ⇒ no new choices at all) ·
 * 754 (targeting triggers of the newly chosen object fire now) · 755 (no cost is charged for
 * a new choice — the [Deflect] surcharge is a cost of PLAYING and is not reassessed).
 *
 * Q: P1 gives its own unit +2 with Discipline; P2 Rebuttals it, pays the [rainbow] and takes
 *    control. (a) may P2 now aim it at its own Level-16 Master Yi — illegal a moment earlier?
 *    (b) who draws? (c) what if no new choice is available? (d) does the re-choice trigger the
 *    newly chosen object's "when you choose me"?
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REBUTTAL = "ven-152-166";
const MASTER_YI = "unl-059-219";
const DISCIPLINE = "ogn-058-298";
const JAE_MEDARDA = "sfd-142-221"; // "When you choose me with a spell, draw 1."

/** Flatten the `targets` field of a cast option into the set of card ids offered. */
function targetsOffered(game: Game, seat: "p1" | "p2", alias: string): string[] {
  const field = game[seat].option("cast", alias)?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/**
 * P1's turn. P2 controls a Level-16 Master Yi, Jae Medarda and a [Deflect] Ox; P1 has one
 * unit of its own and Discipline; P2 holds Rebuttal with the extra [rainbow] for the steal.
 */
function board(extras: { jae?: boolean; ox?: boolean; mineOnly?: boolean } = {}) {
  let s = scenario()
    .active(P1)
    .xp(P2, 16)
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .resources(P2, { energy: 1, power: { rainbow: 2 } })
    .unit(P1, "base", { might: 2, name: "Mine" }, "mine")
    .hand(P1, DISCIPLINE, "discipline")
    .hand(P2, REBUTTAL, "rebuttal");
  if (!extras.mineOnly) {
    s = s.unit(P2, "base", MASTER_YI, "yi");
  }
  if (extras.jae) {
    s = s.unit(P2, "base", JAE_MEDARDA, "jae");
  }
  if (extras.ox) {
    s = s.unit(P2, "base", { keywords: ["Deflect"], might: 3, name: "Warded Ox" }, "ox");
  }
  return s;
}

/** P1 casts Discipline on its own unit; P2 Rebuttals it and pays the [rainbow] to take control. */
async function stolen(extras: Parameters<typeof board>[0] = {}): Promise<Game> {
  const game = await board(extras).build();
  await game.p1.cast("discipline", { targets: "mine" });
  await game.p1.passPriority();
  await game.p2.cast("rebuttal", { targets: "discipline" });
  await game.p2.passPriority();
  await game.p1.passPriority(); // Rebuttal resolves…
  expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P2 });
  await game.p2.yes(); // …"You may pay [rainbow]" — the Pay game action (205), taken
  return game;
}

describe("Rebuttal takes the spell, and 'enemy' is re-read from the new controller", () => {
  test("before the steal, P1's Discipline cannot even offer Master Yi (757.1 / 758.2) — ordinary enemy units are fine", async () => {
    const game = await board({ jae: true, ox: true }).build();
    const offered = targetsOffered(game, "p1", "discipline");
    expect(offered).toContain(game.card("mine"));
    expect(offered).toContain(game.card("jae"));
    expect(offered).toContain(game.card("ox")); // Deflect is a surcharge, not a ban — P1 has the spare [rainbow]
    expect(offered).not.toContain(game.card("yi"));
    expect((await game.p1.try((p) => p.cast("discipline", { targets: "yi" }))).ok).toBe(false);
    expect(game.state("yi").keywords).toContain("Untargetable");
  });

  test("(a) after Rebuttal resolves, the SAME spell offers Yi as a new choice — the object left the untargetable set (758.2.a / 191.2)", async () => {
    const game = await stolen();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2, allowDecline: true, min: 0, max: 1 });
    expect(d).toMatchObject({
      newChoices: { grantedBy: "rebuttal", itemId: "chain-1", slot: { current: ["mine"], kind: "target" } },
    });
    const opts = (d as unknown as { options: { key: string; current?: boolean }[] }).options;
    expect(opts.map((o) => o.key)).toContain("yi"); // ← the whole point
    expect(opts.find((o) => o.key === "mine")).toMatchObject({ current: true }); // 751.1: the old choice is marked
    expect(game.chain()).toMatchObject([{ cardId: "discipline", controller: P2 }]); // control really moved
  });

  test("(b) the new controller gets everything: Yi takes the +2 and P2 draws the card (191.2)", async () => {
    const game = await stolen();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.p2.pick("yi");
    await game.settle();

    expect(game.state("yi").might).toBe(14); // 12 + 2 this turn
    expect(game.state("mine").might).toBe(2); // the original target got nothing
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.p1.hand()).toHaveLength(p1Hand);
    expect(game.zoneOf("discipline")).toBe("trash");
    expect(game.zoneOf("rebuttal")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("(d) rule 754: the newly chosen object's targeting trigger fires at the moment of the new choice", async () => {
    const game = await stolen({ jae: true });
    const p2Hand = game.p2.hand().length;
    await game.p2.pick("jae"); // Jae Medarda: "When you choose me with a spell, draw 1."
    await game.settle();

    expect(game.state("jae").might).toBe(7); // 5 + 2
    expect(game.p2.hand()).toHaveLength(p2Hand + 2); // Jae's trigger + Discipline's own draw
  });

  test("(755) a [Deflect] unit is still offered with an EMPTY pool, and re-choosing it charges nothing", async () => {
    const game = await stolen({ ox: true });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } }); // Rebuttal ate both pips
    const opts = (game.decision() as unknown as { options: { key: string }[] }).options.map((o) => o.key);
    expect(opts).toContain("ox");

    await game.p2.pick("ox");
    await game.settle();
    expect(game.state("ox").might).toBe(5); // 3 + 2
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } }); // no surcharge, no refund
  });

  test("(c) keeping the current choice is allowed: Discipline still resolves — on P1's unit, but for P2", async () => {
    const game = await stolen();
    const p2Hand = game.p2.hand().length;
    await game.p2.decline(); // "keep current choice"
    await game.settle();
    expect(game.state("mine").might).toBe(4); // 2 + 2 — the original target stands
    expect(game.p2.hand()).toHaveLength(p2Hand + 1); // …and the draw is still the new controller's
  });

  test("(c) with no other object on the board there is NO new-choices prompt at all (753.2) — the spell resolves as it was, under P2", async () => {
    const game = await board({ mineOnly: true }).build();
    await game.p1.cast("discipline", { targets: "mine" });
    await game.p1.passPriority();
    await game.p2.cast("rebuttal", { targets: "discipline" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.p2.yes(); // pay the [rainbow] and take control

    // 751.1 needs an object not chosen before; there is none, so nothing is asked (753.2).
    expect(game.decision()?.kind).not.toBe("pick");
    await game.settle();
    expect(game.state("mine").might).toBe(4);
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.p1.hand()).toHaveLength(p1Hand);
    expect(game.violations()).toEqual([]);
  });

  test("declining the optional [rainbow] instead COUNTERS the spell (the 'Otherwise' branch): nobody draws and nothing is buffed", async () => {
    const game = await board().build();
    await game.p1.cast("discipline", { targets: "mine" });
    await game.p1.passPriority();
    await game.p2.cast("rebuttal", { targets: "discipline" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.p2.no();
    await game.settle();

    expect(game.zoneOf("discipline")).toBe("trash");
    expect(game.state("mine").might).toBe(2);
    expect(game.p1.hand()).toHaveLength(p1Hand);
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.p2.power("rainbow")).toBe(1); // the optional pip was never spent
  });
});
