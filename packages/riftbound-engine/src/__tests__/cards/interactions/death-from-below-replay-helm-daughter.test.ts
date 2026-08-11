/**
 * Interaction: Death from Below (unl-186-219) · Spell · Fury/Chaos · 4 + [rainbow] · Action
 *     "Kill a unit at a battlefield. Then, if it had 3 [Might] or less, you may play this from your
 *      trash for [rainbow]."
 *   × Helm of Suppression (ven-045-166) · Gear — "Opponents' spells cost [1] more. If this is
 *     [Empowered], they cost [1][rainbow] more instead."   (P2's, NOT Empowered here)
 *   × Daughter of the Void (ogn-247-298) · Legend — "[Exhaust]: [Reaction] — [Add] [rainbow]. Use
 *     only to play spells."   (P1's legend, ready)
 *   Observers: Ravenbloom Student (ogn-103-298) "When you play a spell, give me +1 [Might] this turn";
 *   Gust (ogn-169-298, Reaction) "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *
 * Question: P1 casts Death from Below from hand at P2's 2-Might X (bf1) while P2 has a Helm out.
 *  (a) hand cost under Helm;  (b) when/how the "play this from your trash for [rainbow]" replay is
 *  offered, what it costs under Helm, whether Daughter of the Void may Add the [rainbow] for it, and
 *  whether it needs Action/Reaction timing;  (c) the replay kills 5-Might Y → no third play, card in
 *  trash;  (d) P2 Gusts X in response → no replay;  (e) each resolved cast is a separate spell played.
 *
 * Rules: 356.1.a ("for [cost]" replaces the BASE cost) · 356.3 / 356.1.b.3 (increases still apply on
 * top of a replaced/ignored base) · 357.1.a / 429.3 / 444.2.c (Reaction [Add] abilities may be used
 * while paying for a card — the replay IS playing a spell, so Daughter's spell-only [rainbow] fits) ·
 * 419.3 (a play instructed by an effect is a Limited play: timing tags irrelevant, all other steps of
 * Play as normal — 419.3.b, incl. choosing targets 355.5) · 359.3.d (execute top-down, then trash) ·
 * 359.3.e.2/.5/.12/.13/.14.a (X gone → kill skipped, "its Might" is null, linked replay ignored;
 * look-back at the killed unit's Might otherwise) · 350.1 / 419.4.a (each completed play is a play;
 * "when you play a spell" fires per resolved cast) · 359.3.e.10 (a fully mistargeted spell is still
 * played and still trips "when you play a spell").
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEATH_FROM_BELOW = "unl-186-219";
const HELM = "ven-045-166";
const DAUGHTER = "ogn-247-298";
const STUDENT = "ogn-103-298";
const GUST = "ogn-169-298";

interface BoardOpts {
  energy: number;
  rainbow: number;
  helm?: boolean;
  student?: boolean;
  gust?: boolean;
}

/** P1 (legend Daughter of the Void, ready) holds Death from Below; P2 has X (2) and Y (5) at bf1 and — by default — an un-Empowered Helm. */
function board({ energy, rainbow, helm = true, student = false, gust = false }: BoardOpts) {
  const b = scenario()
    .resources(P1, { energy, power: { rainbow } })
    .legend(P1, DAUGHTER, "kaisa")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "X" }, "x")
    .unit(P2, "bf1", { might: 5, name: "Y" }, "y")
    .hand(P1, DEATH_FROM_BELOW, "dfb");
  if (helm) {
    b.gear(P2, HELM, "helm");
  }
  if (student) {
    b.unit(P1, "base", STUDENT, "student");
  }
  if (gust) {
    b.resources(P2, { energy: 1 }).hand(P2, GUST, "gust");
  }
  return b;
}

/** Cast at X and let the first cast resolve up to the replay offer (or the open state if none). */
async function castAtX(game: Game): Promise<Decision | null> {
  await game.p1.cast("dfb", { targets: "x" });
  const r = await game.settle();
  return r.decision;
}

/**
 * After accepting a replay: pass priority around, name `target` whenever the engine asks for the
 * replay's target (whenever that is), and stop at the next replay offer or the open state.
 */
async function driveReplay(game: Game, target: string): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d) {
      return;
    }
    if (d.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else if (d.kind === "pick" && d.seat === P1) {
      await game.p1.pick(target);
    } else {
      return;
    }
  }
}

