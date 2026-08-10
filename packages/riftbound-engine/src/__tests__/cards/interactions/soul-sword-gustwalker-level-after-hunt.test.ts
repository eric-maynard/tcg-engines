/**
 * Interaction: Soul Sword (unl-039-219) · Equipment · Calm · 1 · +1 Might bonus
 *     "[Equip] [calm]  /  [Level 3][>] I have an additional +1 [Might]. (While you have 3+ XP, get the effect.)"
 *   × Gustwalker (unl-075-219) · Unit · Mind · 3 · 3 Might
 *     "[Hunt 2] (When I conquer or hold, gain 2 XP.)  /  [Level 3][>] I have +1 [Might] and [Ganking]."
 *   × Sunken Temple (sfd-218-221) · Battlefield
 *     "When you conquer here with one or more [Mighty] units, you may pay [1] to draw 1."
 *   (+ Angle Shot sfd-011-221 in P2's hand for the detach probe.)
 *
 * Question: Soul Sword is attached to P1's Gustwalker; Sunken Temple (bf1) is held by P2 with a lone vanilla
 * 3-Might defender D; P1 has exactly 1 XP.
 *   (a) Before moving: Gustwalker's Might / Ganking? Does an UNATTACHED Sword do anything even at 5 XP? How many
 *       gates does the Sword's Level line have?
 *   (b) Attack at 1 XP: fight Might, survival, conquer, Hunt / Sunken Temple triggers, and Gustwalker after Hunt
 *       resolves (1→3 XP). Is the Temple's draw available given it ENDS at 6?
 *   (c) YES side: same board at 3 XP from the start.
 *   (d) NO side: 1 XP but D is 4 Might.
 *   (e) At 3+ XP P2 Angle-Shots the Sword off: Gustwalker's stats, and does the loose Sword's Level line apply?
 *
 * Rules: 724 (Effect Text inactive unless Attached), 718.3 / 719.1 ("I" = the wearer), 477.3.d (Might bonus),
 * 824.1.b.1 / 824.1.c / 824.1.d / 824.2 (Level: active only while controller has N+ XP; still a characteristic),
 * 727.1.c.2 (passive dependent abilities start applying the moment the keyword turns true), 823.1.c.1 (Hunt),
 * 466.5.b / 466.5.d / 469.1 (no units left → uncontrolled, no conquer; establishing control = conquer),
 * 708 (conditions checked at the trigger instant), 435.1.d (detach strips the appended Effect Text),
 * 719.5 / 457.1 (wearer leaves the board → Equipment detaches and is recalled to base).
 *
 * Expected: (a) 4, no Ganking; unattached Sword grants nothing at any XP; two gates (attached AND 3+ XP).
 * (b) fights at 4 vs 3 → D dies, Gustwalker survives (3 dmg) → conquer, +1 point; Hunt triggers, Sunken Temple does
 * NOT (4 is not Mighty at the conquer instant); Hunt → 3 XP → Gustwalker 6 with Ganking; no draw offered.
 * (c) 6 + Ganking before moving; conquers WITH a Mighty unit → Temple opt-in offered alongside Hunt; pay 1 → draw 1;
 * Hunt → 5 XP; still 6. (d) 4 vs 4 → both die, bf1 uncontrolled, no conquer, no Hunt, XP stays 1; Sword loose in
 * P1's base, unattached. (e) Gustwalker 3+1(own L3) = 4, keeps Ganking; loose Sword's "+1" applies to nothing.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SOUL_SWORD = "unl-039-219";
const GUSTWALKER = "unl-075-219";
const SUNKEN_TEMPLE = "sfd-218-221";
const ANGLE_SHOT = "sfd-011-221";

/**
 * P1's turn 2. P1 at `xp` XP with exactly 1 energy (the Temple's [1]); Gustwalker in base wearing Soul Sword.
 * bf1 = live Sunken Temple held by P2 with a lone vanilla defender D of `dMight`. P2 holds Angle Shot + 2 energy.
 */
function board(opts: { xp?: number; dMight?: number } = {}) {
  return scenario()
    .xp(P1, opts.xp ?? 1)
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2, def: SUNKEN_TEMPLE, inert: false })
    .unit(P2, "bf1", { might: opts.dMight ?? 3, name: "Defender D" }, "dee")
    .unit(P1, "base", GUSTWALKER, "gw", { equippedWith: ["sword"] } as Record<string, unknown>)
    .card("sword", { def: SOUL_SWORD, meta: { attachedTo: "gw" } as Record<string, unknown>, owner: P1, zone: "base" })
    .hand(P2, ANGLE_SHOT, "shot");
}

