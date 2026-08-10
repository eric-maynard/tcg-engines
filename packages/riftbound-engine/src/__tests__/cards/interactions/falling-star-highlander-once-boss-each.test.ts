/**
 * Interaction: Falling Star (ogn-029-298) · Spell · Fury · 2 + [fury][fury] · Action — "Deal 3 to a unit. Deal 3 to a unit."
 *   × Highlander (ogs-020-024) · Spell · Calm/Body · 4 · Reaction — "Choose a friendly unit. The next time it would die
 *     this turn, heal it, exhaust it, and recall it instead."
 *   × The Boss (ogn-269-298) · Legend · Sett — "If a buffed unit you control would die, you may pay [rainbow], exhaust
 *     me, and spend its buff to heal it, exhaust it, and recall it instead. …"
 *
 * Rules: 142.4.a / 321 / 323.5 (lethal damage kills only in a Cleanup and no Cleanup happens while an item resolves —
 * the two Deals are two damage instances inside ONE item), 369.1 / 370.1.a.1 / 372 / 373 (would-die replacements are
 * consulted at that single Cleanup; several with the same controller → that controller orders them; a one-shot one is
 * consumed once), 437.7 (spending a buff), 389 (delayed "next time" effects), 820.1.d.1 (analogy: multi-execution).
 * FIXER-PRIMER "Multi-execution / multi-instance damage vs replacements" (adjudicated model): The Boss is a DAMAGE-time
 * shield — offered at the instance that makes the marked damage lethal, mid-resolution; Highlander / Zhonya's / GA are
 * CLEANUP-class — applied once after the spell has left the chain.
 *
 * Question — P2's buffed vanilla U (printed 2, +1 = 3 Might) is at bf1; on P1's turn P1 casts Falling Star with both
 * instances on U.
 *  (a) P2 (no Boss) responds with Highlander on U: instance 1 → 3/3, instance 2 → 6/3, nothing "would die" in between;
 *      ONE Cleanup → Highlander replaces the single death: U healed, exhausted, recalled to base, buff KEPT (3 Might);
 *      Highlander's shield consumed. U is NOT saved-then-rekilled.
 *  (b) No Highlander, legend The Boss (ready, 1 power), P2 accepts the first offer: offered at instance 1 (3 ≥ 3, U at
 *      bf1, spell still resolving); accept → 1 power, Boss exhausted, buff spent (2 Might), healed / exhausted /
 *      recalled; instance 2 → 3 on a 2-Might U → dies at the Cleanup. Declining → 6 marked → dies; nothing spent.
 *  (c) Both, P2 declines The Boss whenever offered: at the Cleanup P2 applies Highlander → U saved to base, healed,
 *      exhausted, buff intact; The Boss stays ready, power unspent.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FALLING_STAR = "ogn-029-298";
const HIGHLANDER = "ogs-020-024";
const THE_BOSS = "ogn-269-298";

/** P1's turn 2 with exactly 2 + [fury][fury]; P2: buffed 2(+1)-Might U alone at bf1, 4 energy (Highlander) + 1 power (The Boss). */
function board(opts: { boss: boolean; highlander: boolean }) {
  let s = scenario()
    .resources(P1, { energy: 2, power: { fury: 2 } })
    .resources(P2, { energy: 4, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Unit U" }, "u", { buffed: true })
    .hand(P1, FALLING_STAR, "fs");
  if (opts.highlander) {
    s = s.hand(P2, HIGHLANDER, "hl");
  }
  if (opts.boss) {
    s = s.legend(P2, THE_BOSS, "boss");
  }
  return s;
}

const isBossOffer = (d: Decision | null): boolean => d?.kind === "yes-no" && d.seat === P2 && /The Boss/.test(d.prompt);

/** P1 casts Falling Star (both instances on U); if P2 holds Highlander it responds with it on U and Highlander resolves (LIFO). Stops with Falling Star alone on the chain, P1 holding priority. */
async function starOnU(game: Game, opts: { highlander: boolean }): Promise<void> {
  await game.p1.cast("fs", { targets: ["u", "u"] });
  await game.p1.passPriority();
  if (opts.highlander) {
    await game.p2.cast("hl", { targets: "u" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["fs", "hl"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Highlander resolves
    expect(game.chain().map((c) => c.cardId)).toEqual(["fs"]);
  }
}

/** Both players pass on Falling Star so it resolves (up to the first prompt / open state). */
async function resolveStar(game: Game): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    }
  }
}

/** (c) navigator: P2 declines The Boss whenever asked and, if asked to order/assign its replacements, puts Highlander first. */
async function declineBossPreferHighlander(game: Game): Promise<{ bossOffers: number }> {
  let bossOffers = 0;
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (!d || d.seat !== P2 || d.kind === "action") {
      break;
    }
    if (d.kind === "yes-no") {
      bossOffers += isBossOffer(d) ? 1 : 0;
      await game.p2.no();
    } else if (d.kind === "pick") {
      const keys = d.options.map((o) => o.key).sort((a, b) => (a === "hl" ? -1 : b === "hl" ? 1 : 0));
      await game.p2.answer({ keys: d.max > 1 ? keys : [keys[0] as string], kind: "pick" });
    } else if (d.kind === "order") {
      await game.p2.order(d.items.map((o) => o.key).sort((a, b) => (a === "hl" ? -1 : b === "hl" ? 1 : 0)));
    } else {
      break;
    }
  }
  return { bossOffers };
}

describe("common ground", () => {
  test("U is a buffed 3-Might unit at bf1; Falling Star may name U for BOTH instances (one chain item, targets [U, U]) and costs all of 2 + [fury][fury]", async () => {
    const game = await board({ boss: false, highlander: true }).build();
    expect(game.state("u")).toMatchObject({ baseMight: 2, isBuffed: true, location: "bf1", might: 3 });
    expect(game.p1.option("cast", "fs")?.fields.find((f) => f.name === "targets")?.options).toContainEqual(["u", "u"]);
    await game.p1.cast("fs", { targets: ["u", "u"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fs", controller: P1, targets: ["u", "u"], triggered: false })]);
  });
});

describe("(a) Highlander in response, no Boss — the shield fires ONCE, at the Cleanup after both instances (321, 142.4.a, 373)", () => {
  test("Highlander is a legal Reaction for P2 on P1's chain (4 energy), resolves first (LIFO) → a one-shot 'next time U would die' replacement bound to U is installed, Highlander → P2's trash, U untouched, Falling Star still pending", async () => {
    const game = await board({ boss: false, highlander: true }).build();
    await game.p1.cast("fs", { targets: ["u", "u"] });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "hl")).toBe(true);
    expect(game.p2.option("cast", "hl")?.fields.find((f) => f.name === "targets")?.options).toEqual([["u"]]);
    await game.p2.cast("hl", { targets: "u" });
    expect(game.p2.energy()).toBe(0);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("hl")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["fs"]);
    expect(game.state("u")).toMatchObject({ damage: 0, isBuffed: true, location: "bf1", might: 3 });
    expect(game.gameState.activeReplacements ?? []).toEqual([
      expect.objectContaining({ duration: "next", owner: P2, replaces: "die", sourceCardId: "hl", targetCardIds: ["u"] }),
    ]);
  });

  test("no prompt of any kind while Falling Star resolves (a mandatory delayed replacement asks nothing); afterwards Falling Star and Highlander are in the trashes and the one-shot shield is used up", async () => {
    const game = await board({ boss: false, highlander: true }).build();
    await starOnU(game, { highlander: true });
    await resolveStar(game);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("fs")).toBe("trash");
    expect(game.zoneOf("hl")).toBe("trash");
    expect(game.gameState.activeReplacements ?? []).toEqual([]);
  });

  // BUG: the engine lets U die — Highlander is applied to a death produced by instance 1 (U recalled at 0), then
  // instance 2's 3 damage on the 3-Might U kills it for good (U ends in P2's trash). Expected (321 / 142.4.a / 323.5,
  // FIXER-PRIMER multi-instance model): 3 + 3 = 6 is marked with no death check in between; the ONE Cleanup after the
  // spell finds U lethal once and Highlander replaces that single death.
  test.failing("BUG: outcome — U survives: in P2's base, 0 damage, exhausted, buff KEPT (3 Might); it is NOT saved-then-rekilled", async () => {
    const game = await board({ boss: false, highlander: true }).build();
    await starOnU(game, { highlander: true });
    await game.settle();
    expect(game.zoneOf("u")).toBe("base");
    expect(game.state("u")).toMatchObject({ damage: 0, isBuffed: true, isExhausted: true, might: 3, zone: "base" });
    expect(game.p2.trash()).toEqual(["hl"]);
    expect(game.p2.units()).toEqual(["u"]);
    expect(game.violations()).toEqual([]);
  });
});

