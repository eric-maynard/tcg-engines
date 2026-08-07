/**
 * Interaction: Zhonya's Hourglass (ogn-077-298) · Gear · Calm · 2
 *     "[Hidden] If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and
 *      recall it. (Send it to base. This isn't a move.)"
 *   × Guardian Angel (sfd-051-221) · Equipment · Calm · 2 · +1 Might · "[Equip] [calm]" — appends to
 *     the equipped unit: "If I would die, kill Guardian Angel instead. Heal me, exhaust me, and
 *     recall me." (rule 373.2 example text)
 *   × Vanguard Sergeant (ogn-219-298) · Unit · Order · 4 · 4 Might (vanilla)
 *
 * Question (a): P2 defends bf1 with Sergeant A wearing Guardian Angel (4+1 = 5) and vanilla
 * Sergeant B (4); P2 also controls one Zhonya's Hourglass in base. P1 attacks with a single
 * 10-Might unit; lethal is assigned to both (5+4 = 9), the attacker takes 9 and survives. Both
 * defenders would die simultaneously in the combat-damage cleanup. Must P2 be prompted, and can P2
 * route GA → A and Zhonya's → B so both survive? What if P2 applies Zhonya's to A first?
 * Question (b): BOTH Sergeants wear a Guardian Angel (attacker 11, 5/5 lethal). May P2 pick GA for
 * each death so that Zhonya's is NOT consumed?
 *
 * Rules:
 *   370.1.a.2 / 373  the two combat deaths are simultaneous events; each is treated separately for
 *                    replacement effects; same-controller replacements are applied in the order
 *                    their controller (P2) chooses → a decision for P2.
 *   372              A's death has two applicable replacements (GA, Zhonya's) → P2 orders them.
 *   373.1.a / 365.1  an applied replacement's actions (kill Zhonya's …) are performed before the
 *                    other, unmodified death — so a Zhonya's that saved one unit is in the trash and
 *                    no longer on the board to save the second one.
 *   370.2 / 373.2    each replacement is applied at most once per event / in one sequence.
 *   370.1.b          once GA replaced A's death, the replacing event is "kill Guardian Angel" — an
 *                    Equipment, not "a friendly unit" — so Zhonya's cannot chain onto it.
 *   466.1.a.2 / 466.3.a / 466.5.d  no defenders left at bf1 → attacker stays, wins, conquers.
 *
 * Expected:
 *   (a) P2 gets an order/assignment decision. Best line: GA replaces A's death (GA → trash, A to
 *       base healed + exhausted, back to 4 Might) and Zhonya's replaces B's death (Zhonya's → trash,
 *       B to base healed + exhausted). Attacker alone at bf1 → conquers, P1 scores 1.
 *       Alternate legal line: Zhonya's on A first → A saved WITH GA still attached (recall is
 *       board→board), GA unused; B then simply dies → trash. In no line can ONE Zhonya's save both.
 *   (b) Each death offers {its own GA, Zhonya's}; P2 choosing GA for both → both GAs in trash, both
 *       Sergeants in base exhausted at 4 Might, Zhonya's still in P2's base, un-consumed.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const GUARDIAN_ANGEL = "sfd-051-221";
const VANGUARD_SERGEANT = "ogn-219-298";

/**
 * P1's turn. P2 holds bf1 with Sergeant A (wearing gaA) and Sergeant B (vanilla, or wearing gaB
 * when `bothGA`), plus a face-up Zhonya's Hourglass in P2's base. P1's lone attacker waits in base.
 */
function board(opts: { attacker: number; bothGA?: boolean }) {
  const s = scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", VANGUARD_SERGEANT, "sgtA", { equippedWith: ["gaA"] } as Record<string, unknown>)
    .card("gaA", { def: GUARDIAN_ANGEL, meta: { attachedTo: "sgtA" } as Record<string, unknown>, owner: P2, zone: "bf1" });
  if (opts.bothGA) {
    s.unit(P2, "bf1", VANGUARD_SERGEANT, "sgtB", { equippedWith: ["gaB"] } as Record<string, unknown>).card("gaB", {
      def: GUARDIAN_ANGEL,
      meta: { attachedTo: "sgtB" } as Record<string, unknown>,
      owner: P2,
      zone: "bf1",
    });
  } else {
    s.unit(P2, "bf1", VANGUARD_SERGEANT, "sgtB");
  }
  return s.gear(P2, ZHONYAS, "zh").unit(P1, "base", { might: opts.attacker, name: "Big Attacker" }, "atk");
}

function isReplacementPrompt(d: Decision | null): d is Extract<Decision, { kind: "pick" | "order" }> {
  return !!d && d.seat === P2 && (d.kind === "pick" || d.kind === "order");
}

/**
 * Answer every replacement-ordering prompt P2 is given, putting the first key from `prefer` that
 * the prompt offers first (falls back to the prompt's own first option), until the game is open.
 */
