/**
 * Interaction: Keeper of Masks (unl-081-219) · Unit · Mind · 2 · 1 Might
 *     "[Hidden] [Temporary] When you play me, play two Reflection unit tokens here. They become copies of me."
 *   × Gust (ogn-169-298) · Spell · Chaos · 1 · "[Reaction] Return a unit at a battlefield with 3 [Might] or
 *     less to its owner's hand."
 *   × Renata Glasc, Industrialist (sfd-171-221) · Unit · "Your tokens enter ready."
 *   (+ Mirror Image unl-200-219 "Choose a unit. Play a ready Reflection unit token …" for (e).)
 *
 * Rules: 383.2.c (a trigger condition is evaluated right after the inciting event — the tokens had no
 * "When you play me" when THEY were played), 477.1.b.1 / .a / .b (copy = the source's PRINTED copyable
 * traits: name, type, tags, cost, domain, rules text), 185.1.a (still tokens), 185.3.a.2 (cost appended),
 * 182 / 183 (owner / controller = P1), 143.4 (units enter exhausted unless told otherwise), 811.1.d.3 (a
 * play effect of a permanent played from facedown must play its units at THAT battlefield), 816.1.b / 816.2
 * (Temporary: kill at the start of the controller's Beginning Phase, before scoring), 186.1 (a token off
 * the board ceases to exist), 359.3.f.1 / .2 / .2.a ("here"/"me" are referents read on execution — null
 * once the source left the board → instructions ignored), 107.3.e / 355.9.a.1 / .a.3 (a facedown card is
 * not a unit on the board; facedown zones are not locations).
 *
 * Board: P1's turn 2, P1 controls bf1 with Keeper of Masks FACEDOWN there (hidden on an earlier turn).
 * P2 holds bf2 with a 2-Might Watcher, has 1 energy and Gust in hand. Variant: Renata Glasc in P1's base.
 *
 * Q/Expected:
 *  (a) P1 plays Keeper from facedown ([0]); its trigger plays two Reflections at bf1 which become copies —
 *      their copied play triggers do NOT fire (no loop): exactly two tokens, chain empty afterwards.
 *  (b) Each token: name Keeper of Masks, unit, Mind, cost 2, 1 Might, Hidden + Temporary, IS a token,
 *      owned/controlled by P1, at bf1 (811.1.d.3 — no location choice is even offered), EXHAUSTED
 *      (143.4) — READY with Renata on board.
 *  (c) At the start of P1's next Beginning Phase all three Temporary triggers fire and all three die
 *      BEFORE scoring (P1 does not score the hold); Keeper → trash, the tokens cease to exist.
 *  (d) P2 Gusts Keeper in response to the play trigger: Gust resolves first, Keeper → P1's hand; the
 *      trigger then finds "here"/"me" null → no tokens anywhere.
 *  (e) While Keeper is facedown, P2's Mirror Image cannot choose it.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KEEPER = "unl-081-219";
const GUST = "ogn-169-298";
const RENATA = "sfd-171-221";
const MIRROR_IMAGE = "unl-200-219";

function board(opts: { renata?: boolean; anchor?: boolean } = {}) {
  let s = scenario()
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .facedown(P1, "bf1", KEEPER, "keeper")
    .unit(P2, "bf2", { might: 2, name: "Watcher" }, "watcher")
    .hand(P2, GUST, "gust");
  if (opts.renata) {
    s = s.unit(P1, "base", RENATA, "renata");
  }
  if (opts.anchor) {
    s = s.unit(P1, "bf1", { might: 2, name: "Anchor" }, "anchor");
  }
  return s;
}

/** All Reflection-born tokens anywhere on the board (they read as copies, so find them by token-ness). */
function tokensOnBoard(game: Game): string[] {
  return ["bf1", "bf2", "base"].flatMap((loc) => game.cardsAt(loc)).filter((c) => game.state(c).isToken);
}

/** P1 plays Keeper from facedown and lets the play trigger resolve unopposed. */
async function playKeeperAndResolve(game: Game): Promise<string[]> {
  await game.p1.reveal("keeper");
  const r = await game.settle();
  expect(r.reason).toBe("open");
  return tokensOnBoard(game);
}

