/**
 * Interaction: Detonate (sfd-005-221) · Spell · Fury · 1 + [fury] · "Kill a gear. Its controller draws 2."           — P2
 *   × Hexdrinker (sfd-102-221) · Equipment · Body · 2 · +1 Might · Rules Text "[Equip] [body]" · EFFECT Text "[Deflect]"
 *       #1 attached to P1's Vanguard Sergeant (ogn-219-298, vanilla 4 → 5) at bf1; #2 loose in P1's base
 *   × Factory Recall (sfd-135-221) · Spell · Chaos · 1 · [Action] "Return a gear to its owner's hand."             — P2
 *   (+ Hextech Ray ogn-009-298 · 1 + [fury] · "[Action] Deal 3 to a unit at a battlefield." as the Deflect-cost probe.)
 *
 * Rules: 724 + 136.2.b / 721.2 (Effect Text is INACTIVE unless the card is attached), 718.3 / 719.1 / 136.2.c (while
 * attached, the Effect Text abilities are appended to the TOP-MOST card's text — Deflect's "me" is the Sergeant, never
 * the gear), 718.5 / 718.5.b (an attached card is still a gear on the board and may be chosen), 809.1.c / 809.1.c.1 /
 * 809.1.d (Deflect = mandatory extra Power of any domain, paid by opponents choosing THAT object), 428.2 (killed → owner's
 * trash), 435.1.d / 435.1.e / 137.3.a (once the attachment is gone the appended text and +1 end at once), 719.2 / 719.4
 * / 818.3.b (the former host is simply no longer Equipped; its ready/exhausted state is untouched), 124.1 (returned to
 * hand = new object).
 *
 * Question: P2's turn, P2 has exactly {3 energy, 2 fury}. (a) Detonate the LOOSE Hexdrinker #2 — Deflect surcharge?
 * (b) Detonate the ATTACHED #1 — choosable? surcharge? where does it go, who draws, what is the Sergeant afterwards?
 * (c) Hextech Ray at the Sergeant while #1 is attached vs after (b) — total cost; with the exact post-Detonate pool
 * {2, fury:1} is Ray castable at him? (d) Factory Recall on attached #1 instead — surcharge? whose hand? Sergeant?
 *
 * Expected: (a) no surcharge (Effect Text inactive off-host): 1 + [fury]; #2 → P1's trash; P1 draws 2. (b) choosable; NO
 * surcharge (the Deflect belongs to the Sergeant, not the gear): 1 + [fury]; #1 → P1's trash; P1 draws 2; Sergeant = plain
 * 4, no Deflect, still at bf1, exhaustion untouched; nothing "detaches to" anywhere. (c) attached: Ray at the Sergeant =
 * 1 + [fury] + 1 any-power → with {2,1f} not castable at him; after (b): 1 + [fury] → legal, 3 damage, not lethal (4).
 * Ray FIRST would eat the spare fury and strand Detonate. (d) no surcharge (1); #1 → its OWNER's (P1's) hand as a new
 * object; Sergeant 4 without Deflect at once; no draw.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DETONATE = "sfd-005-221";
const HEXDRINKER = "sfd-102-221";
const FACTORY_RECALL = "sfd-135-221";
const HEXTECH_RAY = "ogn-009-298";
const VANGUARD_SERGEANT = "ogn-219-298";

type Pool = { energy: number; power?: Record<string, number> };
const EXACT: Pool = { energy: 3, power: { fury: 2 } };

/**
 * P2's turn 2, main phase. P1: controls bf1 with the Vanguard Sergeant wearing Hexdrinker #1 (4 + 1 = 5, Deflect via the
 * appended Effect Text); Hexdrinker #2 unattached in P1's base. P2: Detonate, Factory Recall, Hextech Ray in hand; pool as
 * given (default: exactly {3 energy, 2 fury}).
 */
function board(pool: Pool = EXACT, opts: { sergeantExhausted?: boolean } = {}) {
  return scenario()
    .active(P2)
    .resources(P2, pool)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", VANGUARD_SERGEANT, "sergeant", { equippedWith: ["hex1"], ...(opts.sergeantExhausted ? { exhausted: true } : {}) })
    .gear(P1, HEXDRINKER, "hex1", { attachedTo: "sergeant" })
    .gear(P1, HEXDRINKER, "hex2")
    .hand(P2, DETONATE, "detonate")
    .hand(P2, FACTORY_RECALL, "recall")
    .hand(P2, HEXTECH_RAY, "ray");
}