async function p2Orders(game: Game, prefer: readonly string[]): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (r.reason !== "unanswered" || !isReplacementPrompt(d)) {
      return;
    }
    const keys = d.kind === "order" ? d.items.map((o) => o.key) : d.options.map((o) => o.card ?? o.key);
    const first = prefer.find((p) => keys.includes(p)) ?? (keys[0] as string);
    if (d.kind === "order") {
      await game.p2.order([first, ...keys.filter((k) => k !== first)]);
    } else {
      await game.p2.pick(first);
    }
  }
}

async function attack(opts: { attacker: number; bothGA?: boolean }): Promise<Game> {
  const game = await board(opts).build();
  await game.p1.move("atk", "bf1");
  return game;
}

describe("Zhonya's Hourglass × Guardian Angel — two defenders die in the same combat cleanup", () => {
  test("setup: Sergeant A is 5 Might with Guardian Angel attached, Sergeant B is 4, Zhonya's sits in P2's base", async () => {
    const game = await board({ attacker: 10 }).build();
    expect(game.state("sgtA")).toMatchObject({ attachments: ["gaA"], might: 5, zone: "battlefield-bf1" });
    expect(game.state("gaA").attachedTo).toBe("sgtA");
    expect(game.state("sgtB")).toMatchObject({ attachments: [], might: 4, zone: "battlefield-bf1" });
    expect(game.p2.gear()).toContain("zh");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  // ---- (a) one GA (on A) + one Zhonya's; both Sergeants take lethal ---------------------------

  // Expected: both deaths are simultaneous; A's death has {GA, Zhonya's}, B's has {Zhonya's}; P2 (the
  // controller of both dying units and of every replacement) must be asked how to order/assign them
  // (372, 373). Actual: no prompt — the cleanup silently applies Zhonya's to everything.
  test("BUG: (a) P2 must be given an ordering/assignment decision for the simultaneous deaths (372, 373)", async () => {
    const game = await attack({ attacker: 10 });
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    const d = game.decision();
    expect(d?.seat).toBe(P2);
    expect(["pick", "order"]).toContain(d?.kind as string);
  });

  // Expected: P2 puts GA first for A → gaA killed instead (trash), A healed/exhausted/recalled to base
  // at its printed 4 Might; Zhonya's then replaces B's death → zh to trash, B healed/exhausted/recalled.
  // Actual: gaA never fires (still attached to A in base), Zhonya's "saves" both.
  test("BUG: (a) best line — GA replaces A's death (gaA → trash, A in base exhausted at 4 Might) and Zhonya's replaces B's (zh → trash, B in base exhausted) (372, 373.1.a)", async () => {
    const game = await attack({ attacker: 10 });
    await p2Orders(game, ["gaA", "zh"]);
    expect(game.zoneOf("gaA")).toBe("trash");
    expect(game.state("sgtA")).toMatchObject({ attachments: [], damage: 0, isExhausted: true, might: 4, zone: "base" });
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.state("sgtB")).toMatchObject({ damage: 0, isExhausted: true, might: 4, zone: "base" });
    expect(game.p2.trash().sort()).toEqual(["gaA", "zh"]);
  });

  // Expected: whatever order is taken, ONE Zhonya's can replace only ONE of the two deaths — after it
  // kills itself for the first it is no longer on the board for the second (373.1.a, 365.1, 370.2). So
  // "both Sergeants alive AND Guardian Angel unused" is unreachable. Actual: exactly that happens —
  // zh in trash, gaA still attached, sgtA and sgtB both recalled to base.
  test("BUG: (a) a single Zhonya's Hourglass cannot save both Sergeants — if GA is unused, one Sergeant must be in the trash (373 example, 373.1.a, 365.1)", async () => {
    const game = await attack({ attacker: 10 });
    await p2Orders(game, ["gaA", "zh"]);
    const gaUsed = game.zoneOf("gaA") === "trash";
    const aDead = game.zoneOf("sgtA") === "trash";
    const bDead = game.zoneOf("sgtB") === "trash";
    expect(gaUsed || aDead || bDead).toBe(true);
    // Zhonya's is applied at most once: at most one unit it saved keeps no GA receipt.
    const savedByZhonyas = ["sgtA", "sgtB"].filter((u) => game.zoneOf(u) === "base").length - (gaUsed ? 1 : 0);
    expect(savedByZhonyas).toBeLessThanOrEqual(1);
  });

  // Expected alternate legal branch: P2 applies Zhonya's to A first → zh trash, A recalled to base
  // healed + exhausted WITH gaA still attached (recall is board→board; 5 Might), GA unused; then B's
  // death has no replacement left on the board → B dies → trash. Actual: no prompt; B is also saved.
  test("BUG: (a) alternate line — Zhonya's on A first: A saved with GA still attached (5 Might), GA unused, B dies to trash (373.1.a, 365.1)", async () => {
    const game = await attack({ attacker: 10 });
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(isReplacementPrompt(game.decision())).toBe(true);
    await p2Orders(game, ["zh"]);
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.state("sgtA")).toMatchObject({ attachments: ["gaA"], damage: 0, isExhausted: true, might: 5, zone: "base" });
    expect(game.state("gaA")).toMatchObject({ attachedTo: "sgtA", zone: "base" });
    expect(game.zoneOf("sgtB")).toBe("trash");
  });

  test("(a) the 10-Might attacker takes 9, survives, and — with no defender left at bf1 — is not recalled, wins the combat and conquers (466.1.a.2, 466.3.a, 466.5.d)", async () => {
    const game = await attack({ attacker: 10 });
    await p2Orders(game, ["gaA", "zh"]);
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.locationOf("atk")).toBe("bf1");
    expect(game.state("atk").damage).toBe(0); // healed in the combat cleanup (466.1.a.1)
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([]);
  });

  test("(a) in every line both Sergeants leave bf1 and neither keeps damage; the saved ones are exhausted in P2's base (Zhonya's / GA text, 456)", async () => {
    const game = await attack({ attacker: 10 });
    await p2Orders(game, ["gaA", "zh"]);
    for (const u of ["sgtA", "sgtB"]) {
      expect(game.locationOf(u)).not.toBe("bf1");
      if (game.zoneOf(u) === "base") {
        expect(game.state(u).damage).toBe(0);
        expect(game.state(u).isExhausted).toBe(true);
        expect(game.p2.base()).toContain(u);
      }
    }
    expect(game.violations()).toEqual([]);
  });

  // ---- (b) both Sergeants wear a Guardian Angel; attacker 11 assigns 5/5 ------------------------

  test("(b) setup: both Sergeants are 5 Might with their own Guardian Angel", async () => {
    const game = await board({ attacker: 11, bothGA: true }).build();
    expect(game.state("sgtA")).toMatchObject({ attachments: ["gaA"], might: 5 });
    expect(game.state("sgtB")).toMatchObject({ attachments: ["gaB"], might: 5 });
    expect(game.state("gaB").attachedTo).toBe("sgtB");
  });

  // Expected: each death has two same-controller replacements {own GA, Zhonya's} → P2 orders each
  // (372) → at least one prompt for P2. Actual: none; Zhonya's is auto-applied.
  test("BUG: (b) P2 is prompted to order GA vs Zhonya's for the dying Sergeants (372, 373)", async () => {
    const game = await attack({ attacker: 11, bothGA: true });
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(isReplacementPrompt(game.decision())).toBe(true);
  });

  // Expected: P2 picks GA first for both → gaA and gaB killed instead (trash), both Sergeants healed,
  // exhausted, recalled to base at 4 Might. Actual: both GAs stay attached; Zhonya's is burned.
  test("BUG: (b) choosing GA for each death: both Guardian Angels → trash, both Sergeants in base exhausted at 4 Might (370.1.b, 373.2)", async () => {
    const game = await attack({ attacker: 11, bothGA: true });
    await p2Orders(game, ["gaA", "gaB"]);
    expect(game.zoneOf("gaA")).toBe("trash");
    expect(game.zoneOf("gaB")).toBe("trash");
    expect(game.state("sgtA")).toMatchObject({ attachments: [], damage: 0, isExhausted: true, might: 4, zone: "base" });
    expect(game.state("sgtB")).toMatchObject({ attachments: [], damage: 0, isExhausted: true, might: 4, zone: "base" });
  });

  // Expected: after each GA fully replaced its bearer's death there is no "friendly unit would die"
  // event left (the replacing event kills an Equipment — 370.1.b), so nothing forces Zhonya's to
  // apply: it REMAINS in P2's base. Actual: the engine auto-burns Zhonya's (zh → trash).
  test("BUG: (b) Zhonya's Hourglass is NOT consumed when Guardian Angel already replaced each death — it stays in P2's base (370.1.b, 370.2)", async () => {
    const game = await attack({ attacker: 11, bothGA: true });
    await p2Orders(game, ["gaA", "gaB"]);
    expect(game.zoneOf("zh")).toBe("base");
    expect(game.p2.gear()).toContain("zh");
    expect(game.p2.trash()).not.toContain("zh");
  });

  test("(b) the 11-Might attacker takes 10, survives alone at bf1 and conquers (466.3.a, 466.5.d)", async () => {
    const game = await attack({ attacker: 11, bothGA: true });
    await p2Orders(game, ["gaA", "gaB"]);
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.locationOf("atk")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.trash()).not.toContain("sgtA");
    expect(game.p2.trash()).not.toContain("sgtB");
  });
});