describe("Keeper of Masks — copies don't re-trigger; Temporary is copied; Gust nulls 'here'", () => {
  // ── (a) no loop ──────────────────────────────────────────────────────────────────────────────

  test("(a) playing Keeper from facedown costs [0], lands it at bf1 with NO location choice offered (811.1.d.3), and puts exactly ONE play trigger on the chain", async () => {
    const game = await board().build();
    expect(game.p1.can("reveal", "keeper")).toBe(true);
    expect(game.p1.option("revealHidden", "keeper")?.fields ?? []).toEqual([]); // nothing to choose — 'here' is forced
    await game.p1.reveal("keeper");
    expect(game.zoneOf("keeper")).toBe("battlefield-bf1");
    expect(game.state("keeper").isHidden).toBe(false);
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "keeper", controller: P1, triggered: true })]);
    expect(game.chain()).toHaveLength(1);
  });

  test("(a) the trigger plays exactly TWO tokens at bf1 and the chain is then EMPTY — the tokens' copied 'When you play me' did not trigger (383.2.c: they had no such ability when they were played)", async () => {
    const game = await board().build();
    const tokens = await playKeeperAndResolve(game);
    expect(tokens).toHaveLength(2);
    for (const t of tokens) {
      expect(game.locationOf(t)).toBe("bf1");
    }
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.units("bf1").sort()).toEqual(["keeper", ...tokens].sort()); // 3 bodies, not 7, not ∞
    expect(game.p1.units("base")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // ── (b) what the tokens are ──────────────────────────────────────────────────────────────────

  test("(b) each token is a COPY of Keeper's printed traits: name, unit, Mind, cost 2 (185.3.a.2), 1 Might, Hidden + Temporary — yet still a token (185.1.a), owned and controlled by P1 (182/183)", async () => {
    const game = await board().build();
    const tokens = await playKeeperAndResolve(game);
    expect(tokens).toHaveLength(2);
    for (const t of tokens) {
      expect(game.state(t)).toMatchObject({
        baseMight: 1,
        cardType: "unit",
        controller: P1,
        domains: ["mind"],
        energyCost: 2,
        isToken: true,
        might: 1,
        name: "Keeper of Masks",
        owner: P1,
        zone: "battlefield-bf1",
      });
      expect(game.state(t).keywords).toEqual(expect.arrayContaining(["Hidden", "Temporary"]));
    }
    // The original is the same shape but NOT a token.
    expect(game.state("keeper")).toMatchObject({ energyCost: 2, isToken: false, might: 1, name: "Keeper of Masks" });
  });

  test("(b) 'play two Reflection unit tokens' does not say ready → the tokens (and Keeper itself) enter EXHAUSTED (143.4)", async () => {
    const game = await board().build();
    const tokens = await playKeeperAndResolve(game);
    expect(game.state("keeper").isExhausted).toBe(true);
    for (const t of tokens) {
      expect(game.state(t).isExhausted).toBe(true);
    }
  });

  test("(b) contrast — with Renata Glasc, Industrialist on P1's board the two tokens enter READY (Keeper, a non-token, still enters exhausted)", async () => {
    const game = await board({ renata: true }).build();
    const tokens = await playKeeperAndResolve(game);
    expect(tokens).toHaveLength(2);
    for (const t of tokens) {
      expect(game.state(t).isReady).toBe(true);
      expect(game.state(t).name).toBe("Keeper of Masks");
    }
    expect(game.state("keeper").isExhausted).toBe(true);
  });

  // ── (c) Temporary is COPIED: all three die at P1's next Beginning Phase, before scoring ──────

  test("(c) at the start of P1's next Beginning Phase THREE Temporary triggers go on the chain (one per permanent, 816.1.b) — nobody 'gave' the tokens Temporary, they copied it", async () => {
    const game = await board().build();
    const tokens = await playKeeperAndResolve(game);
    await game.advanceTurn(); // → P2's turn; everything survives P2's turn
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("keeper")).toBe("battlefield-bf1");
    expect(tokens.map((t) => game.zoneOf(t))).toEqual(["battlefield-bf1", "battlefield-bf1"]);
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["keeper", ...tokens].sort());
    expect(game.chain().every((c) => c.triggered && c.controller === P1)).toBe(true);
  });

  test("(c) they resolve: Keeper → P1's trash, both tokens CEASE TO EXIST (186.1); bf1 is empty and — having died BEFORE scoring — P1 does not score the hold", async () => {
    const game = await board().build();
    const tokens = await playKeeperAndResolve(game);
    await game.advanceTurn();
    await game.advanceTurn(); // P2 ends → P1's Beginning Phase triggers settle → P1's main
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("keeper")).toBe("trash");
    expect(game.p1.trash()).toContain("keeper");
    for (const t of tokens) {
      expect(game.zoneOf(t)).toBe("gone");
      expect(game.has(t)).toBe(false);
    }
    expect(game.p1.trash()).toHaveLength(1); // tokens never reach the trash
    expect(game.cardsAt("bf1")).toEqual([]);
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("(c) control for 'before scoring': with a non-Temporary Anchor also at bf1, P1 DOES score 1 for holding at that same Beginning Phase while Keeper and both tokens still die", async () => {
    const game = await board({ anchor: true }).build();
    const tokens = await playKeeperAndResolve(game);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("keeper")).toBe("trash");
    expect(tokens.map((t) => game.zoneOf(t))).toEqual(["gone", "gone"]);
    expect(game.cardsAt("bf1")).toEqual(["anchor"]);
  });

  // ── (d) Gust in response: 'here' / 'me' go null ──────────────────────────────────────────────

  test("(d) with the play trigger on the chain P2 gets priority and Gust offers Keeper (1 Might, at a battlefield); Gust goes on top (LIFO)", async () => {
    const game = await board().build();
    await game.p1.reveal("keeper");
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    const field = game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets");
    const offered = [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
    expect(offered).toContain("keeper");
    await game.p2.cast("gust", { targets: "keeper" });
    expect(game.p2.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["keeper", "gust"]);
  });

  test("(d) Gust resolves first: Keeper → P1's HAND; the trigger then resolves with 'here'/'me' null (359.3.f.2.a) — NO tokens at bf1, in base, or anywhere; chain empty, Gust in P2's trash", async () => {
    const game = await board().build();
    await game.p1.reveal("keeper");
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "keeper" });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("keeper")).toBe("hand");
    expect(game.p1.hand()).toContain("keeper");
    expect(game.state("keeper").isHidden).toBe(false);
    expect(tokensOnBoard(game)).toEqual([]);
    expect(game.cardsAt("bf1")).toEqual([]);
    expect(game.p1.units()).toEqual([]);
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (e) a facedown card is not a unit ────────────────────────────────────────────────────────

  test("(e) while Keeper is FACEDOWN at bf1, P2's Mirror Image ('Choose a unit') is offered the real units only — never the facedown card (107.3.e / 355.9.a.1 / .a.3); forcing it is rejected", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 3, power: { rainbow: 2 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .facedown(P1, "bf1", KEEPER, "keeper")
      .unit(P2, "bf2", { might: 2, name: "Watcher" }, "watcher")
      .unit(P1, "base", { might: 2, name: "Pal" }, "pal")
      .hand(P2, MIRROR_IMAGE, "mirror")
      .build();
    expect(game.zoneOf("keeper")).toBe("facedown-bf1");
    expect(game.p2.can("cast", "mirror")).toBe(true);
    const field = game.p2.option("cast", "mirror")?.fields.find((f) => f.name === "targets");
    const offered = [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].sort();
    expect(offered).toEqual(["pal", "watcher"]);
    await expect(game.p2.cast("mirror", { targets: "keeper" })).rejects.toThrow();
    expect(game.zoneOf("mirror")).toBe("hand");
    expect(game.zoneOf("keeper")).toBe("facedown-bf1");
  });
});
