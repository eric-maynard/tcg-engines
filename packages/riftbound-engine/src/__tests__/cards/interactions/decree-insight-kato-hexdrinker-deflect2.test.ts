/**
 * Interaction: Decree of Insight (ven-061-166) · Spell · Mind · 1 · "[Reaction] Ignore [Deflect] while paying this spell's
 *     cost. Give an enemy Body ([body]) unit -5 [Might] this turn."                                            — P2 (defender)
 *   × Kato the Arm (sfd-112-221) · Unit · Body · 4 + [body] · 3 Might · "[Deflect] When I move to a battlefield, give another
 *     friendly unit my keywords and +[Might] equal to my Might this turn."                                     — P1 (attacker)
 *   × Hexdrinker (sfd-102-221) · Equipment · Body · 2 · +1 Might · effect text "[Deflect]"                      — attached to Kato
 *   contrast spell: Hextech Ray (ogn-009-298) · Fury · 1 + [fury] · "[Action] Deal 3 to a unit at a battlefield."
 *   NO-side unit: Pouty Poro (ogn-013-298) · Fury · 2 Might · [Deflect] (not Body).
 *
 * Rules: 809.1.c / 809.1.c.1 (Deflect = +X Power of ANY domain per choice, paid by opponents), 809.2 (Deflect values SUM),
 * 718.3 / 719.1 (attached Equipment's effect text is appended to the unit's rules text), 356.2.a.2 (Deflect is a mandatory
 * additional cost — which Decree's static tells the payer to ignore), 355.16 / 358.5 (an unaffordable choice is not offered),
 * 143.2.b (Might < 0 is treated as 0 for combat sums), 142.4.b (lethal damage must be non-zero — 0 Might alone kills nobody),
 * 719.5 (bearer leaves the board → Equipment detaches and stays with its controller).
 *
 * Question: Kato (3 + 1 = 4, Deflect) wearing Hexdrinker attacks P2's 2-Might Sentry. (a) Deflect 1 or 2? (b) P2 casts Decree
 * at Kato with exactly {1 energy, 0 power} — cost/legality? (c) Hextech Ray at Kato instead — total cost, offered with {1, fury:1}?
 * (d) After Decree Kato is 4 − 5: fights at 0, does not die on the spot, dies in the damage step to the Sentry's 2; Hexdrinker
 * detaches to P1's base; P2 keeps bf1. Without Decree: 4 vs 2 → Kato conquers. (e) Decree at a non-Body Deflect unit — illegal.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DECREE_OF_INSIGHT = "ven-061-166";
const KATO_THE_ARM = "sfd-112-221";
const HEXDRINKER = "sfd-102-221";
const HEXTECH_RAY = "ogn-009-298";
const POUTY_PORO = "ogn-013-298";

/** P1's turn. P1: Kato in base wearing Hexdrinker (no other friendly unit → his move trigger has no object). P2: bf1 with a 2-Might Sentry; Decree + Ray in hand; pool as given. */
function board(p2Pool: { energy: number; power?: Record<string, number> }) {
  return scenario()
    .resources(P2, p2Pool)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Sentry" }, "sentry")
    .unit(P1, "base", KATO_THE_ARM, "kato", { equippedWith: ["hex"] })
    .gear(P1, HEXDRINKER, "hex", { attachedTo: "kato" })
    .hand(P2, DECREE_OF_INSIGHT, "decree")
    .hand(P2, HEXTECH_RAY, "ray");
}

/** Kato attacks bf1 (combat showdown opens, P1 has Focus, nothing on the chain); P1 passes Focus → P2 holds Focus. */
async function katoAttacksP2HasFocus(p2Pool: { energy: number; power?: Record<string, number> }): Promise<Game> {
  const game = await board(p2Pool).build();
  await game.p1.move("kato", "bf1");
  expect(game.chain()).toEqual([]);
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  return game;
}

