/**
 * Interaction: Fizz, Trickster (sfd-140-221) · Champion Unit · Chaos · 3+[chaos] · 3 Might
 *     "When you play me, you may play a spell from your trash with Energy cost no more than [3], ignoring its
 *      Energy cost. Recycle that spell after you play it. (You must still pay its Power cost.)"
 *   × Bellows Breath (sfd-080-221) · Spell · Mind · 1+[mind] · [Action] · [Repeat] [1][mind]
 *     "Deal 1 to up to three units at the same location."
 *   × Helm of Suppression (ven-045-166) · Gear · Calm · 4+[calm] — P2's, UN-empowered:
 *     "Opponents' spells cost [1] more. If this is [Empowered], they cost [1][rainbow] more instead."
 *   × Eager Apprentice (ogn-084-298) · Unit · Mind · 3 · 3 Might — P1's, at a battlefield:
 *     "While I'm at a battlefield, the Energy costs for spells you play is reduced by [1], to a minimum of [1]."
 *
 * Rules: 419.3.b (an effect-play runs every step of Play, optional riders included), 356.1.b.2 ("ignoring its
 * Energy cost" zeroes only the BASE Energy; the [mind] pip stays), 356.1.b.3 (later additional costs / increases
 * lift the total above zero), 356.1.c ("Energy cost no more than [3]" reads the PRINTED cost), 356.2.b.1 (Repeat is
 * an optional additional cost elected in Make Choices), 356.3 (Helm +[1] — applies to a Fizz-played spell, riftjudge
 * 96d4c2a2581fb83d), 356.4.e (Apprentice −[1] with ITS OWN floor of 1 — the floor never raises a cost that is already
 * 0), 356.4.f (a discount may eat an additional cost), 357.3 (a cost that cannot be paid is never offered), 820.1.c.1
 * (the Repeat cost is an Additional Cost of the play), 820.2 (both executions' choices are made at play time).
 *
 * Question: P1 plays Fizz; its trigger plays Bellows Breath from P1's trash ignoring its Energy cost. P2 has an
 * un-empowered Helm; P1's Eager Apprentice stands at bf1.
 *   (a) Is Repeat offered on this effect-play; exact payment with Repeat; how many executions?
 *   (b) Payment WITHOUT Repeat — so what did Repeat really cost?     (c) Same two cases with NO Helm.
 *   (d) Pool after Fizz = {1 energy, mind:1} with Helm: which Bellows variants are offered?
 *   (e) Does Helm's +1 apply at all, given "ignoring its Energy cost"?
 *
 * Expected: base energy 1 → 0, [mind] stays; Repeat +[1][mind] if elected; Helm +[1]; Apprentice −[1] but only down to
 * its own floor of 1. (a) Repeat IS offered; 0+1+1 = 2 → Apprentice → 1 energy + [mind][mind]; two executions from
 * ONE chain item, all targets named at play time. (b) 0+1 = 1 → floor → 1 energy + [mind]: Repeat cost net +0 energy
 * +1 mind. (c) no Helm: Repeat → 0+1 = 1 → 1 energy + 2 mind; no Repeat → 0 energy + 1 mind. (d) Repeat variant needs
 * 2 mind → ABSENT; base variant (1 energy + [mind]) offered and payable; one execution. (e) Yes — Helm applies (only
 * the BASE energy is ignored); Fizz's "[3] or less" reads the printed 1; Bellows is recycled afterwards.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIZZ = "sfd-140-221";
const BELLOWS_BREATH = "sfd-080-221";
const HELM_OF_SUPPRESSION = "ven-045-166";
const EAGER_APPRENTICE = "ogn-084-298";

interface BoardOpts {
  /** P2's un-empowered Helm of Suppression on the board (default true). */
  readonly helm?: boolean;
  /** Energy left AFTER paying Fizz's 3 (default 3). */
  readonly spare?: number;
  /** Mind power available for Bellows / Repeat (default 2). */
  readonly mind?: number;
}