describe("(b) The Boss only — a damage-time shield, offered at instance 1 while the spell is still resolving (FIXER-PRIMER model)", () => {
  test("after both pass, P2 is asked The Boss's 'pay [rainbow] + exhaust' yes/no at INSTANCE 1: U still at bf1, buffed, exactly 3 damage (3 ≥ 3), Falling Star still on the chain; 'yes' is affordable", async () => {
    const game = await board({ boss: true, highlander: false }).build();
    await starOnU(game, { highlander: false });
    await resolveStar(game);
    const d = game.decision();
    expect(isBossOffer(d)).toBe(true);
    expect(d).toMatchObject({ canAccept: true, kind: "yes-no", seat: P2 });
    expect(game.state("u")).toMatchObject({ damage: 3, isBuffed: true, location: "bf1", might: 3 });
    expect(game.zoneOf("fs")).toBe("chain");
    expect(game.p2.power()).toBe(1);
    expect(game.state("boss").isExhausted).toBe(false);
  });

  test("P2 accepts: 1 power paid (energy untouched), The Boss exhausted, U's buff spent — then instance 2 deals 3 to the now-2-Might U (still 'a unit', a legal target in base) and it DIES at the Cleanup: U in P2's trash, Falling Star in P1's, bf1 no longer P2's", async () => {
    const game = await board({ boss: true, highlander: false }).build();
    await starOnU(game, { highlander: false });
    await resolveStar(game);
    await game.p2.yes();
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.p2.resources()).toEqual({ energy: 4, power: { body: 0 } });
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.zoneOf("u")).toBe("trash");
    expect(game.p2.trash()).toEqual(["u"]);
    expect(game.zoneOf("fs")).toBe("trash");
    expect(game.p2.units()).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("so the instance-class Boss (used at instance 1) does NOT get U through the spell — contrast with the Cleanup-class Highlander of (a), which the rules say does", async () => {
    const game = await board({ boss: true, highlander: false }).build();
    await starOnU(game, { highlander: false });
    await resolveStar(game);
    await game.p2.yes();
    await game.settle();
    expect(game.has("u") && game.zoneOf("u")).toBe("trash");
  });

  test("P2 declines: nothing is paid (power 1, Boss ready), 6 ends up marked and U simply dies at the Cleanup; the offer is not forced on P2 again", async () => {
    const game = await board({ boss: true, highlander: false }).build();
    await starOnU(game, { highlander: false });
    await resolveStar(game);
    expect(isBossOffer(game.decision())).toBe(true);
    await game.p2.no();
    for (let i = 0; i < 3 && isBossOffer(game.decision()); i++) {
      await game.p2.no(); // decline again if re-offered at instance 2
    }
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("u")).toBe("trash");
    expect(game.p2.power()).toBe(1);
    expect(game.state("boss").isExhausted).toBe(false);
    expect(game.zoneOf("fs")).toBe("trash");
  });
});