describe("Death from Below × Helm of Suppression × Daughter of the Void — replay from trash", () => {
  // ── (a) hand cost ────────────────────────────────────────────────────────────────────────────
  test("(a) from hand under an un-Empowered Helm it costs 5 energy + 1 rainbow (4+[A] base, +[1] Helm — 356.3); 4 energy is no longer enough; without Helm it is 4+[A]", async () => {
    const game = await board({ energy: 6, rainbow: 1 }).build();
    expect(game.p1.can("cast", "dfb")).toBe(true);
    await game.p1.cast("dfb", { targets: "x" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { rainbow: 0 } });

    const short = await board({ energy: 4, rainbow: 1 }).build();
    expect(short.p1.can("cast", "dfb")).toBe(false);

    const noHelm = await board({ energy: 4, rainbow: 1, helm: false }).build();
    await noHelm.p1.cast("dfb", { targets: "x" });
    expect(noHelm.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  });

  // ── (b) when the replay is offered ───────────────────────────────────────────────────────────
  test("(b) nothing is offered while Death from Below is still a chain item; X (2 ≤ 3, look-back 359.3.e.13) dies FIRST, then P1 gets the optional 'play this from your trash' offer sourced from the spell", async () => {
    const game = await board({ energy: 6, rainbow: 2 }).build();
    await game.p1.cast("dfb", { targets: "x" });
    expect(game.zoneOf("dfb")).toBe("chain");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    expect(game.zoneOf("x")).toBe("battlefield-bf1");
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.zoneOf("x")).toBe("trash");
    expect(r.decision).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "dfb" } });
    expect(r.decision?.timing).toBe("RES");
  });

  test("(b) the replay needs no Action/Reaction timing: accepting it mid-resolution on P1's own turn puts Death from Below back on the chain as a NEW, non-triggered spell item controlled by P1, and P2 gets priority to react before it resolves (419.3)", async () => {
    const game = await board({ energy: 6, rainbow: 2 }).build();
    const offer = await castAtX(game);
    expect(offer).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    await game.p1.yes();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dfb", controller: P1, triggered: false, type: "spell" })]);
    expect(game.zoneOf("dfb")).toBe("chain");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // P2's Reaction window
  });

  // 419.3.b + 355.5: the replay is a full play, so its target (Y or another battlefield unit) is
  // chosen as it is played, BEFORE P2's reaction window — never looked up at resolution.
  test("(b) the replay's target is chosen as part of playing it (355.5 via 419.3.b) — P1 names Y before P2 ever gets priority, not at resolution", async () => {
    const game = await board({ energy: 6, rainbow: 2 }).unit(P1, "bf1", { might: 1, name: "Z" }, "z").build();
    await castAtX(game);
    await game.p1.yes();
    // Two legal battlefield units remain (Y, Z) → a real choice must be asked now, of P1, before priority.
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["y", "z"]);
    await game.p1.pick("y");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  // ── (b) replay cost pipeline ─────────────────────────────────────────────────────────────────
  test("(b) control — WITHOUT Helm the replay costs exactly [rainbow]: 'for [rainbow]' replaces the 4-energy base (356.1.a), so 0 energy + 1 rainbow accepts it and only the rainbow is spent", async () => {
    const game = await board({ energy: 4, rainbow: 2, helm: false }).build();
    const offer = await castAtX(game);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(offer).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["dfb"]);
  });

  // 356.1.a then 356.3 (cf. 356.1.b.3): replay total under Helm = [1] + [rainbow] — with 0 energy
  // left the offer is not acceptable; with 1 energy + 1 rainbow accepting drains both.
  test("(b) under Helm the replay costs [1]+[rainbow] — Helm's +[1] applies on top of the replaced base (356.3 / 356.1.b.3)", async () => {
    const broke = await board({ energy: 5, rainbow: 2 }).build(); // 5+[A] paid → 0 energy, 1 rainbow left
    const offer = await castAtX(broke);
    expect(broke.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(offer).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(offer?.kind === "yes-no" && offer.canAccept).toBe(false);

    const game = await board({ energy: 6, rainbow: 2 }).build(); // → 1 energy, 1 rainbow left
    await castAtX(game);
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["dfb"]);
  });

  // 357.1.a / 429.3 / 444.2.c: while the replay's [rainbow] is being demanded, P1 may activate
  // Daughter of the Void (a Reaction [Add]; its "only to play spells" earmark fits — this IS a spell
  // play); it resolves at once and the offer becomes acceptable.
  test("(b) Daughter of the Void may be exhausted during the replay's pay step to Add the [rainbow] (357.1.a / 429.3 / 444.2.c)", async () => {
    const game = await board({ energy: 4, rainbow: 1, helm: false }).build();
    const offer = await castAtX(game);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(offer).toMatchObject({ kind: "yes-no", seat: P1 });
    const actions = offer?.kind === "yes-no" ? (offer.actions ?? []) : [];
    expect(actions.some((a) => a.verb === "activate" && a.card === "kaisa")).toBe(true);
    await game.p1.activate("kaisa");
    expect(game.state("kaisa").isExhausted).toBe(true);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["dfb"]);
  });

  // 429.4 earmark "use only to play spells" + 419.3 (the replay is a spell play): a [rainbow] Added by
  // Daughter of the Void in response to the first cast sits in the pool and can pay the replay.
  test("(b) Daughter's spell-earmarked [rainbow] (added in response, before resolution) pays for the replay — it is a spell being played", async () => {
    const game = await board({ energy: 4, rainbow: 1, helm: false }).build();
    await game.p1.cast("dfb", { targets: "x" });
    expect(game.p1.can("activate", "kaisa")).toBe(true); // Reaction speed on the open chain
    await game.p1.activate("kaisa");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    const r = await game.settle();
    expect(r.decision).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "dfb" } });
    expect(r.decision?.kind === "yes-no" && r.decision.canAccept).toBe(true);
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["dfb"]);
  });

  // ── (c) second resolution at 5-Might Y ───────────────────────────────────────────────────────
  test("(c) the replay kills Y (5 Might): 'if it had 3 or less' is false → no third play is offered; Death from Below rests in P1's TRASH (not banished, not castable)", async () => {
    const game = await board({ energy: 4, rainbow: 3, helm: false }).build();
    await castAtX(game);
    await game.p1.yes();
    await driveReplay(game, "y");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("y")).toBe("trash");
    expect(game.zoneOf("dfb")).toBe("trash");
    expect(game.p1.trash()).toContain("dfb");
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } }); // one rainbow left, yet…
    expect(game.p1.legal().some((o) => o.card === "dfb")).toBe(false); // …no play of it from the trash
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // ── (d) NO side: X leaves the battlefield in response ────────────────────────────────────────
  test("(d) P2 Gusts X back to hand in response: the kill is skipped (359.3.e.2/.5), 'its Might' is null (359.3.e.12) so the linked replay is never offered (359.3.e.14.a); Death from Below → trash, the 5+[A] stay spent", async () => {
    const game = await board({ energy: 6, rainbow: 2, gust: true }).build();
    await game.p1.cast("dfb", { targets: "x" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { rainbow: 1 } });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "x" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["dfb", "gust"]);
    const r = await game.settle(); // Gust resolves (LIFO), then Death from Below with an illegal target
    expect(r.reason).toBe("open"); // no yes/no was raised for P1
    expect(game.zoneOf("x")).toBe("hand");
    expect(game.p2.hand()).toContain("x");
    expect(game.zoneOf("y")).toBe("battlefield-bf1");
    expect(game.zoneOf("dfb")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { rainbow: 1 } }); // nothing refunded
    expect(game.p1.legal().some((o) => o.card === "dfb")).toBe(false);
  });

  // ── (e) spells-played bookkeeping ────────────────────────────────────────────────────────────
  // 350.1 / 419.4.a: the hand cast and the replay are two complete plays of a spell, so Ravenbloom
  // Student triggers twice (+2) — the first cast's trigger must not be lost when the replay is accepted.
  test.failing("BUG: (e) each resolved cast is a separate spell played — Ravenbloom Student gets +1 for the hand cast AND +1 for the replay (350.1 / 419.4.a)", async () => {
    const game = await board({ energy: 4, rainbow: 3, helm: false, student: true }).build();
    expect(game.state("student").might).toBe(2);
    await castAtX(game);
    await game.p1.yes();
    await driveReplay(game, "y");
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action" });
    expect(game.zoneOf("y")).toBe("trash");
    expect(game.state("student").might).toBe(4);
  });

  test("(e) control — a single cast with no replay (Y, 5 Might) is exactly one spell played: Student +1", async () => {
    const game = await board({ energy: 4, rainbow: 1, helm: false, student: true }).build();
    await game.p1.cast("dfb", { targets: "y" });
    await game.settle();
    expect(game.zoneOf("y")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action" });
    expect(game.state("student").might).toBe(3);
  });

  // NOTE: the mistargeted leg still counts as a played spell — CR 359.3.e.10 spells this exact case
  // out ("the unit's ability still triggers as the spell resolves"); only a COUNTERED spell (419.4.a.1)
  // would not. So after Gust saves X, Student is still +1 for the fizzled Death from Below.
  test("(e) the Gusted (fully mistargeted) cast is still a spell played — Student +1 (359.3.e.10); it is not a counter (419.4.a.1)", async () => {
    const game = await board({ energy: 4, rainbow: 1, helm: false, gust: true, student: true }).build();
    await game.p1.cast("dfb", { targets: "x" });
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "x" });
    await game.settle();
    expect(game.zoneOf("x")).toBe("hand");
    expect(game.zoneOf("dfb")).toBe("trash");
    expect(game.state("student").might).toBe(3);
  });
});