/** The rules-correct position right after (b) resolved: bare Sergeant (4) at bf1, Hexdrinker #1 in P1's trash, P2 on {2, fury:1}. */
function afterDetonateBoard() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 2, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", VANGUARD_SERGEANT, "sergeant")
    .trash(P1, HEXDRINKER, "hex1")
    .gear(P1, HEXDRINKER, "hex2")
    .hand(P2, HEXTECH_RAY, "ray");
}

function targetsOffered(game: Game, alias: string): string[] {
  const field = game.p2.option("cast", alias)?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

async function castAndResolve(game: Game, alias: string, target: string): Promise<void> {
  await game.p2.cast(alias, { targets: target });
  const s = await game.settle();
  expect(s.reason).toBe("open");
  expect(game.chain()).toEqual([]);
}

describe("setup — where the Deflect lives", () => {
  test("the Sergeant wearing #1 is 4 + 1 = 5 and has Deflect 1 as a STATIC grant from the attachment (718.3 / 719.1); the Hexdrinker cards themselves — attached or loose — carry no active Deflect, only [Equip] (724 / 136.2.b)", async () => {
    const game = await board().build();
    expect(game.state("sergeant")).toMatchObject({ attachments: ["hex1"], baseMight: 4, location: "bf1", might: 5 });
    expect(game.state("sergeant").keywords).toContain("Deflect");
    expect(game.state("sergeant").grantedKeywords).toEqual([{ duration: "static", keyword: "Deflect", value: 1 }]);
    expect(game.state("hex1")).toMatchObject({ attachedTo: "sergeant", controller: P1, owner: P1 });
    expect(game.state("hex1").keywords).not.toContain("Deflect");
    expect(game.state("hex1").grantedKeywords).toEqual([]);
    expect(game.state("hex2")).toMatchObject({ attachedTo: undefined, zone: "base" });
    expect(game.state("hex2").keywords).not.toContain("Deflect");
    expect(game.state("hex2").grantedKeywords).toEqual([]);
    expect(game.p2.resources()).toEqual({ energy: 3, power: { fury: 2 } });
  });
});

describe("(a) Detonate on the UNATTACHED Hexdrinker #2 — no Deflect surcharge", () => {
  // Engine bug: choosing a Hexdrinker card (even unattached) is charged 1 extra Power as if the gear itself had Deflect —
  // from {3, fury:2} the cast leaves {2, fury:0}, and with only {1, fury:1} #2 is not even offered. Rules 724 / 136.2.b:
  // the Effect Text is inactive off-host, so Detonate on #2 costs exactly 1 + [fury].
  test("costs exactly 1 + [fury] — from {3, fury:2} P2 is left with {2, fury:1}; and with a bare {1, fury:1} #2 is still a legal target", async () => {
    const game = await board().build();
    await game.p2.cast("detonate", { targets: "hex2" });
    expect(game.p2.resources()).toEqual({ energy: 2, power: { fury: 1 } });

    const tight = await board({ energy: 1, power: { fury: 1 } }).build();
    expect(targetsOffered(tight, "detonate")).toContain("hex2");
    await tight.p2.cast("detonate", { targets: "hex2" });
    expect(tight.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("resolution: #2 is killed into P1's trash and P1 — its controller — draws 2; the Sergeant (still wearing #1) is untouched at 5 with Deflect", async () => {
    const game = await board().build();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await castAndResolve(game, "detonate", "hex2");
    expect(game.zoneOf("hex2")).toBe("trash");
    expect(game.p1.trash()).toEqual(["hex2"]);
    expect(game.p2.trash()).toEqual(["detonate"]);
    expect(game.p1.hand()).toHaveLength(p1Hand + 2);
    expect(game.p2.hand()).toHaveLength(p2Hand - 1);
    expect(game.state("sergeant")).toMatchObject({ attachments: ["hex1"], might: 5 });
    expect(game.state("sergeant").keywords).toContain("Deflect");
    expect(game.violations()).toEqual([]);
  });
});

describe("(b) Detonate on the ATTACHED Hexdrinker #1 — choosable, no surcharge, host reverts to a plain 4", () => {
  test("an attached Equipment is still 'a gear' on the board: Detonate lists #1 alongside #2 (718.5 / 718.5.b)", async () => {
    const game = await board().build();
    expect(new Set(targetsOffered(game, "detonate"))).toEqual(new Set(["hex1", "hex2"]));
    expect(game.p2.can("cast", "detonate")).toBe(true);
  });

  // Engine bug: same spurious surcharge as (a) — the attached gear is treated as having its own Deflect. Rules 718.3 /
  // 719.1 / 136.2.c: the appended Deflect's "me" is the Sergeant; choosing the GEAR costs just 1 + [fury].
  test("no surcharge for choosing the gear (Deflect protects the Sergeant, not #1): from {3, fury:2} the cast leaves {2, fury:1}; with {1, fury:1} #1 is still offered", async () => {
    const game = await board().build();
    await game.p2.cast("detonate", { targets: "hex1" });
    expect(game.p2.resources()).toEqual({ energy: 2, power: { fury: 1 } });

    const tight = await board({ energy: 1, power: { fury: 1 } }).build();
    expect(targetsOffered(tight, "detonate")).toContain("hex1");
  });

  test("resolution: #1 is killed from the board straight into its OWNER's (P1's) trash (428.2), unattached; P1 draws 2, P2 draws nothing", async () => {
    const game = await board().build();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await castAndResolve(game, "detonate", "hex1");
    expect(game.zoneOf("hex1")).toBe("trash");
    expect(game.state("hex1")).toMatchObject({ attachedTo: undefined, owner: P1, zone: "trash" });
    expect(game.p1.trash()).toEqual(["hex1"]);
    expect(game.p1.hand()).toHaveLength(p1Hand + 2);
    expect(game.p2.hand()).toHaveLength(p2Hand - 1);
  });

  test("the Sergeant AT ONCE loses the appended Deflect and the +1: plain 4 Might, no keywords/grants, no attachments — still at bf1, still ready (435.1.d/e, 137.3.a, 719.2, 719.4)", async () => {
    const game = await board().build();
    await castAndResolve(game, "detonate", "hex1");
    expect(game.state("sergeant")).toMatchObject({
      attachments: [],
      baseMight: 4,
      damage: 0,
      grantedKeywords: [],
      isExhausted: false,
      location: "bf1",
      might: 4,
      zone: "battlefield-bf1",
    });
    expect(game.state("sergeant").keywords).not.toContain("Deflect");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("719.4 the other way round: an EXHAUSTED Sergeant stays exhausted when its Equipment is blown off", async () => {
    const game = await board(EXACT, { sergeantExhausted: true }).build();
    expect(game.state("sergeant").isExhausted).toBe(true);
    await castAndResolve(game, "detonate", "hex1");
    expect(game.state("sergeant")).toMatchObject({ attachments: [], isExhausted: true, location: "bf1", might: 4 });
  });

  test("nothing 'detaches to' a location: #1 is in the trash (not P1's base, not bf1), #2 is the only gear P1 has left, and no recall/cleanup moved the Sergeant", async () => {
    const game = await board().build();
    await castAndResolve(game, "detonate", "hex1");
    expect(game.p1.base()).not.toContain("hex1");
    expect(game.cardsAt("battlefield-bf1")).not.toContain("hex1");
    expect(game.p1.gear()).toEqual(["hex2"]);
    expect(game.p1.units("bf1")).toEqual(["sergeant"]);
    expect(game.p1.units("base")).toEqual([]);
  });
});

describe("(c) Hextech Ray at the Sergeant — Deflect is paid for choosing the HOST, and only while #1 is on him", () => {
  test("while #1 is attached: with {2, fury:1} the Sergeant is NOT a legal Ray target (needs 1 + [fury] + 1 more Power, 809.1.c/.d) — Ray has no target at all", async () => {
    const game = await board({ energy: 2, power: { fury: 1 } }).build();
    expect(targetsOffered(game, "ray")).toEqual([]);
    expect(game.p2.can("cast", "ray")).toBe(false);
    const r = await game.p2.try((p) => p.cast("ray", { targets: "sergeant" }));
    expect(r.ok).toBe(false);
    expect(game.p2.resources()).toEqual({ energy: 2, power: { fury: 1 } });
  });

  test("while #1 is attached, from the full {3, fury:2}: Ray at the Sergeant IS legal and drains 1 energy + BOTH fury (the surcharge may be any domain, 809.1.c.1) → 3 damage on a 5-Might unit, he lives", async () => {
    const game = await board().build();
    expect(targetsOffered(game, "ray")).toEqual(["sergeant"]);
    await game.p2.cast("ray", { targets: "sergeant" });
    expect(game.p2.resources()).toEqual({ energy: 2, power: { fury: 0 } });
    await game.settle();
    expect(game.state("sergeant")).toMatchObject({ damage: 3, might: 5, zone: "battlefield-bf1" });
  });

  test("order matters — Ray FIRST strands Detonate: after paying the surcharge P2 has {2, fury:0} and Detonate (1 + [fury]) is no longer castable at anything", async () => {
    const game = await board().build();
    await game.p2.cast("ray", { targets: "sergeant" });
    await game.settle();
    expect(game.p2.resources()).toEqual({ energy: 2, power: { fury: 0 } });
    expect(game.p2.can("cast", "detonate")).toBe(false);
    expect(targetsOffered(game, "detonate")).toEqual([]);
  });

  test("after (b) — bare 4-Might Sergeant, P2 on {2, fury:1}: Ray now costs just 1 + [fury], lists the Sergeant, and deals 3 (not lethal on 4); P2 ends on {1, fury:0}", async () => {
    const game = await afterDetonateBoard().build();
    expect(game.state("sergeant")).toMatchObject({ attachments: [], might: 4 });
    expect(game.state("sergeant").keywords).not.toContain("Deflect");
    expect(targetsOffered(game, "ray")).toEqual(["sergeant"]);
    await game.p2.cast("ray", { targets: "sergeant" });
    expect(game.p2.resources()).toEqual({ energy: 1, power: { fury: 0 } });
    await game.settle();
    expect(game.state("sergeant")).toMatchObject({ damage: 3, location: "bf1", might: 4, zone: "battlefield-bf1" });
    expect(game.zoneOf("ray")).toBe("trash");
  });

  // Engine bug (knock-on of the spurious gear surcharge in (b)): Detonate on #1 eats both fury, so the follow-up Ray is
  // unaffordable. Correct budget: Detonate 1+[fury] → {2, fury:1}; Sergeant now Deflect-less → Ray 1+[fury] → {1, fury:0}.
  test("the full line on the exact {3, fury:2} budget — Detonate #1, THEN Ray the now-Deflect-less Sergeant for 1 + [fury]: both resolve, Sergeant at 4 with 3 damage, P2 left with {1, fury:0}", async () => {
    const game = await board().build();
    await castAndResolve(game, "detonate", "hex1");
    expect(game.p2.resources()).toEqual({ energy: 2, power: { fury: 1 } });
    expect(targetsOffered(game, "ray")).toEqual(["sergeant"]);
    await game.p2.cast("ray", { targets: "sergeant" });
    await game.settle();
    expect(game.p2.resources()).toEqual({ energy: 1, power: { fury: 0 } });
    expect(game.state("sergeant")).toMatchObject({ damage: 3, might: 4 });
  });
});

describe("(d) Factory Recall on the attached #1 — no surcharge, back to its OWNER's hand, host reverts", () => {
  test("Factory Recall lists both Hexdrinkers (attached #1 included, 718.5.b)", async () => {
    const game = await board().build();
    expect(new Set(targetsOffered(game, "recall"))).toEqual(new Set(["hex1", "hex2"]));
  });

  // Engine bug: the same spurious Deflect surcharge — Factory Recall (cost 1, no Power) on #1 is charged 1 fury
  // ({3,2} → {2,1}), and with {1, no power} neither Hexdrinker is offered. Rules: choosing the gear costs exactly 1.
  test("costs exactly 1 energy and no Power — from {3, fury:2} P2 keeps {2, fury:2}; with a bare {1} #1 is still a legal target", async () => {
    const game = await board().build();
    await game.p2.cast("recall", { targets: "hex1" });
    expect(game.p2.resources()).toEqual({ energy: 2, power: { fury: 2 } });

    const tight = await board({ energy: 1 }).build();
    expect(targetsOffered(tight, "recall")).toContain("hex1");
  });

  test("resolution: #1 returns to its OWNER's — P1's — hand (not P2's) as a fresh, unattached card (124.1); nobody draws; nothing lands in P1's base or trash", async () => {
    const game = await board().build();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await castAndResolve(game, "recall", "hex1");
    expect(game.zoneOf("hex1")).toBe("hand");
    expect(game.p1.hand()).toContain("hex1");
    expect(game.p2.hand()).not.toContain("hex1");
    expect(game.state("hex1")).toMatchObject({ attachedTo: undefined, owner: P1, zone: "hand" });
    expect(game.p1.hand()).toHaveLength(p1Hand + 1); // just the gear itself — no "draws 2" here
    expect(game.p2.hand()).toHaveLength(p2Hand - 1);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.base()).not.toContain("hex1");
    expect(game.p1.gear()).toEqual(["hex2"]);
    expect(game.zoneOf("recall")).toBe("trash");
  });

  test("the Sergeant immediately drops to a plain 4 with no Deflect, still at bf1, not recalled, ready state untouched (435.1.d/e, 719.2, 719.4)", async () => {
    const game = await board().build();
    await castAndResolve(game, "recall", "hex1");
    expect(game.state("sergeant")).toMatchObject({
      attachments: [],
      grantedKeywords: [],
      isExhausted: false,
      location: "bf1",
      might: 4,
      zone: "battlefield-bf1",
    });
    expect(game.state("sergeant").keywords).not.toContain("Deflect");
    expect(game.p1.units("bf1")).toEqual(["sergeant"]);
    expect(game.violations()).toEqual([]);
  });
});
