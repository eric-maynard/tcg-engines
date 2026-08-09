/**
 * Interaction: Rumble, Hotheaded (sfd-026-221) · Champion Unit · Fury · 4 · 4 Might · MECH
 *     "Your Mechs each have [Assault]. When I conquer, you may recycle another friendly unit to play a
 *      Mech from your trash. Reduce its Energy cost by the Might of the unit you recycled."
 *   × Ferrous Forerunner (sfd-021-221) · Unit · Fury · 6 · 6 Might
 *     "[Deathknell] — Play two 3 [Might] Mech unit tokens to your base."
 *   × Mega-Mech (ogn-088-298) · Unit · Mind · 7 · 8 Might · MECH (vanilla) — in P1's TRASH
 *   × Stupefy (ogn-095-298) · Reaction spell · 1 — "Give a unit -1 [Might] this turn… Draw 1." (P2's answer)
 *
 * Rules: 383.3.a (leading "you may" → opt-in decided at FINALIZATION), 383.3.b / 383.3.b.1 / 204.3.a
 * ("recycle another friendly unit to …" is a leading cost-within-instructions → the trigger's BASE COST,
 * paid to finalize), 402.2 (all choices — the cost object AND the target — are made in step 2),
 * 355.10.c.1 (the recycled unit is a cost object, not a target) vs 355.10.a (a Mech in the public trash IS
 * a target), 402.4 / 402.4.b (no legal target → removed before any cost is paid), 404.1 / 404.2 (cost paid
 * in step 4; unpayable → removed, no counter), 416.1 / 416.3 (recycle = bottom of main deck; as a cost it
 * must be completable), 406.4 (opponents get priority only after finalization), 359.3.e.13 (look-back:
 * the recycled unit's Might as it last existed on the board), 808 (Deathknell = "when I die" — recycling
 * is not dying), 419.3.b + 356.4 + 357.1 (the Mech is played from trash as a Limited play with a discount,
 * paid in that play's own pay step), 358.5 (cannot pay → the play is undone), 425.1.c (costs never refunded).
 *
 * Q: P1's Rumble conquers bf1; Forerunner sits in P1's base; Mega-Mech is in P1's trash.
 *   (a) When is Forerunner recycled / Mega-Mech chosen; does Deathknell fire; can P2 Stupefy Forerunner in
 *       response to shrink the discount?  → all at finalization; no Deathknell; no — Forerunner is already
 *       in the deck when P2 first holds priority, discount locked at 6.
 *   (b) What does P1 pay on resolution; and with 0 energy?  → [1] (7−6), enters exhausted at base or bf1;
 *       with 0 energy the play is undone (Mega-Mech stays in trash) but Forerunner stays recycled.
 *   (c) Rumble is P1's only unit → no prompt, trigger removed (cost unpayable).
 *   (d) No Mech in trash but a damaged unit P1 would love to recycle → not allowed (no legal target).
 *   (e) Forerunner buffed (+1) / pumped (+2 this turn) → look-back Might 7 / 8 → Mega-Mech costs [0].
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RUMBLE = "sfd-026-221";
const FERROUS_FORERUNNER = "sfd-021-221";
const MEGA_MECH = "ogn-088-298";
const STUPEFY = "ogn-095-298";

interface BoardOpts {
  /** P1's energy (default 1 — exactly Mega-Mech's discounted cost). */
  energy?: number;
  /** Place Ferrous Forerunner in P1's base (default true). */
  forerunner?: boolean;
  forerunnerMeta?: Record<string, unknown>;
  /** Place Mega-Mech in P1's trash (default true). */
  megaMech?: boolean;
  /** Add a damaged vanilla 2-Might "Grunt" to P1's base (default false). */
  grunt?: boolean;
}

/**
 * P1's turn. P2 holds bf1 with nobody on it, so Rumble walking in conquers after both pass focus.
 * P1: Rumble + (Forerunner) in base, (Mega-Mech) in trash, `energy` energy. P2: 1 energy + Stupefy.
 */
function board(o: BoardOpts = {}) {
  const s = scenario()
    .resources(P1, { energy: o.energy ?? 1 })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", RUMBLE, "rumble");
  if (o.forerunner !== false) {
    s.unit(P1, "base", FERROUS_FORERUNNER, "fore", o.forerunnerMeta);
  }
  if (o.grunt) {
    s.unit(P1, "base", { might: 2, name: "Grunt" }, "grunt", { damage: 1 });
  }
  if (o.megaMech !== false) {
    s.trash(P1, MEGA_MECH, "mega");
  }
  return s.hand(P2, STUPEFY, "stupefy");
}