describe("(c) BOTH Highlander on U and The Boss; P2 declines The Boss whenever offered — Highlander saves U at the Cleanup, Boss and power untouched (372/373)", () => {
  // BUG: with both shields available the engine's first question to P2 is a rule-372 "order the replacement effects"
  // pick (hl | boss) raised with U already at 6 damage — i.e. it treats The Boss as a Cleanup-class candidate here.
  // Expected (FIXER-PRIMER model, as in (b)): The Boss is offered as its own yes/no at instance 1 (U at bf1, 3 damage,
  // Falling Star still resolving); Highlander is not a candidate until the Cleanup, so there is nothing to order yet.
  test.failing("BUG: the first prompt P2 sees is The Boss yes/no at instance 1 (U at bf1 with exactly 3 damage, spell on the chain) — not a replacement-order pick", async () => {
    const game = await board({ boss: true, highlander: true }).build();
    await starOnU(game, { highlander: true });
    await resolveStar(game);
    const d = game.decision();
    expect(d?.seat).toBe(P2);
    expect(game.zoneOf("fs")).toBe("chain");
    expect(game.state("u")).toMatchObject({ damage: 3, location: "bf1" });
    expect(isBossOffer(d)).toBe(true);
    expect(d?.kind === "pick" ? d.semantics : undefined).not.toBe("replacement-order");
  });

  test("P2 IS consulted (its two replacements would apply to the same death — P2's to arrange, 372/373): some P2 decision naming The Boss is pending before anything is healed or killed, with U still on bf1", async () => {
    const game = await board({ boss: true, highlander: true }).build();
    await starOnU(game, { highlander: true });
    await resolveStar(game);
    const d = game.decision();
    expect(d?.seat).toBe(P2);
    expect(d?.kind === "yes-no" || d?.kind === "pick" || d?.kind === "order").toBe(true);
    const s = JSON.stringify(d);
    expect(s).toContain("boss");
    expect(game.locationOf("u")).toBe("bf1");
    expect(game.state("u").isBuffed).toBe(true);
  });

  test("outcome when P2 declines The Boss at every offer (and puts Highlander first if asked to order): U saved to P2's base — 0 damage, exhausted, buff INTACT (3 Might); Highlander consumed (trash, no active shield left); The Boss still READY and the 1 power unspent; Falling Star in P1's trash; P1's open main phase", async () => {
    const game = await board({ boss: true, highlander: true }).build();
    await starOnU(game, { highlander: true });
    await resolveStar(game);
    await declineBossPreferHighlander(game);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("u")).toBe("base");
    expect(game.state("u")).toMatchObject({ damage: 0, isBuffed: true, isExhausted: true, might: 3, zone: "base" });
    expect(game.p2.units()).toEqual(["u"]);
    expect(game.zoneOf("hl")).toBe("trash");
    expect(game.gameState.activeReplacements ?? []).toEqual([]);
    expect(game.state("boss").isExhausted).toBe(false);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { body: 1 } });
    expect(game.zoneOf("fs")).toBe("trash");
    expect(game.p2.trash()).toEqual(["hl"]);
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P2); // U left bf1 (recall) → control lapses at the Open Cleanup
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
