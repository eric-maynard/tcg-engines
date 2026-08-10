/**
 * Interaction: Fizz, Trickster (sfd-140-221) · Champion Unit · Chaos · 3+[chaos] · 3 Might
 *     "When you play me, you may play a spell from your trash with Energy cost no more than [3], ignoring its Energy
 *      cost. Recycle that spell after you play it. (You must still pay its Power cost.)"
 *   × Frigid Touch (sfd-066-221) · Spell · Mind · 2 · [Reaction] [Repeat] [2] — "Give a unit −2 [Might] this turn."
 *   × Marai Spire (sfd-211-221) · Battlefield — "While you control this battlefield, friendly [Repeat] costs cost [1] less."
 *   × Pouty Poro (ogn-013-298) · Unit · Fury · 2 · 2 Might — "[Deflect]" (+ a vanilla 4-Might P2 unit).
 *
 * Rules: 419.3.b (an effect-play runs every step of Play unless the effect says otherwise), 356.1.b.2 ("ignoring its
 * Energy cost" zeroes only the base Energy), 356.1.b.3 (additional costs still lift the total above zero), 356.2.b /
 * 356.2.b.1 (Repeat = optional additional cost elected in Make Choices), 356.4.c / 356.4.f (a component discount —
 * Marai Spire — applies to the Repeat cost the moment it is added, down to 0 at most), 356.2.a.2 + 809.1.c / 809.1.c.1
 * (Deflect: +1 Power of ANY domain per time the opponent CHOOSES the Poro — a mandatory additional cost), 820.2 /
 * 820.2.a (with Repeat, the extra execution's choices are made NOW, in the same Make Choices step, and may differ),
 * 820.3.a (played once), 355.5 (targets are fixed at play time).
 *
 * Question: P1 controls Marai Spire and plays Fizz; its trigger plays Frigid Touch from P1's trash ignoring its Energy
 * cost. P2 has Pouty Poro (Deflect) and a vanilla unit.
 *   (a) Repeat paid, Poro named for BOTH executions: exact cost? Deflect once or twice?
 *   (b) Repeat paid, Poro first / vanilla second?     (c) Repeat declined, Poro?
 *   (d) as (a) but WITHOUT Marai Spire?                (e) where does Frigid Touch go; when are targets chosen?
 *
 * Expected: base Energy 2 → 0. Repeat +[2], Spire −[1] on that component → +[1]. Deflect +1 any-domain power per
 * choice of the Poro (both executions' choices are made now → naming it twice = +2).
 *   (a) 1 energy + 2 power; Poro −2 then −2.   (b) 1 energy + 1 power; Poro −2, vanilla −2.
 *   (c) 0 energy + 1 power; Poro −2.           (d) 2 energy + 2 power.
 *   (e) all targets fixed at play time (before P2's window); Fizz's rider recycles Frigid Touch to the BOTTOM of the
 *       main deck instead of the trash; it counts as ONE spell played.
 * Power note: P1's spare power is CALM — neither the spell's (Mind) nor the Poro's (Fury) domain — to show 809.1.c.1.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIZZ = "sfd-140-221";
const FRIGID_TOUCH = "sfd-066-221";
const MARAI_SPIRE = "sfd-211-221";
const POUTY_PORO = "ogn-013-298";
const SKULKER = "ogn-175-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

interface BoardOpts {
  readonly spire?: boolean;
  /** Energy left AFTER paying Fizz's 3 (default 2). */
  readonly spareEnergy?: number;
  /** Calm power available for Repeat/Deflect (default 2). */
  readonly calm?: number;
}

/**
 * P1's turn. bf1 = Marai Spire (live) — or an inert battlefield — controlled by P1 with a 2-Might Holder on it.
 * P1: Fizz in hand, Frigid Touch in trash AND a second copy in hand (hand-cast controls), 3+spare energy, [chaos] +
 * `calm` calm; deck topped with two known Skulkers. P2: Pouty Poro (2, Deflect) and a 4-Might Vanilla in base.
 */
