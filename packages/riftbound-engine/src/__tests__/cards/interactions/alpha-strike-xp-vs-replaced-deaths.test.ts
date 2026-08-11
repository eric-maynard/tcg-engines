/**
 * Interaction: Alpha Strike (unl-192-219) · Spell · Calm/Body · 3 + [rainbow] · [Action]
 *     "Choose a friendly unit. It deals damage equal to its Might split among enemy units at
 *      battlefields. Then for each unit this kills, do this: Gain 1 XP."
 *   × The Boss (ogn-269-298) · Legend (Sett)
 *     "If a buffed unit you control would die, you may pay [rainbow], exhaust me, and spend its
 *      buff to heal it, exhaust it, and recall it instead."
 *   × Zhonya's Hourglass (ogn-077-298) · Gear · Calm · 2
 *     "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *
 * Question. P1's turn. P1's 6-Might source S is at bf1. P2 has at bf1 a buffed vanilla B (printed 1
 * + buff = 2 Might) and vanillas C (2) and D (2); P2's legend is The Boss (ready, [rainbow] in pool)
 * and P2 has one face-up Hourglass in base. P1 casts Alpha Strike splitting 2/2/2 across B, C, D.
 * NO unit dies while Alpha Strike is resolving — so when is "for each unit this kills" evaluated,
 * during resolution (answer: 0) or at the Cleanup that actually performs the kills? And how much XP
 * does P1 gain when (a) B is saved and one of C/D is replaced, versus (b) nothing is saved?
 *
 * Rules: 355.14.a/.c (each recipient of a split is a target chosen when Alpha Strike is finalized),
 * 355.14.e (the amounts are decided only at resolution), 417.1.b/.c/.d (the split is ONE Deal that
 * marks all three at once), 321 / 321.1 (no death check runs during a resolution), 319.5 / 323.5 (a
 * Cleanup runs after the item leaves the chain and is where lethal-damaged units are killed),
 * 428.5.c/.c.1/.d (those kills are attributed to Alpha Strike and its ability), 387.1 / 387.1.a /
 * 319.3 ("do this:" is a Reflexive Trigger — one chain item per kill, added in that Cleanup),
 * 320 / 320.1 (nothing resolves during a Cleanup), 370.1.a.1 (a replaced death means the kill action
 * never occurred), 370.1.a.2 (deaths from one game action are simultaneous), 372 / 373 (the
 * replacement's controller picks which of the simultaneous deaths it applies to), 702.2.b (spending
 * a buff), 355.14.h/.h.1 (more targets than damage).
 *
 * Expected: the reflexive trigger's kill set is settled in the Cleanup, never "units carrying lethal
 * marks at the end of resolution". (a) B saved by The Boss + one of C/D replaced by the Hourglass ⇒
 * exactly ONE real kill ⇒ 1 XP (not 3). (b) nothing saved ⇒ 3 kills ⇒ 3 XP.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ALPHA_STRIKE = "unl-192-219";
const THE_BOSS = "ogn-269-298";
const ZHONYAS = "ogn-077-298";

/**
 * P1's turn. P1's 6-Might source S and P2's B (printed 1, buffed ⇒ 2), C (2), D (2) all at bf1.
 * P2 always has [rainbow] pooled; `boss` adds The Boss as P2's legend, `zh` a face-up Hourglass.
 */
function board(opts: { boss?: boolean; zh?: boolean } = {}) {
  const b = scenario()
    .resources(P1, { energy: 6, power: { rainbow: 2 } })
    .resources(P2, { power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "bf1", { might: 6, name: "Source" }, "S")
    .unit(P2, "bf1", { might: 1, name: "B" }, "B", { buffed: true })
    .unit(P2, "bf1", { might: 2, name: "C" }, "C")
    .unit(P2, "bf1", { might: 2, name: "D" }, "D")
    .hand(P1, ALPHA_STRIKE, "alpha")
    .xp(P1, 0);
  if (opts.boss) {
    b.legend(P2, THE_BOSS, "boss");
  }
  if (opts.zh) {
    b.gear(P2, ZHONYAS, "zh");
  }
  return b;
}

/** Cast Alpha Strike on S with B, C, D as the split targets, then split 2/2/2. Stops at the next prompt. */
async function strike(game: Game): Promise<void> {
  await game.p1.cast("alpha", { targets: ["S", "B", "C", "D"] });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "alpha", controller: P1 })]);
  await game.settle();
  expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1, total: 6 });
  await game.p1.distribute({ B: 2, C: 2, D: 2 });
}