/** Rumble walks onto the empty enemy bf1; both pass focus → P1 conquers and the trigger pends. */
async function conquer(game: Game): Promise<void> {
  await game.p1.move("rumble", "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
}

type Pred = (d: Decision | null) => boolean;
const isOpenMain: Pred = (d) => d?.kind === "action" && d.context === "main";
const isChainPriorityFor = (seat: string): Pred => (d) => d?.kind === "action" && d.context === "chain" && d.seat === seat;
const isRumbleOptIn: Pred = (d) => d?.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "rumble";
const offers = (d: Decision | null, card: string): boolean => d?.kind === "pick" && d.options.some((o) => (o.card ?? o.key) === card);

/**
 * Drive P1's side of the trigger wherever the engine asks it (finalization or resolution): opt in,
 * name `recycle` as the cost object, `mech` as the Mech to play and `to` as its destination; pass
 * priority otherwise. Stops as soon as `stop` holds (or at P1's open main phase).
 */
async function drive(
  game: Game,
  stop: Pred,
  a: { optIn?: boolean; recycle?: string; mech?: string; to?: string } = {},
): Promise<Decision | null> {
  const { optIn = true, recycle = "fore", mech = "mega", to = "base" } = a;
  for (let i = 0; i < 40; i++) {
    const d = game.decision();
    if (stop(d) || isOpenMain(d) || !d) {
      break;
    }
    if (isRumbleOptIn(d)) {
      await (optIn && (d as Extract<Decision, { kind: "yes-no" }>).canAccept !== false ? game.p1.yes() : game.p1.no());
    } else if (d.seat === P1 && offers(d, recycle)) {
      await game.p1.pick(recycle);
    } else if (d.seat === P1 && offers(d, mech)) {
      await game.p1.pick(mech);
    } else if (d.kind === "pick" && d.seat === P1 && d.semantics === "destination") {
      await game.p1.pick(to);
    } else {
      const r = await game.settle({ maxSteps: 1 });
      if (r.reason === "unanswered" && !stop(game.decision())) {
        throw new Error(`unexpected prompt: ${JSON.stringify(r.decision)}`);
      }
    }
  }
  return game.decision();
}

function mechTokens(game: Game): string[] {
  return game.p1.units().filter((id) => game.state(id).isToken);
}

function stupefyTargets(game: Game): string[] {
  const f = game.p2.option("cast", "stupefy")?.fields.find((x) => x.name === "targets");
  return [...new Set((f?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].sort();
}

describe("Rumble, Hotheaded × Ferrous Forerunner × Mega-Mech — recycle-as-cost, look-back discount", () => {
  // ── (a) timing: finalization vs. P2's response ────────────────────────────────────────────────
  test("(a) premise: Rumble conquers bf1 (+1 point) and exactly one Rumble trigger, controlled by P1, is put on the chain", async () => {
    const game = await board().build();
    await conquer(game);
    expect(game.p1.points()).toBe(1);
    await drive(game, (d) => isChainPriorityFor(P1)(d) || isChainPriorityFor(P2)(d));
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rumble", controller: P1, triggered: true })]);
  });

  // Expected: "you may recycle … to …" leads the effect → the opt-in (383.3.a) and the recycle cost
  // (383.3.b.1 / 204.3.a) belong to FINALIZATION, so P1's very first decision after the conquer is the
  // yes-no with timing FIN. Actual: the trigger is finalized with no questions asked, both players get
  // priority, and the opt-in / recycle / Mech pick are all asked at RESOLUTION (timing RES).
  test.failing("BUG: (a) the opt-in is P1's first decision after the conquer, at FINALIZATION (timing FIN) — before any priority window (383.3.a, 383.3.b.1)", async () => {
    const game = await board().build();
    await conquer(game);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, timing: "FIN" });
    expect(game.zoneOf("fore")).toBe("base"); // nothing paid before P1 answers
  });

  // Expected: step 2 chooses BOTH the cost object (Forerunner) and the target (Mega-Mech in the public
  // trash, 355.10.a); step 4 recycles Forerunner; only then (406.4) does P2 receive priority — seeing
  // Forerunner already on the bottom of P1's deck and Mega-Mech still in the trash (it is played on
  // resolution). Actual: P2 holds priority while Forerunner is still in P1's base and nothing is chosen.
  test.failing("BUG: (a) when P2 first holds priority the cost is already paid and the target locked — Forerunner is the bottom card of P1's deck, Mega-Mech (target) still in trash (402.2, 404.1, 406.4, 416.1)", async () => {
    const game = await board().build();
    await conquer(game);
    const d = await drive(game, isChainPriorityFor(P2));
    expect(isChainPriorityFor(P2)(d)).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rumble", controller: P1, triggered: true })]);
    expect(game.zoneOf("fore")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("fore");
    expect(game.zoneOf("mega")).toBe("trash");
    expect(game.p1.energy()).toBe(1); // Mega-Mech's [1] is paid during ITS play, on resolution (357.1)
  });

  // Expected: Forerunner has left the board before P2 can react, so Stupefy's only legal target is Rumble
  // and aiming it at Forerunner is rejected — the discount (6) is locked via look-back (359.3.e.13).
  // Actual: P2 is offered Forerunner (still in base) and the cast succeeds.
  test.failing("BUG: (a) P2 cannot Stupefy Forerunner in response — it is no longer on the board; only Rumble is offered (406.4, 359.3.e.13)", async () => {
    const game = await board().build();
    await conquer(game);
    await drive(game, isChainPriorityFor(P2));
    expect(game.p2.can("cast", "stupefy")).toBe(true);
    expect(stupefyTargets(game)).toEqual(["rumble"]);
    expect((await game.p2.try((p) => p.cast("stupefy", { targets: "fore" }))).ok).toBe(false);
    expect(game.zoneOf("stupefy")).toBe("hand");
  });

  test("(a) recycling is not dying (808): after everything resolves Forerunner is the BOTTOM card of P1's main deck — not in the trash — and its Deathknell never made Mech tokens", async () => {
    const game = await board().build();
    const deck0 = game.p1.deck().length;
    await conquer(game);
    await drive(game, isOpenMain);
    expect(game.zoneOf("fore")).toBe("mainDeck");
    expect(game.p1.deck()).toHaveLength(deck0 + 1);
    expect(game.p1.deck().at(-1)).toBe("fore");
    expect(game.p1.trash()).not.toContain("fore");
    expect(mechTokens(game)).toEqual([]);
    expect(game.p1.base()).toEqual(["mega"]);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // ── (b) resolution: the Limited play from trash ───────────────────────────────────────────────
  test("(b) on resolution Mega-Mech is played from the trash for exactly [1] (7 − Forerunner's 6): P1 is offered base OR the just-conquered bf1, picks base → enters P1's base EXHAUSTED, energy 1 → 0 (419.3.b, 356.4, 357.1)", async () => {
    const game = await board().build();
    await conquer(game);
    const d = await drive(game, (x) => x?.kind === "pick" && x.seat === P1 && x.semantics === "destination");
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    const keys = d?.kind === "pick" ? d.options.map((o) => o.key).sort() : [];
    expect(keys).toEqual(["base", "battlefield-bf1"]);
    expect(game.zoneOf("fore")).toBe("mainDeck"); // the cost was paid before the play
    await game.p1.pick("base");
    await drive(game, isOpenMain);
    expect(game.zoneOf("mega")).toBe("base");
    expect(game.state("mega")).toMatchObject({ controller: P1, isExhausted: true, might: 8, zone: "base" });
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.trash()).toEqual([]);
  });

  test("(b) the just-conquered bf1 is a legal destination: Mega-Mech lands there exhausted next to Rumble, still for [1]", async () => {
    const game = await board().build();
    await conquer(game);
    await drive(game, isOpenMain, { to: "battlefield-bf1" });
    expect(game.zoneOf("mega")).toBe("battlefield-bf1");
    expect(game.p1.units("bf1").sort()).toEqual(["mega", "rumble"]);
    expect(game.state("mega").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("(b) with 0 energy P1 cannot pay the remaining [1]: the play is undone — Mega-Mech stays in the TRASH — but Forerunner stays recycled (costs are never refunded, 425.1.c) and no tokens appear (358.5)", async () => {
    const game = await board({ energy: 0 }).build();
    await conquer(game);
    await drive(game, isOpenMain);
    expect(isOpenMain(game.decision())).toBe(true);
    expect(game.zoneOf("mega")).toBe("trash");
    expect(game.zoneOf("fore")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("fore");
    expect(game.p1.base()).toEqual([]);
    expect(mechTokens(game)).toEqual([]);
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([]);
  });

  // ── (c) no other friendly unit ────────────────────────────────────────────────────────────────
  test("(c) Rumble is P1's only unit: 'yes' is never a legal answer — nothing is recycled, Mega-Mech stays in the trash, Rumble stays on bf1", async () => {
    const game = await board({ forerunner: false }).build();
    const deck0 = game.p1.deck().length;
    await conquer(game);
    let couldAccept = false;
    for (let i = 0; i < 20 && !isOpenMain(game.decision()); i++) {
      const d = game.decision();
      if (isRumbleOptIn(d)) {
        couldAccept ||= (d as Extract<Decision, { kind: "yes-no" }>).canAccept !== false;
        expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
        await game.p1.no();
      } else {
        await game.settle({ maxSteps: 1 });
      }
    }
    expect(couldAccept).toBe(false);
    expect(isOpenMain(game.decision())).toBe(true);
    expect(game.zoneOf("rumble")).toBe("battlefield-bf1"); // "another" — Rumble can't recycle himself
    expect(game.zoneOf("mega")).toBe("trash");
    expect(game.p1.deck()).toHaveLength(deck0);
    expect(game.chain()).toEqual([]);
    expect(game.p1.points()).toBe(1);
  });

  // With no "another friendly unit" the recycle cost has an EMPTY object set — no Game Object can be
  // named — so the pending trigger is removed at finalization (402.4 / 404.2 / 416.3): P1 is not asked
  // anything and no priority window opens for it.
  test("(c) …and P1 is not prompted at all: the trigger is removed for its unpayable cost without a chain item or priority window (404.2, 416.3)", async () => {
    const game = await board({ forerunner: false }).build();
    await conquer(game);
    let prompted = false;
    let p2HadPriority = false;
    for (let i = 0; i < 20 && !isOpenMain(game.decision()); i++) {
      const d = game.decision();
      prompted ||= isRumbleOptIn(d);
      p2HadPriority ||= isChainPriorityFor(P2)(d);
      if (isRumbleOptIn(d)) {
        await game.p1.no();
      } else {
        await game.settle({ maxSteps: 1 });
      }
    }
    expect(prompted).toBe(false);
    expect(p2HadPriority).toBe(false);
  });

  // ── (d) no Mech in the trash ──────────────────────────────────────────────────────────────────
  test("(d) no Mech in P1's trash: P1 may not recycle the damaged Grunt (or Forerunner) 'for nothing' — yes is refused, both stay on the board, Grunt keeps its damage, deck unchanged (402.4 / 402.4.b)", async () => {
    const game = await board({ grunt: true, megaMech: false }).build();
    const deck0 = game.p1.deck().length;
    expect(game.state("grunt").damage).toBe(1);
    await conquer(game);
    let couldAccept = false;
    let offeredRecycle = false;
    for (let i = 0; i < 20 && !isOpenMain(game.decision()); i++) {
      const d = game.decision();
      offeredRecycle ||= d?.seat === P1 && (offers(d, "grunt") || offers(d, "fore"));
      if (isRumbleOptIn(d)) {
        couldAccept ||= (d as Extract<Decision, { kind: "yes-no" }>).canAccept !== false;
        expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
        await game.p1.no();
      } else {
        await game.settle({ maxSteps: 1 });
      }
    }
    expect(couldAccept).toBe(false);
    expect(offeredRecycle).toBe(false);
    expect(game.zoneOf("grunt")).toBe("base");
    expect(game.zoneOf("fore")).toBe("base");
    expect(game.state("grunt").damage).toBe(1);
    expect(game.p1.deck()).toHaveLength(deck0);
    expect(game.p1.trash()).toEqual([]);
    expect(game.chain()).toEqual([]);
  });

  // ── (e) look-back Might includes modifiers ────────────────────────────────────────────────────
  // Expected: the discount is Forerunner's Might as it last existed on the board (359.3.e.13) — 6 +1 buff
  // = 7 ≥ 7 → Mega-Mech costs [0]; P1's single energy is untouched. Actual: the engine discounts by the
  // PRINTED Might (6) and charges [1].
  test("(e) a BUFFED Forerunner (7 Might on the board) discounts by 7 → Mega-Mech costs [0]; P1's energy stays 1 (359.3.e.13)", async () => {
    const game = await board({ forerunnerMeta: { buffed: true } }).build();
    expect(game.state("fore")).toMatchObject({ baseMight: 6, isBuffed: true, might: 7 });
    await conquer(game);
    await drive(game, isOpenMain);
    expect(game.zoneOf("mega")).toBe("base");
    expect(game.zoneOf("fore")).toBe("mainDeck");
    expect(game.p1.energy()).toBe(1);
  });

  // Expected: a +2 this-turn modifier counts too (8 Might) → cost reduced to [0] (never below); energy
  // unchanged. Actual: printed 6 is used → charged [1].
  test("(e) a +2 this-turn pump (8 Might) also counts: Mega-Mech costs [0] (not negative) — energy stays 1 (359.3.e.13, 356.4)", async () => {
    const game = await board({ forerunnerMeta: { mightModifier: 2 } }).build();
    expect(game.state("fore").might).toBe(8);
    await conquer(game);
    await drive(game, isOpenMain);
    expect(game.zoneOf("mega")).toBe("base");
    expect(game.p1.energy()).toBe(1);
  });

  test("(e) control: a vanilla 7-Might friendly unit recycled instead → discount 7 → Mega-Mech is free; energy stays 1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", RUMBLE, "rumble")
      .unit(P1, "base", { might: 7, name: "Big Friend" }, "big")
      .trash(P1, MEGA_MECH, "mega")
      .build();
    await conquer(game);
    await drive(game, isOpenMain, { recycle: "big" });
    expect(game.zoneOf("big")).toBe("mainDeck");
    expect(game.zoneOf("mega")).toBe("base");
    expect(game.p1.energy()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