/** Attack bf1 with Gustwalker and pass Focus both ways so combat resolves (stops at whatever the conquer produced). */
async function attack(game: Game): Promise<void> {
  await game.p1.move("gw", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  await game.p2.passFocus();
}

describe("Soul Sword × Gustwalker × Sunken Temple — Level lines wake only after Hunt resolves; the Temple checked Mighty at the conquer instant", () => {
  // ---- (a) static picture before moving ---------------------------------------------------------------

  test("(a) at 1 XP the equipped Gustwalker is 3 + 1 (Sword's Might bonus) = 4 with NO Ganking — both Level-3 lines are inactive (477.3.d, 824.1.d)", async () => {
    const game = await board().build();
    expect(game.p1.xp()).toBe(1);
    expect(game.state("gw")).toMatchObject({ attachments: ["sword"], baseMight: 3, might: 4, zone: "base" });
    expect(game.state("gw").keywords).not.toContain("Ganking");
    expect(game.state("gw").keywords).toContain("Hunt"); // Level text is inactive, the printed keywords stay (824.2)
    expect(game.state("sword")).toMatchObject({ attachedTo: "gw", controller: P1 });
  });

  test("(a) contrast at 5 XP (both gates satisfied): 3 + 1 bonus + 1 own L3 + 1 Sword L3 = 6 with Ganking", async () => {
    const game = await board({ xp: 5 }).build();
    expect(game.state("gw").might).toBe(6);
    expect(game.state("gw").keywords).toContain("Ganking");
  });

  test("(a) an UNATTACHED Soul Sword in base does nothing for anyone even at 5 XP — Effect Text is inactive unless Attached (724, 718.3/719.1)", async () => {
    const game = await scenario()
      .xp(P1, 5)
      .unit(P1, "base", GUSTWALKER, "gw")
      .unit(P1, "base", { might: 2, name: "Bystander" }, "by")
      .gear(P1, SOUL_SWORD, "sword")
      .build();
    expect(game.state("sword").attachedTo).toBeUndefined();
    expect(game.state("gw").might).toBe(4); // 3 + own Level 3 only
    expect(game.state("gw").keywords).toContain("Ganking");
    expect(game.state("by").might).toBe(2);
    expect(game.state("sword")).toMatchObject({ might: 0, staticMightBonus: 0 });
  });

  test("(a) two independent gates on the Sword's line: attached-but-1-XP → +1 only (bonus); 3-XP-but-unattached → +0; both → +2", async () => {
    const attachedLow = await board({ xp: 1 }).build();
    expect(attachedLow.state("gw").might - attachedLow.state("gw").baseMight).toBe(1);

    const looseHigh = await scenario().xp(P1, 3).unit(P1, "base", { might: 3, name: "Plain" }, "plain").gear(P1, SOUL_SWORD, "sword").build();
    expect(looseHigh.state("plain").might).toBe(3);

    const both = await scenario()
      .xp(P1, 3)
      .unit(P1, "base", { might: 3, name: "Plain" }, "plain", { equippedWith: ["sword"] } as Record<string, unknown>)
      .card("sword", { def: SOUL_SWORD, meta: { attachedTo: "plain" } as Record<string, unknown>, owner: P1, zone: "base" })
      .build();
    expect(both.state("plain").might).toBe(5); // 3 + 1 bonus + 1 Sword L3
  });

  // ---- (b) attack at 1 XP --------------------------------------------------------------------------------

  test("(b) Gustwalker fights at 4 vs D's 3: D dies, Gustwalker took 3 < 4 and survives (healed at Combat Cleanup, 466.1.a.1), P1 conquers bf1 and scores 1 (466.5.d, 469.1)", async () => {
    const game = await board().build();
    await attack(game);
    expect(game.zoneOf("dee")).toBe("trash");
    expect(game.state("gw")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect((game.state("gw").meta.lastDamage as { amount?: number } | undefined)?.amount).toBe(3);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("(b) at the conquer instant ONLY Hunt 2 goes on the chain — Sunken Temple does not trigger (Gustwalker is 4, not Mighty) and no pay-to-draw is asked (708, 823.1.c.1)", async () => {
    const game = await board().build();
    await attack(game);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gw", controller: P1, triggered: true })]);
    expect(game.chain().some((c) => c.cardId === "bf1")).toBe(false);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.xp()).toBe(1); // Hunt not resolved yet
    expect(game.state("gw").might).toBe(4); // still un-levelled while Hunt is pending
  });

  test("(b) Hunt resolves → 3 XP → BOTH Level lines switch on at once: Gustwalker = 3+1+1+1 = 6 with Ganking (727.1.c.2, 824.1.c)", async () => {
    const game = await board().build();
    await attack(game);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.p1.xp()).toBe(3);
    expect(game.state("gw").might).toBe(6);
    expect(game.state("gw").keywords).toContain("Ganking");
  });

  test("(b) too late for the Temple: ending the sequence at 6 does not retro-trigger it — no yes/no ever surfaces, energy still 1, hand unchanged, open main phase", async () => {
    const game = await board().build();
    const hand = game.p1.hand().length;
    await game.p1.move("gw", "bf1");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand);
    expect(game.p1.xp()).toBe(3);
    expect(game.state("gw").might).toBe(6);
    expect(game.violations()).toEqual([]);
  });

  // ---- (c) YES side: 3 XP from the start ------------------------------------------------------------------

  test("(c) at 3 XP Gustwalker is already 6 with Ganking before moving", async () => {
    const game = await board({ xp: 3 }).build();
    expect(game.state("gw").might).toBe(6);
    expect(game.state("gw").keywords).toContain("Ganking");
  });

  test("(c) it wins 6 vs 3 and conquers WITH a Mighty unit → Sunken Temple triggers alongside Hunt; P1 is asked 'pay [1] to draw 1' (canAccept)", async () => {
    const game = await board({ xp: 3 }).build();
    await attack(game);
    expect(game.zoneOf("dee")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["bf1", "gw"]);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
  });

  test("(c) P1 pays 1 → draws 1; then Hunt resolves → 5 XP; Gustwalker still 6 with Ganking", async () => {
    const game = await board({ xp: 3 }).build();
    const hand = game.p1.hand().length;
    await attack(game);
    await game.p1.yes();
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.p1.xp()).toBe(5);
    expect(game.state("gw").might).toBe(6);
    expect(game.state("gw").keywords).toContain("Ganking");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(c) declining the Temple is fine too: no draw, energy kept, Hunt still → 5 XP", async () => {
    const game = await board({ xp: 3 }).build();
    const hand = game.p1.hand().length;
    await attack(game);
    await game.p1.no();
    await game.settle();
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand);
    expect(game.p1.xp()).toBe(5);
  });

  // ---- (d) NO side: D is 4 ---------------------------------------------------------------------------------

  test("(d) 4 vs 4: both take lethal and die; bf1 becomes UNCONTROLLED, nobody conquers, no Hunt, XP stays 1, no points (466.5.b)", async () => {
    const game = await board({ dMight: 4 }).build();
    await game.p1.move("gw", "bf1");
    await game.settle();
    expect(game.zoneOf("gw")).toBe("trash");
    expect(game.zoneOf("dee")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.p1.xp()).toBe(1);
    expect(game.chain()).toEqual([]);
  });

  test("(d) the Sword detaches when its wearer dies and is recalled to P1's base, unattached — its Level line now fails BOTH gates and pumps nothing (719.5, 457.1, 724)", async () => {
    const game = await board({ dMight: 4 }).unit(P1, "base", { might: 2, name: "Bystander" }, "by").build();
    await game.p1.move("gw", "bf1");
    await game.settle();
    expect(game.zoneOf("sword")).toBe("base");
    expect(game.state("sword")).toMatchObject({ controller: P1, owner: P1 });
    expect(game.state("sword").attachedTo).toBeUndefined();
    expect(game.p1.gear()).toContain("sword");
    expect(game.state("by").might).toBe(2);
  });

  test("(d) the would-be +2 from levelling cannot be anticipated: while combat is pending Gustwalker is still exactly 4", async () => {
    const game = await board({ dMight: 4 }).build();
    await game.p1.move("gw", "bf1");
    expect(game.state("gw").might).toBe(4);
    expect(game.state("gw").keywords).not.toContain("Ganking");
  });

  // ---- (e) detach at 3+ XP ---------------------------------------------------------------------------------

  test("(e) P2 Angle-Shots (Gustwalker, Sword) at 3 XP: the Sword detaches → Gustwalker loses the bonus AND the Sword's L3 at once: 3 + 1 (own L3) = 4, keeps Ganking (435.1.d, 724)", async () => {
    const game = await board({ xp: 3 }).active(P2).build();
    expect(game.state("gw").might).toBe(6);
    await game.p2.cast("shot", { targets: ["gw", "sword"] });
    await game.settle();
    expect(game.zoneOf("shot")).toBe("trash");
    expect(game.state("gw")).toMatchObject({ attachments: [], might: 4 });
    expect(game.state("gw").keywords).toContain("Ganking");
    expect(game.state("sword").attachedTo).toBeUndefined();
    expect(game.zoneOf("sword")).toBe("base");
  });

  test("(e) the loose Sword's '[Level 3] +1' applies to nothing while P1 still has 3 XP: Sword itself 0, other P1 units unchanged", async () => {
    const game = await board({ xp: 3 }).active(P2).unit(P1, "base", { might: 2, name: "Bystander" }, "by").build();
    await game.p2.cast("shot", { targets: ["gw", "sword"] });
    await game.settle();
    expect(game.p1.xp()).toBe(3);
    expect(game.state("sword")).toMatchObject({ might: 0, staticMightBonus: 0 });
    expect(game.state("by").might).toBe(2);
    expect(game.state("gw").might).toBe(4);
    expect(game.violations()).toEqual([]);
  });
});