/** The card ids a pick Decision is currently offering. */
function offered(game: Game): string[] {
  const d = game.decision();
  return d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// timing: nothing dies during the resolution; the kills and the reflexive triggers are the Cleanup
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("when 'for each unit this kills' is evaluated", () => {
  test("355.14.a/.c — the three recipients are TARGETS chosen as Alpha Strike is finalized: the enumerated sets are subsets of {B, C, D} alongside the source, and the amounts are not asked until resolution (355.14.e)", async () => {
    const game = await board().build();
    const field = game.p1.option("cast", "alpha")?.fields.find((f) => f.name === "targets");
    const sets = (field?.options ?? []) as string[][];
    expect(sets).toContainEqual(["S", "B", "C", "D"]);
    for (const s of sets) {
      expect(s[0]).toBe("S"); // the friendly source leads every set
      expect(s.slice(1).every((id) => ["B", "C", "D"].includes(id))).toBe(true);
      expect(s.length).toBeLessThanOrEqual(4); // ≤ the 6 damage available (355.14.c)
    }
    await game.p1.cast("alpha", { targets: ["S", "B", "C", "D"] });
    expect(game.chain()[0]).toMatchObject({ targets: ["S", "B", "C", "D"] });
    expect(game.decision()?.kind).toBe("action"); // priority, not the split amounts
  });

  test("321 / 319.5 / 387.1.a — at the end of Alpha Strike's resolution NOTHING has died and NO XP has been gained; the kills happen in the Cleanup after it leaves the chain, and add ONE reflexive chain item per kill", async () => {
    const game = await board().build();
    await strike(game);

    // Alpha Strike is off the chain; the Cleanup has killed all three and queued three separate
    // reflexive triggers (387.1.a), none of which has resolved yet (320.1).
    expect(game.zoneOf("alpha")).toBe("trash");
    expect(game.p1.xp()).toBe(0);
    const chain = game.chain();
    expect(chain).toHaveLength(3);
    expect(chain.every((c) => c.triggered && c.controller === P1)).toBe(true);
    expect(chain.map((c) => c.cardId).sort()).toEqual(["B", "C", "D"]);

    await game.settle();
    expect(game.p1.xp()).toBe(3);
  });

  test("417.1.b/.c/.d + 370.1.a.2 — the split is one Deal marking all three at once, so the deaths are simultaneous: the Hourglass is asked which of the still-dying units it applies to while all three are still at bf1 and the chain is already empty", async () => {
    const game = await board({ zh: true }).build();
    await strike(game);
    await game.settle();

    expect(game.chain()).toEqual([]); // Alpha Strike already left
    expect(game.zoneOf("alpha")).toBe("trash");
    expect(game.p1.xp()).toBe(0); // 320.1 — nothing resolves during a Cleanup
    expect([game.zoneOf("B"), game.zoneOf("C"), game.zoneOf("D")]).toEqual([
      "battlefield-bf1",
      "battlefield-bf1",
      "battlefield-bf1",
    ]);
    expect([game.state("B").damage, game.state("C").damage, game.state("D").damage]).toEqual([2, 2, 2]);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2, timing: "RPL" });
    expect(offered(game).sort()).toEqual(["B", "C", "D"]); // 373 — one replacement, three deaths
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// (b) nothing is saved — the control
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("(b) The Boss declined, no Hourglass: three real kills", () => {
  test("all three die in the single Cleanup and P1 gains exactly 3 XP, one reflexive resolution per kill", async () => {
    const game = await board({ boss: true }).build();
    await strike(game);
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    await game.p2.no(); // decline The Boss
    await game.settle();

    expect([game.zoneOf("B"), game.zoneOf("C"), game.zoneOf("D")]).toEqual(["trash", "trash", "trash"]);
    expect(game.p1.xp()).toBe(3);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 2 } }); // nothing paid
    expect(game.state("boss").isExhausted).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// (a) The Boss saves B, the Hourglass replaces one of C / D
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("(a) one save each: The Boss on B, the Hourglass on C", () => {
  test("The Boss is an optional COSTED die replacement offered to P2 in the Cleanup: accepting pays [rainbow], exhausts the legend and spends B's buff (702.2.b) — B ends unbuffed at 1 Might, healed, exhausted, in base", async () => {
    const game = await board({ boss: true }).build();
    await strike(game);
    await game.settle();

    const d = game.decision();
    expect(d).toMatchObject({ canAccept: true, kind: "yes-no", seat: P2 });
    expect(d?.prompt ?? "").toMatch(/Boss/);
    await game.p2.yes();
    await game.settle();

    expect(game.zoneOf("B")).toBe("base");
    expect(game.state("B")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true, might: 1 });
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect([game.zoneOf("C"), game.zoneOf("D")]).toEqual(["trash", "trash"]);
  });

  test(
    "a death The Boss replaced does not count as a kill — 370.1.a.1 says the replaced kill action never occurred, so with B saved only C and D are killed and P1 must gain exactly 2 XP",
    async () => {
      const game = await board({ boss: true }).build();
      await strike(game);
      await game.settle();
      await game.p2.yes(); // The Boss saves B
      await game.settle();

      // Expected: 2 (C and D). Actual: 3 — the reflexive trigger is fed the units that carried
      // lethal marks, so the saved B is counted even though it never died.
      expect(game.zoneOf("B")).toBe("base");
      expect(game.p1.xp()).toBe(2);
    },
  );

  test(
    "when the Hourglass replaces ONE of the three deaths, the other two units really are killed by Alpha Strike (428.5.c), so P1 gains exactly 2 XP",
    async () => {
      const game = await board({ zh: true }).build();
      await strike(game);
      await game.settle();
      await game.p2.pick("C"); // the Hourglass takes C's death
      await game.settle();

      // Expected: 2 (B and D). Actual: 0 — the replacement wipes the kill ledger the reflexive
      // trigger reads, so every kill in that Cleanup is forgotten.
      expect(game.zoneOf("C")).toBe("base");
      expect(game.state("C")).toMatchObject({ damage: 0, isExhausted: true });
      expect(game.zoneOf("zh")).toBe("trash"); // "kill this instead"
      expect([game.zoneOf("B"), game.zoneOf("D")]).toEqual(["trash", "trash"]);
      expect(game.p1.xp()).toBe(2);
    },
  );

  test("both replacements available: P2 orders them for B's death, takes The Boss on B, and the Hourglass then applies to one of the two REMAINING simultaneous deaths (372 / 373)", async () => {
    const game = await board({ boss: true, zh: true }).build();
    await strike(game);
    await game.settle();

    // 373 — both replacements apply to B's death; its controller orders them.
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2, timing: "RPL" });
    expect(offered(game).sort()).toEqual(["boss", "zh"]);
    await game.p2.pick("boss");
    await game.settle();

    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    await game.p2.yes(); // The Boss takes B's death
    await game.settle();

    // B is no longer dying, so the Hourglass is offered only C and D.
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2, timing: "RPL" });
    expect(offered(game).sort()).toEqual(["C", "D"]);
    await game.p2.pick("C");
    await game.settle();

    expect(game.zoneOf("B")).toBe("base");
    expect(game.state("B")).toMatchObject({ isBuffed: false, might: 1 });
    expect(game.zoneOf("C")).toBe("base");
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("D")).toBe("trash"); // the only unit actually killed
    expect(game.violations()).toEqual([]);
  });

  test(
    "with B saved by The Boss and C replaced by the Hourglass, D is the ONLY unit Alpha Strike actually killed, so P1 must gain exactly 1 XP — not 0 and certainly not 3",
    async () => {
      const game = await board({ boss: true, zh: true }).build();
      await strike(game);
      await game.settle();
      await game.p2.pick("boss");
      await game.settle();
      await game.p2.yes();
      await game.settle();
      await game.p2.pick("C");
      await game.settle();

      // Expected: 1 (D alone). Actual: 0 — see the two BUGs above; a replaced death both fails to
      // be excluded (The Boss) and wipes the ledger (the Hourglass).
      expect(game.zoneOf("D")).toBe("trash");
      expect(game.p1.xp()).toBe(1);
    },
  );
});