function board(o: BoardOpts = {}) {
  const s = scenario().resources(P1, { energy: 3 + (o.spareEnergy ?? 2), power: { calm: o.calm ?? 2, chaos: 1 } });
  if (o.spire === false) {
    s.battlefield("bf1", { controller: P1 });
  } else {
    s.battlefield("bf1", { controller: P1, def: MARAI_SPIRE, inert: false, owner: P1 });
  }
  return s
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "base", POUTY_PORO, "poro")
    .unit(P2, "base", { might: 4, name: "Vanilla" }, "vanilla")
    .trash(P1, FRIGID_TOUCH, "ft")
    .hand(P1, FRIGID_TOUCH, "ftHand")
    .deck(P1, [SKULKER, SKULKER], ["d1", "d2"])
    .hand(P1, FIZZ, "fizz");
}

/**
 * Play Fizz to base, accept "you may", pass both priorities so the trigger resolves and Frigid Touch (the only
 * eligible trash spell) is being played: returns at the first P1 prompt that belongs to the Frigid Touch play
 * (its Repeat election or its target choice).
 */
async function fizzIntoFrigidTouch(o: BoardOpts = {}): Promise<Game> {
  const game = await board(o).build();
  await game.p1.play("fizz", { to: "base" });
  expect(game.p1.resources()).toEqual({ energy: o.spareEnergy ?? 2, power: { calm: o.calm ?? 2, chaos: 0 } });
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    if (d.kind === "yes-no" && d.source?.cardId === "fizz") {
      await game.p1.yes();
    } else if (d.kind === "pick" && d.seat === P1 && d.options.some((x) => x.key === "ft" || x.card === "ft")) {
      await game.p1.pick("ft"); // which trash spell (only one fits; still P1's announced choice)
    } else if (d.kind === "action" && d.context === "chain" && game.chain().some((c) => c.cardId === "fizz")) {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  expect(game.zoneOf("fizz")).toBe("base");
  return game;
}

/** Is `d` a prompt through which P1 could elect Frigid Touch's [Repeat] for the trash play? */
function isRepeatOffer(d: Decision | null): boolean {
  if (!d || d.seat !== P1) {
    return false;
  }
  if (d.kind === "yes-no" || d.kind === "integer") {
    return d.source?.cardId === "ft" || /repeat/i.test(d.prompt);
  }
  return d.kind === "pick" && d.source?.cardId === "ft" && d.max >= 2; // both executions' targets in one pick
}

/**
 * From the Frigid Touch play dialog: elect Repeat if `repeat`, name `targets` (execution order), and stop at the first
 * priority window over the finalized Frigid Touch. Returns whether a Repeat election was actually available.
 */
async function makeChoices(game: Game, repeat: boolean, targets: readonly string[]): Promise<boolean> {
  let repeatOffered = false;
  const queue = [...targets];
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || d.seat !== P1 || d.kind === "action") {
      break;
    }
    if (d.kind === "yes-no") {
      repeatOffered ||= isRepeatOffer(d);
      await game.p1.answer(repeat && d.canAccept !== false);
    } else if (d.kind === "integer") {
      repeatOffered ||= isRepeatOffer(d);
      await game.p1.chooseX(repeat ? Math.min(1, d.max) : d.min);
    } else if (d.kind === "pick") {
      if (d.max >= 2 && queue.length >= 2) {
        repeatOffered = true;
        await game.p1.pick(...queue.splice(0, d.max));
      } else {
        await game.p1.pick(queue.shift() ?? targets[0]!);
      }
    } else {
      break;
    }
  }
  return repeatOffered;
}