/**
 * P1's turn (Neutral Open). P1: bf1 with Eager Apprentice on it, Fizz in hand, Bellows Breath in the TRASH ("bb")
 * plus a second copy in HAND ("bbHand", for the ordinary-cast controls), 3+spare energy, [chaos] + `mind` mind.
 * P2: (optionally) the un-empowered Helm, and two 2-Might vanillas V1/V2 in P2's base — one shared location for
 * "up to three units at the same location".
 */
function board(o: BoardOpts = {}) {
  const s = scenario()
    .resources(P1, { energy: 3 + (o.spare ?? 3), power: { chaos: 1, mind: o.mind ?? 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", EAGER_APPRENTICE, "apprentice")
    .unit(P2, "base", { might: 2, name: "Vanilla One" }, "v1")
    .unit(P2, "base", { might: 2, name: "Vanilla Two" }, "v2")
    .trash(P1, BELLOWS_BREATH, "bb")
    .hand(P1, BELLOWS_BREATH, "bbHand")
    .hand(P1, FIZZ, "fizz");
  if (o.helm !== false) {
    s.gear(P2, HELM_OF_SUPPRESSION, "helm");
  }
  return s;
}

/**
 * Play Fizz to base, accept "you may", name the trash Bellows if asked, pass both priorities so the trigger
 * resolves. Returns at the first thing that belongs to the Bellows play (a P1 prompt of its dialog, or the priority
 * window over the finalized Bellows) — or at P1's open main phase if Bellows could not be played.
 */
async function fizzPlaysBellows(o: BoardOpts = {}): Promise<Game> {
  const game = await board(o).build();
  await game.p1.play("fizz", { to: "base" });
  expect(game.p1.resources()).toEqual({ energy: o.spare ?? 3, power: { chaos: 0, mind: o.mind ?? 2 } });
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    if (d.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "fizz") {
      await game.p1.yes();
    } else if (d.kind === "pick" && d.seat === P1 && d.options.some((x) => x.key === "bb" || x.card === "bb")) {
      await game.p1.pick("bb");
    } else if (d.kind === "action" && d.context === "chain" && game.chain().some((c) => c.cardId === "fizz")) {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  expect(game.zoneOf("fizz")).toBe("base");
  return game;
}

/** Is `d` a prompt through which P1 could actually ELECT Bellows Breath's [Repeat] on the effect-play? */
function isRepeatElection(d: Decision | null): boolean {
  if (!d || d.seat !== P1) {
    return false;
  }
  if (d.kind === "yes-no") {
    return (d.source?.cardId === "bb" || /repeat/i.test(d.prompt)) && d.canAccept !== false;
  }
  if (d.kind === "integer") {
    return (d.source?.cardId === "bb" || /repeat/i.test(d.prompt)) && d.max >= 1;
  }
  return false;
}

/** The first target pick P1 saw while playing Bellows (if any). */
let lastTargetPick: Decision | undefined;

/**
 * Drive the Bellows play dialog as P1: elect Repeat iff `repeat`, name `targetSets` (one set per execution) on any
 * target pick, stop at the first action decision. Returns whether a Repeat election was available; the first target
 * pick seen is left in `lastTargetPick`.
 */
async function bellowsDialog(game: Game, repeat: boolean, targetSets: readonly (readonly string[])[]): Promise<boolean> {
  let repeatOffered = false;
  lastTargetPick = undefined;
  const queue = [...targetSets];
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || d.seat !== P1 || d.kind === "action") {
      break;
    }
    if (d.kind === "yes-no") {
      repeatOffered ||= isRepeatElection(d);
      await game.p1.answer(repeat && d.canAccept !== false);
    } else if (d.kind === "integer") {
      repeatOffered ||= isRepeatElection(d);
      await game.p1.chooseX(repeat ? Math.min(1, d.max) : d.min);
    } else if (d.kind === "pick") {
      lastTargetPick ??= d;
      const wanted = (queue.shift() ?? targetSets[0] ?? []).filter((k) => d.options.some((o) => o.key === k || o.card === k));
      if (wanted.length === 0 && d.allowDecline) {
        await game.p1.decline();
      } else {
        await game.p1.pick(...wanted.slice(0, Math.max(1, d.max)));
      }
    } else {
      break;
    }
  }
  return repeatOffered;
}

const bellowsOnChain = (game: Game) => game.chain().filter((c) => c.cardId === "bb" && !c.triggered);

describe("Fizz → Bellows Breath from trash × Helm of Suppression × Eager Apprentice — Repeat / increase / floored discount on an effect-play", () => {
  // ── (e) + (b): Helm applies; the no-Repeat line ───────────────────────────────────────────────

  test("(e)(b) Helm present, no Repeat: the Fizz-played Bellows costs exactly 1 energy + [mind] (base 1→0, Helm +1, Apprentice cannot go below its floor of 1) — pool 3/2 → 2/1, Bellows sits on the chain as a PLAYED spell (356.1.b.2, 356.1.b.3, 356.3, 356.4.e)", async () => {
    const game = await fizzPlaysBellows();
    await bellowsDialog(game, false, [["v1", "v2"]]);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 0, mind: 1 } });
    expect(bellowsOnChain(game)).toEqual([expect.objectContaining({ cardId: "bb", controller: P1, triggered: false })]);
    expect(game.zoneOf("bb")).toBe("chain");
    expect(game.state("helm").isEmpowered).toBe(false);
  });

  test("(e) Fizz's 'Energy cost no more than [3]' read Bellows' PRINTED 1 (356.1.c): it was eligible and got played although Helm makes it cost more than printed", async () => {
    const game = await fizzPlaysBellows();
    expect(["chain", "mainDeck"]).toContain(game.zoneOf("bb")); // it left the trash = it was played
    expect(game.p1.trash()).not.toContain("bb");
  });

  test("(e) contrast: with 0 energy left after Fizz the Helm's +[1] makes the trash Bellows UNPLAYABLE (stays in the trash, mind untouched) — while WITHOUT the Helm the very same pool plays it for 0 energy + 1 mind", async () => {
    const taxed = await fizzPlaysBellows({ spare: 0 });
    await bellowsDialog(taxed, false, [["v1", "v2"]]);
    await taxed.settle();
    expect(taxed.zoneOf("bb")).toBe("trash");
    expect(taxed.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, mind: 2 } });
    expect(taxed.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });

    const free = await fizzPlaysBellows({ helm: false, spare: 0 });
    await bellowsDialog(free, false, [["v1", "v2"]]);
    expect(free.zoneOf("bb")).toBe("chain");
    expect(free.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, mind: 1 } });
  });

  // ── (c) no Helm, no Repeat ────────────────────────────────────────────────────────────────────

  test("(c) NO Helm, no Repeat: 0 energy + 1 mind — Apprentice's 'to a minimum of [1]' bounds only its own discount and never RAISES a cost that is already 0 (356.4.e); pool 3/2 → 3/1", async () => {
    const game = await fizzPlaysBellows({ helm: false });
    await bellowsDialog(game, false, [["v1", "v2"]]);
    expect(game.p1.resources()).toEqual({ energy: 3, power: { chaos: 0, mind: 1 } });
    expect(bellowsOnChain(game)).toHaveLength(1);
  });

  // ── (a) Repeat on the effect-play ─────────────────────────────────────────────────────────────

  // Expected (419.3.b, 820.1.c.1, 356.2.b.1): the trash play still runs Make Choices, so P1 may elect [Repeat].
  // Actual: the effect-play path (putPlayedSpellOnChain via "effect") never offers a spell's Repeat — P1 goes
  // straight to the priority window over a Repeat-less Bellows.
  test("(a) the Fizz-played Bellows Breath OFFERS its [Repeat] [1][mind] election (419.3.b, 820.1.c.1)", async () => {
    const game = await fizzPlaysBellows();
    expect(await bellowsDialog(game, true, [["v1", "v2"], ["v1", "v2"]])).toBe(true);
  });

  // Expected: 0 (ignored base) +1 (Repeat) +1 (Helm) = 2 → Apprentice −1 → 1 energy; power [mind]+[mind] → pool
  // 3/2 → 2/0. Compared with (b) (1 energy + 1 mind) Repeat really cost +0 energy +1 mind here (356.4.f). Actual: no
  // Repeat election exists, so only 1 energy + 1 mind is ever charged.
  test("(a)(b) Repeat elected under Helm + Apprentice: exactly 1 energy + [mind][mind] (pool 3/2 → 2/0) — i.e. Repeat's net extra cost over the no-Repeat line is +0 energy +1 mind (356.1.b.3, 356.3, 356.4.e/f)", async () => {
    const game = await fizzPlaysBellows();
    expect(await bellowsDialog(game, true, [["v1", "v2"], ["v1", "v2"]])).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 0, mind: 0 } });
    expect(bellowsOnChain(game)).toHaveLength(1); // still ONE item (820.3.a)
  });

  // Expected: no Helm → 0 + 1 (Repeat) = 1 → Apprentice's floor leaves it at 1 → 1 energy + 2 mind (3/2 → 2/0).
  // Actual: no Repeat election on the effect-play path.
  test("(c) NO Helm, Repeat elected: 0+1 = 1 → floor moot → 1 energy + [mind][mind] (pool 3/2 → 2/0)", async () => {
    const game = await fizzPlaysBellows({ helm: false });
    expect(await bellowsDialog(game, true, [["v1", "v2"], ["v1", "v2"]])).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 0, mind: 0 } });
  });

  // Expected (820.2 / 820.3.a): both executions' target sets are named at play time; on resolution V1 and V2 (2 Might)
  // take 1 then 1 and die — from ONE chain item. Actual: no Repeat, and (see below) no targets are ever chosen.
  test("(a) with Repeat the instructions run TWICE from one chain item: V1 and V2 named for both executions at play time take 1+1 each and die (820.2, 820.3.a)", async () => {
    const game = await fizzPlaysBellows();
    expect(await bellowsDialog(game, true, [["v1", "v2"], ["v1", "v2"]])).toBe(true);
    expect(bellowsOnChain(game)).toHaveLength(1);
    await game.settle();
    expect(game.zoneOf("v1")).toBe("trash");
    expect(game.zoneOf("v2")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // ── (d) pool {1, mind:1} after Fizz, Helm present ────────────────────────────────────────────

  test("(d) pool after Fizz = {1 energy, mind:1} with Helm: the BASE variant (1 energy + [mind]) is offered and paid — pool → 0/0, Bellows on the chain — and no payable Repeat election exists (357.3: [mind][mind] cannot be met)", async () => {
    const game = await fizzPlaysBellows({ mind: 1, spare: 1 });
    const repeatElectable = await bellowsDialog(game, true, [["v1", "v2"], ["v1", "v2"]]); // TRY to elect it
    expect(repeatElectable).toBe(false);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, mind: 0 } });
    expect(bellowsOnChain(game)).toHaveLength(1);
  });

  // Expected (419.3.b + 355.5 / 820.2): the "up to three units at the same location" set is a play-time (FIN) choice
  // of P1, made before P2's priority window, and on resolution each named unit takes 1 — V1 and V2 end at 1 damage
  // (2 Might, they survive). Actual: the effect-play never asks for Bellows' target set and the spell resolves
  // dealing nothing at all.
  test("(d) the base variant's single execution: P1 names {V1, V2} at play time (a FIN pick before P2's window) and each takes exactly 1 on resolution (355.5, 820.2)", async () => {
    const game = await fizzPlaysBellows({ mind: 1, spare: 1 });
    await bellowsDialog(game, false, [["v1", "v2"]]);
    expect(lastTargetPick).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" }); // only now does anyone get priority
    expect(bellowsOnChain(game)[0]?.targets ?? []).toEqual(expect.arrayContaining(["v1", "v2"]));
    await game.settle();
    expect(game.state("v1")).toMatchObject({ damage: 1, zone: "base" });
    expect(game.state("v2")).toMatchObject({ damage: 1, zone: "base" });
  });

  // ── recycle rider ─────────────────────────────────────────────────────────────────────────────

  test("(e) 'Recycle that spell after you play it': once Bellows leaves the chain it is at the BOTTOM of P1's main deck — not in the trash — and P1 is back in an open main phase with the Apprentice untouched", async () => {
    const game = await fizzPlaysBellows();
    await bellowsDialog(game, false, [["v1", "v2"]]);
    await game.settle();
    expect(game.zoneOf("bb")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("bb");
    expect(game.p1.trash()).toEqual([]);
    expect(game.state("apprentice")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── controls: the same pipeline on an ordinary HAND cast (base [1] NOT ignored) ───────────────

  test("control (hand cast, Helm + Apprentice): the option offers Repeat 0..1; no Repeat = 1+1−1 = 1 energy + 1 mind; Repeat = 1+1+1−1 = 2 energy + 2 mind", async () => {
    const plain = await board({ spare: 7, mind: 3 }).build(); // 10 energy, 3 mind
    expect(plain.p1.option("cast", "bbHand")?.fields.find((f) => f.name === "repeatCount")).toMatchObject({ max: 1, min: 0 });
    await plain.p1.cast("bbHand", { targets: ["v1", "v2"] });
    expect(plain.p1.resources()).toEqual({ energy: 9, power: { chaos: 1, mind: 2 } });

    const rep = await board({ spare: 7, mind: 3 }).build();
    await rep.p1.cast("bbHand", { repeat: 1, targets: ["v1", "v2"] });
    expect(rep.p1.resources()).toEqual({ energy: 8, power: { chaos: 1, mind: 1 } });
    expect(rep.chain().filter((c) => c.cardId === "bbHand")).toHaveLength(1);
  });

  test("control (hand cast, NO Helm, Apprentice): no Repeat = 1 → Apprentice cannot go below its floor of 1 → 1 energy + 1 mind", async () => {
    const plain = await board({ helm: false, spare: 7, mind: 3 }).build();
    await plain.p1.cast("bbHand", { targets: ["v1", "v2"] });
    expect(plain.p1.resources()).toEqual({ energy: 9, power: { chaos: 1, mind: 2 } });
  });

  // Expected (356.2 → 356.4 order, 356.4.e/f): the Energy total is 1 (base) + 1 (Repeat) = 2, THEN Apprentice −1 → 1
  // (its floor of 1 is respected) → 1 energy + 2 mind. Actual: the engine floors Apprentice against the BASE energy
  // alone (1 → stays 1) and adds the Repeat energy afterwards → 2 energy; the discount never reaches the additional
  // cost although 356.4.f says it may.
  test("control (hand cast, NO Helm, Apprentice): Repeat = 1+1 = 2 → Apprentice −1 → 1 energy + 2 mind — a floored discount still eats into the Repeat cost (356.4.e, 356.4.f)", async () => {
    const rep = await board({ helm: false, spare: 7, mind: 3 }).build();
    await rep.p1.cast("bbHand", { repeat: 1, targets: ["v1", "v2"] });
    expect(rep.p1.resources()).toEqual({ energy: 9, power: { chaos: 1, mind: 1 } });
  });

  test("control (hand cast, Helm, pool exactly {2 energy, mind:1}): the cast is offered but NO Repeat variant is enumerated — [mind][mind] cannot be met (357.3)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { mind: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", EAGER_APPRENTICE, "apprentice")
      .unit(P2, "base", { might: 2 }, "v1")
      .gear(P2, HELM_OF_SUPPRESSION, "helm")
      .hand(P1, BELLOWS_BREATH, "bbHand")
      .build();
    expect(game.p1.can("cast", "bbHand")).toBe(true);
    const opt = game.p1.option("cast", "bbHand");
    expect(opt?.fields.find((f) => f.name === "repeatCount")).toBeUndefined();
    expect(opt?.variants.some((v) => (v.params as { repeatCount?: number }).repeatCount !== undefined)).toBe(false);
    await expect(game.p1.cast("bbHand", { repeat: 1, targets: ["v1"] })).rejects.toThrow();
    await game.p1.cast("bbHand", { targets: ["v1"] });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { mind: 0 } }); // 1 (base) +1 Helm −1 Apprentice = 1
  });
});