function targetsOffered(game: Game, alias: string): string[] {
  const field = game.p2.option("cast", alias)?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

describe("(a) Kato + Hexdrinker = Deflect 2 (809.2 + 718.3/719.1)", () => {
  test("Kato reads 3 + 1 = 4 Might, has printed Deflect AND a static Deflect 1 granted by the attached Hexdrinker", async () => {
    const game = await board({ energy: 1 }).build();
    const kato = game.state("kato");
    expect(kato).toMatchObject({ attachments: ["hex"], baseMight: 3, might: 4 });
    expect(kato.keywords).toContain("Deflect");
    expect(kato.grantedKeywords).toEqual([{ duration: "static", keyword: "Deflect", value: 1 }]);
    expect(game.state("hex").attachedTo).toBe("kato");
  });

  test("the values SUM to 2: Hextech Ray (1 + [fury]) at Kato needs 1 fury + 2 more Power — with {1, fury:2} Kato is NOT offered, with {1, fury:3} he is and the cast drains all 3", async () => {
    const two = await katoAttacksP2HasFocus({ energy: 1, power: { fury: 2 } });
    expect(targetsOffered(two, "ray")).toEqual(["sentry"]);
    await expect(two.p2.cast("ray", { targets: "kato" })).rejects.toThrow();

    const three = await katoAttacksP2HasFocus({ energy: 1, power: { fury: 3 } });
    expect(new Set(targetsOffered(three, "ray"))).toEqual(new Set(["sentry", "kato"]));
    await three.p2.cast("ray", { targets: "kato" });
    expect(three.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(three.chain()).toEqual([expect.objectContaining({ cardId: "ray", controller: P2, targets: ["kato"] })]);
  });
});

describe("(b) Decree of Insight ignores Deflect while paying: exactly 1 energy, legal with {1, 0}", () => {
  test("with P2 on {1 energy, 0 power} and Focus, Decree IS offered with Kato (enemy Body unit) as its only target", async () => {
    const game = await katoAttacksP2HasFocus({ energy: 1 });
    expect(game.p2.resources()).toEqual({ energy: 1, power: {} });
    expect(game.p2.can("cast", "decree")).toBe(true);
    expect(targetsOffered(game, "decree")).toEqual(["kato"]);
  });

  test("casting it at Kato spends exactly 1 energy and no Power (neither Deflect pip is added, 356.2.a.2 waived); it waits on the chain targeting Kato and P1 gets priority to respond", async () => {
    const game = await katoAttacksP2HasFocus({ energy: 1 });
    await game.p2.cast("decree", { targets: "kato" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "decree", controller: P2, targets: ["kato"], triggered: false })]);
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("Reaction timing still needs priority: with an EMPTY chain and P1 holding Focus P2 cannot cast it yet; once Focus passes to P2 it can", async () => {
    const game = await board({ energy: 1 }).build();
    await game.p1.move("kato", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p2.can("cast", "decree")).toBe(false);
    await game.p1.passFocus();
    expect(game.p2.can("cast", "decree")).toBe(true);
  });

  test("with {0 energy} it is NOT offered — the 1 energy is still due; only Deflect is ignored", async () => {
    const game = await katoAttacksP2HasFocus({ energy: 0, power: { fury: 2 } });
    expect(game.p2.can("cast", "decree")).toBe(false);
  });
});

describe("(c) contrast — Hextech Ray pays full Deflect", () => {
  test("with only {1, fury:1} Ray is castable but Kato is not a legal/offered target (355.16 / 358.5) — only the Sentry is; naming Kato is rejected", async () => {
    const game = await katoAttacksP2HasFocus({ energy: 1, power: { fury: 1 } });
    expect(game.p2.can("cast", "ray")).toBe(true);
    expect(targetsOffered(game, "ray")).toEqual(["sentry"]);
    const r = await game.p2.try((p) => p.cast("ray", { targets: "kato" }));
    expect(r.ok).toBe(false);
    expect(game.p2.resources()).toEqual({ energy: 1, power: { fury: 1 } }); // nothing spent
    expect(game.chain()).toEqual([]);
  });

  test("809.1.c.1 — the 2 Deflect Power may be of ANY domain: {1, fury:1, calm:2} makes Kato a legal Ray target", async () => {
    const game = await katoAttacksP2HasFocus({ energy: 1, power: { calm: 2, fury: 1 } });
    expect(new Set(targetsOffered(game, "ray"))).toEqual(new Set(["sentry", "kato"]));
    await game.p2.cast("ray", { targets: "kato" });
    expect(game.p2.energy()).toBe(0);
    expect(game.p2.power()).toBe(0);
  });
});

describe("(d) Decree resolves: Kato at 4 − 5 fights at 0, does not die on the spot, dies in the damage step", () => {
  async function decreeResolved(): Promise<Game> {
    const game = await katoAttacksP2HasFocus({ energy: 1 });
    await game.p2.cast("decree", { targets: "kato" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("decree")).toBe("trash");
    return game;
  }

  test("right after resolution Kato is STILL on bf1 with no damage: mightModifier −5, effective Might treated as 0 (143.2.b) — 0 Might with 0 damage is not lethal (142.4.b)", async () => {
    const game = await decreeResolved();
    expect(game.zoneOf("kato")).toBe("battlefield-bf1");
    expect(game.state("kato")).toMatchObject({ damage: 0, mightModifier: -5, zone: "battlefield-bf1" });
    expect(game.state("kato").might).toBeLessThanOrEqual(0);
    expect(Math.max(0, game.state("kato").might)).toBe(0);
    // The showdown simply continues — Focus passes back to P1.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
  });

  test("both pass → damage step: Kato contributes 0 (Sentry undamaged), the Sentry's 2 ≥ 0 kills Kato; Hexdrinker detaches and is in P1's base unattached (719.5); P2 keeps bf1, P1 scores nothing", async () => {
    const game = await decreeResolved();
    await game.settle();
    expect(game.zoneOf("kato")).toBe("trash");
    expect(game.p1.trash()).toContain("kato");
    expect(game.state("sentry")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.zoneOf("hex")).toBe("base");
    expect(game.state("hex")).toMatchObject({ attachedTo: undefined, controller: P1, owner: P1, zone: "base" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control line — no Decree: Kato 4 vs Sentry 2 → the Sentry dies, Kato survives (healed) still wearing Hexdrinker and conquers bf1 for a point", async () => {
    const game = await board({ energy: 0 }).build();
    await game.p1.move("kato", "bf1");
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.state("kato")).toMatchObject({ attachments: ["hex"], damage: 0, might: 4, zone: "battlefield-bf1" });
    expect(game.state("hex").attachedTo).toBe("kato");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});

describe("(e) NO-side — Decree needs an enemy BODY unit; ignoring Deflect does not widen the requirement", () => {
  test("Pouty Poro (Fury, Deflect) attacking instead: with {1, fury:2} P2's Decree is not castable at all (no legal target) and naming the Poro is rejected", async () => {
    const game = await scenario()
      .resources(P2, { energy: 1, power: { fury: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Sentry" }, "sentry")
      .unit(P1, "base", POUTY_PORO, "pouty")
      .hand(P2, DECREE_OF_INSIGHT, "decree")
      .build();
    await game.p1.move("pouty", "bf1");
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "decree")).toBe(false);
    expect(targetsOffered(game, "decree")).toEqual([]);
    await expect(game.p2.cast("decree", { targets: "pouty" })).rejects.toThrow();
    expect(game.p2.resources()).toEqual({ energy: 1, power: { fury: 2 } });
  });

  test("…and P2's own Body unit is never a Decree target either ('enemy'): a friendly Body defender beside the Sentry is not offered", async () => {
    const game = await board({ energy: 1 }).unit(P2, "bf1", { domain: "body", might: 1, name: "Body Buddy" }, "buddy").build();
    await game.p1.move("kato", "bf1");
    await game.p1.passFocus();
    expect(targetsOffered(game, "decree")).toEqual(["kato"]);
  });
});