describe("Fizz → Frigid Touch from trash × Marai Spire × Pouty Poro — cost pipeline of an effect-play with Repeat + Deflect", () => {
  // ── shared premise ─────────────────────────────────────────────────────────────────────

  test.failing("BUG: premise: Fizz (3+[chaos]) enters base; its 'you may' is asked at finalization; Frigid Touch (printed 2 ≤ 3) is the spell named; after both pass the trigger resolves and Frigid Touch is on the chain being played — 0 extra energy spent so far (356.1.b.2)", async () => {
    const game = await fizzIntoFrigidTouch();
    expect(game.zoneOf("ft")).toBe("chain");
    expect(game.chain().map((c) => [c.cardId, c.triggered])).toEqual([["ft", false]]);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { calm: 2, chaos: 0 } });
    const d = game.decision();
    expect(d?.seat).toBe(P1);
    expect(d?.kind === "pick" || d?.kind === "yes-no" || d?.kind === "integer").toBe(true);
  });

  // ── (c) Repeat declined, Poro ─────────────────────────────────────────────────────────

  test("(c) Repeat declined, Poro named once: 0 energy + exactly 1 power — paid from CALM although the spell is Mind and the Poro Fury (809.1.c.1; 356.1.b.3: Deflect alone lifts the total above zero)", async () => {
    const game = await fizzIntoFrigidTouch();
    await makeChoices(game, false, ["poro"]);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { calm: 1, chaos: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ft", controller: P1, targets: ["poro"], triggered: false })]);
  });

  test("(c) on resolution the Poro gets −2 this turn (2 → 0, survives undamaged); nothing else changes", async () => {
    const game = await fizzIntoFrigidTouch();
    await makeChoices(game, false, ["poro"]);
    await game.settle();
    expect(game.state("poro")).toMatchObject({ might: 0, mightModifier: -2, zone: "base" });
    expect(game.state("vanilla").might).toBe(4);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    await game.advanceTurn();
    expect(game.state("poro").might).toBe(2);
  });

  // Same gap as (a): the effect-play asks the [Repeat] election as a RES-timing opt-in ("Pay [1] to use …") before any
  // target pick, so the first decision is a yes-no — and the Repeat is offered even with 0 power, i.e. unpayable (355.8).
  test.failing("BUG: (c) with NO spare power at all the enemy Poro is not even offered for the trash play (Deflect unpayable, 355.8) — Fizz, Vanilla and Holder are", async () => {
    const game = await fizzIntoFrigidTouch({ calm: 0 });
    const d = game.decision() as PickDecision;
    expect(d.kind).toBe("pick");
    const offered = d.options.map((o) => o.card ?? o.key).sort();
    expect(offered).not.toContain("poro");
    expect(offered).toEqual(["fizz", "holder", "vanilla"]);
  });

  // ── (a) Repeat paid, Poro ×2, with Spire ──────────────────────────────────────────────

  // Expected (419.3.b, 356.2.b, 356.4.c, 809.1.c, 820.2): the trash play still runs Make Choices, so P1 may elect
  // [Repeat]: +[2] −[1] Spire = +[1]; naming the Poro for both executions = +2 power → exactly 1 energy + 2 calm.
  // Actual: the effect-play path never offers a spell's Repeat — P1 goes straight to a single-target pick.
  test.failing("BUG: (a) the Fizz-played Frigid Touch offers its [Repeat]; paying it and naming the Poro for BOTH executions costs exactly 1 energy + 2 power under Marai Spire", async () => {
    const game = await fizzIntoFrigidTouch();
    const offered = await makeChoices(game, true, ["poro", "poro"]);
    expect(offered).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 0, chaos: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ft", targets: ["poro", "poro"] })]);
  });

  test("(a) on resolution the Poro takes −2 then −2 (2 → 0, modifier −4) from ONE chain item (820.3.a)", async () => {
    const game = await fizzIntoFrigidTouch();
    expect(await makeChoices(game, true, ["poro", "poro"])).toBe(true);
    expect(game.chain()).toHaveLength(1);
    await game.settle();
    expect(game.state("poro")).toMatchObject({ might: 0, mightModifier: -4 });
  });

  // ── (b) Repeat paid, Poro + Vanilla ───────────────────────────────────────────────────

  // Expected: one Deflect choice → 1 energy + 1 power; Poro −2 (→0), Vanilla −2 (→2). Actual: no Repeat offer.
  test.failing("BUG: (b) Repeat paid, Poro for the first execution and Vanilla for the second: 1 energy + 1 power; Poro → 0, Vanilla → 2 (820.2.a)", async () => {
    const game = await fizzIntoFrigidTouch();
    expect(await makeChoices(game, true, ["poro", "vanilla"])).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 1, chaos: 0 } });
    await game.settle();
    expect(game.state("poro").might).toBe(0);
    expect(game.state("vanilla").might).toBe(2);
  });

  // ── (d) as (a) without Marai Spire ────────────────────────────────────────────────────

  // Expected: no Spire discount → Repeat +[2] in full → 2 energy + 2 power. Actual: no Repeat offer.
  test.failing("BUG: (d) without Marai Spire the same play (Repeat, Poro ×2) costs 2 energy + 2 power", async () => {
    const game = await fizzIntoFrigidTouch({ spire: false });
    expect(await makeChoices(game, true, ["poro", "poro"])).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, chaos: 0 } });
  });

  // ── (e) timing of choices, recycle rider, played once ─────────────────────────────────

  // Engine gap: on the effect-play path the additional-cost election is a RES-timing opt-in that precedes the target
  // pick, so the first decision is not the FIN-timing target choice that 355.5 / 356.2.b require.
  test.failing("BUG: (e) targets are fixed at PLAY time: the target prompt is a finalization-time (FIN) choice, and P2's first priority window over Frigid Touch already shows the Poro locked on the item — Deflect already paid", async () => {
    const game = await fizzIntoFrigidTouch();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    await makeChoices(game, false, ["poro"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.chain()[0]).toMatchObject({ cardId: "ft", targets: ["poro"] });
    expect(game.p1.power("calm")).toBe(1);
    expect(game.state("poro").might).toBe(2); // nothing resolved yet
  });

  test("(e) 'Recycle that spell after you play it': once Frigid Touch resolves it goes to the BOTTOM of P1's main deck — not the trash, not banishment", async () => {
    const game = await fizzIntoFrigidTouch();
    await makeChoices(game, false, ["poro"]);
    await game.settle();
    expect(game.zoneOf("ft")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("ft");
    expect(game.p1.deck().slice(0, 2)).toEqual(["d1", "d2"]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.banishment()).toEqual([]);
  });

  test("(e) the spell counts as played exactly once (820.3.a): P1's cards-played tally reads 2 (Fizz + Frigid Touch), and only one Frigid Touch item ever sat on the chain", async () => {
    const game = await fizzIntoFrigidTouch();
    await makeChoices(game, false, ["poro"]);
    expect(game.chain().filter((c) => c.cardId === "ft")).toHaveLength(1);
    await game.settle();
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  // ── controls: the same cost pipeline from HAND (base [2] NOT ignored) ─────────────────

  test.failing("BUG: control (hand cast, Spire): the option enumerates Repeat 0..1 and two-slot target tuples incl. [poro, poro]; casting with Repeat + Poro ×2 costs 2 + (2−1) = 3 energy and 2 calm — Spire discounts ONLY the Repeat component, Deflect is owed twice", async () => {
    const game = await board({ spareEnergy: 7, calm: 3 }).build(); // 10 energy, 3 calm
    const opt = game.p1.option("cast", "ftHand");
    expect(opt?.fields.find((f) => f.name === "repeatCount")).toMatchObject({ max: 1, min: 0 });
    const tuples = (opt?.fields.find((f) => f.name === "targets")?.options ?? []).map((v) => JSON.stringify(v));
    expect(tuples).toContain(JSON.stringify(["poro", "poro"]));
    expect(tuples).toContain(JSON.stringify(["poro", "vanilla"]));
    await game.p1.cast("ftHand", { repeat: 1, targets: ["poro", "poro"] });
    expect(game.p1.resources()).toEqual({ energy: 10 - 3, power: { calm: 3 - 2, chaos: 1 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ftHand", targets: ["poro", "poro"] })]);
    await game.settle();
    expect(game.state("poro")).toMatchObject({ might: 0, mightModifier: -4 });
    expect(game.zoneOf("ftHand")).toBe("trash"); // a hand cast is NOT recycled — only Fizz's rider does that
  });

  test.failing("BUG: control (hand cast): no Spire → 4 energy + 2 calm for Repeat + Poro ×2; Spire + Poro/Vanilla → 3 energy + 1 calm; Spire, no Repeat, Poro → 2 energy + 1 calm", async () => {
    const noSpire = await board({ calm: 3, spareEnergy: 7, spire: false }).build();
    await noSpire.p1.cast("ftHand", { repeat: 1, targets: ["poro", "poro"] });
    expect(noSpire.p1.resources()).toEqual({ energy: 10 - 4, power: { calm: 1, chaos: 1 } });

    const split = await board({ calm: 3, spareEnergy: 7 }).build();
    await split.p1.cast("ftHand", { repeat: 1, targets: ["poro", "vanilla"] });
    expect(split.p1.resources()).toEqual({ energy: 10 - 3, power: { calm: 2, chaos: 1 } });
    await split.settle();
    expect(split.state("poro").might).toBe(0);
    expect(split.state("vanilla").might).toBe(2);

    const single = await board({ calm: 3, spareEnergy: 7 }).build();
    await single.p1.cast("ftHand", { targets: "poro" });
    expect(single.p1.resources()).toEqual({ energy: 10 - 2, power: { calm: 2, chaos: 1 } });
  });
});
