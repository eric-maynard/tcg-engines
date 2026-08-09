/**
 * Interaction: Hard Bargain (sfd-136-221) with [Repeat] against a two-spell chain —
 *   Void Seeker (ogn-024-298) buried under Discipline (ogn-058-298).
 *
 *   Hard Bargain — Spell · Chaos · 2 · Reaction
 *     "[Repeat] [2] (You may pay the additional cost to repeat this spell's effect.)
 *      Counter a spell unless its controller pays [2]."
 *   Void Seeker — Spell · Fury · 3 + [fury] · Action — "Deal 4 to a unit at a battlefield. Draw 1."
 *   Discipline — Spell · Calm · 2 · Reaction — "Give a unit +2 [Might] this turn. Draw 1."
 *
 * Position: P1's turn. P1 casts Void Seeker at P2's unit X (bf1), keeps priority (337.4 /
 * 338.1.a.5) and stacks Discipline on P1's own Ally. Chain old→new: Void Seeker, Discipline. P2
 * (4 energy) answers with Hard Bargain, optionally paying Repeat [2].
 *
 * Rulings under test:
 *  (a) "Counter a spell" may choose ANY spell on the chain regardless of depth (355.9.a.2); with
 *      Repeat paid both executions' targets are chosen — in a declared order — as Hard Bargain is
 *      played and are public on its chain item (820.2 / 820.3). Hard Bargain resolves first (LIFO,
 *      340.1): exec #1 asks Discipline's controller to pay [2] now or be countered; exec #2 asks
 *      independently for Void Seeker. The ransom is an instructed payment made during resolution
 *      (158.1), not a cost of the saved spell; a countered spell refunds nothing (425.1.c) and does
 *      nothing (425.1.a). Survivors then resolve in LIFO order.
 *  (b) Repeat may aim both executions at the SAME spell (820.2.a): pay [2], then asked again — 4
 *      total to keep it. If exec #1 is declined the spell has left the chain, so exec #2's target is
 *      illegal and that instruction is simply skipped (359.3.e.2 / 359.3.e.7) — no second prompt.
 *  (c) Without Repeat, Hard Bargain may still skip the top item and counter the buried Void Seeker.
 *  (d) With exactly 2 energy P1 saves Void Seeker from exec #1 but cannot pay exec #2 → countered
 *      anyway, and the 2 already paid is not undone.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HARD_BARGAIN = "sfd-136-221";
const VOID_SEEKER = "ogn-024-298";
const DISCIPLINE = "ogn-058-298";

/**
 * P1: Void Seeker (3+fury) + Discipline (2) in hand and `3 + 2 + p1Spare` energy, a 2-Might Ally in
 * base. P2: a 5-Might unit X at its bf1 (survives 4 damage so the damage stays observable), 4 energy,
 * Hard Bargain in hand.
 */
function board(p1Spare = 4) {
  return scenario()
    .resources(P1, { energy: 3 + 2 + p1Spare, power: { fury: 1 } })
    .resources(P2, { energy: 4 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Unit X" }, "x")
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .hand(P1, VOID_SEEKER, "seeker")
    .hand(P1, DISCIPLINE, "discipline")
    .hand(P2, HARD_BARGAIN, "hb");
}

/** P1 casts Void Seeker → X, keeps priority, casts Discipline → Ally, then passes; P2 holds priority. */
async function stackTwoSpells(game: Game): Promise<void> {
  await game.p1.cast("seeker", { targets: "x" });
  expect(game.actingSeat()).toBe(P1); // 337.4 — the caster keeps priority
  await game.p1.cast("discipline", { targets: "ally" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["seeker", "discipline"]);
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
}

/** After Hard Bargain is on the chain: P2 passes, P1 passes → Hard Bargain (top item) starts resolving. */
async function bothPassToResolveBargain(game: Game): Promise<void> {
  await game.p2.passPriority();
  await game.p1.passPriority();
}

function ransomPromptFor(game: Game) {
  const d = game.decision();
  return d?.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "hb" ? d : undefined;
}

describe("Hard Bargain [Repeat] vs a buried spell / the same spell twice", () => {
  test("premise: after both casts P1 has 4 energy and 0 fury left, hand empty; Hard Bargain's target menu offers the BURIED Void Seeker as well as Discipline, singly or as an ordered pair with Repeat (355.9.a.2, 820.2)", async () => {
    const game = await board().build();
    await stackTwoSpells(game);
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 0 } });
    expect(game.p1.hand()).toEqual([]);
    expect(game.p2.can("cast", "hb")).toBe(true);
    const fields = game.p2.option("cast", "hb")?.fields ?? [];
    const targets = fields.find((f) => f.name === "targets");
    expect(targets?.options).toEqual(expect.arrayContaining([["seeker"], ["discipline"], ["discipline", "seeker"], ["seeker", "discipline"]]));
    expect(fields.find((f) => f.arg === "repeat")).toMatchObject({ max: 1, options: [1] });
  });

  // ---------------------------------------------------------------- (a)
  test("(a) Repeat paid, exec #1 → Discipline (top), exec #2 → Void Seeker (buried): legal; costs P2 4; ONE chain item whose ordered targets are public while P1 still holds priority (820.3)", async () => {
    const game = await board().build();
    await stackTwoSpells(game);
    await game.p2.cast("hb", { repeat: 1, targets: ["discipline", "seeker"] });
    expect(game.p2.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["seeker", "discipline", "hb"]);
    expect(game.chain().filter((c) => c.cardId === "hb")).toHaveLength(1);
    expect(game.chain()[2]).toMatchObject({ cardId: "hb", controller: P2, targets: ["discipline", "seeker"] });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1); // P1 sees the declared targets before anything resolves
    expect(game.p1.view().chain[2]?.targets).toEqual(["discipline", "seeker"]);
    expect(game.zoneOf("seeker")).toBe("chain");
    expect(game.zoneOf("discipline")).toBe("chain");
  });

  test("(a) Hard Bargain resolves FIRST (LIFO): P1 is asked twice, pays [2] each time (4→2→0) during Hard Bargain's resolution; both spells survive and then resolve Discipline-then-Void-Seeker: Ally 4 Might, X takes 4, P1 drew 2", async () => {
    const game = await board().build();
    await stackTwoSpells(game);
    await game.p2.cast("hb", { repeat: 1, targets: ["discipline", "seeker"] });
    await bothPassToResolveBargain(game);
    expect(ransomPromptFor(game)).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    expect(game.zoneOf("hb")).not.toBe("trash"); // still resolving
    await game.p1.yes(); // saves Discipline
    expect(game.p1.energy()).toBe(2);
    expect(ransomPromptFor(game)).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    await game.p1.yes(); // saves Void Seeker
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("hb")).toBe("trash");
    expect(game.chain().map((c) => [c.cardId, c.countered])).toEqual([["seeker", false], ["discipline", false]]);
    // Discipline is now the top item again: a fresh priority round, then it resolves before Void Seeker.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    await game.settle();
    expect(game.state("ally").might).toBe(4);
    expect(game.state("x").damage).toBe(4);
    expect(game.zoneOf("x")).toBe("battlefield-bf1");
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.p1.trash().sort()).toEqual(["discipline", "seeker"]);
    expect(game.p2.trash()).toEqual(["hb"]);
    expect(game.violations()).toEqual([]);
  });

  test("(a) the two ransoms are independent — decline #1 (Discipline countered: no +2, no draw), pay #2 (Void Seeker lives: 4 to X, draw 1); P1 ends on 2 energy", async () => {
    const game = await board().build();
    await stackTwoSpells(game);
    await game.p2.cast("hb", { repeat: 1, targets: ["discipline", "seeker"] });
    await bothPassToResolveBargain(game);
    await game.p1.no();
    expect(game.zoneOf("discipline")).toBe("trash"); // countered at once (425.1.a)
    expect(ransomPromptFor(game)).toBeDefined();
    await game.p1.yes();
    expect(game.p1.energy()).toBe(2);
    expect(game.chain().map((c) => c.cardId)).toEqual(["seeker"]);
    await game.settle();
    expect(game.state("ally").might).toBe(2);
    expect(game.state("x").damage).toBe(4);
    expect(game.p1.hand()).toHaveLength(1); // only Void Seeker's draw
    expect(game.p1.energy()).toBe(2);
  });

  test("(a) pay #1, decline #2: Discipline resolves, Void Seeker is countered — and nothing P1 spent to CAST Void Seeker (3 + fury) comes back (425.1.c)", async () => {
    const game = await board().build();
    await stackTwoSpells(game);
    await game.p2.cast("hb", { repeat: 1, targets: ["discipline", "seeker"] });
    await bothPassToResolveBargain(game);
    await game.p1.yes();
    await game.p1.no();
    expect(game.zoneOf("seeker")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["discipline"]);
    await game.settle();
    expect(game.state("x").damage).toBe(0);
    expect(game.state("ally").might).toBe(4);
    expect(game.p1.hand()).toHaveLength(1); // Discipline's draw only
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 0 } }); // 4 − the one ransom; cast costs stay spent
  });

  // ---------------------------------------------------------------- (b)
  test("(b) both executions at the SAME buried Void Seeker is a legal Repeat cast (820.2.a); paying the first ransom does NOT end it — P1 is asked again and needs 4 in total to keep the spell", async () => {
    const game = await board().build();
    await stackTwoSpells(game);
    await game.p2.cast("hb", { repeat: 1, targets: "seeker" });
    expect(game.p2.energy()).toBe(0);
    expect(game.chain()[2]).toMatchObject({ cardId: "hb", targets: ["seeker"] });
    await bothPassToResolveBargain(game);
    expect(ransomPromptFor(game)).toMatchObject({ canAccept: true });
    await game.p1.yes();
    expect(game.p1.energy()).toBe(2);
    expect(game.zoneOf("seeker")).toBe("chain");
    expect(ransomPromptFor(game)).toMatchObject({ canAccept: true }); // asked AGAIN for the same spell
    await game.p1.yes();
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("hb")).toBe("trash");
    expect(game.chain().map((c) => [c.cardId, c.countered])).toEqual([["seeker", false], ["discipline", false]]);
    await game.settle();
    expect(game.state("x").damage).toBe(4);
    expect(game.state("ally").might).toBe(4);
    expect(game.p1.hand()).toHaveLength(2);
  });

  // rule 359.3.e.2 / 359.3.e.7: once exec #1 is declined Void Seeker is countered and leaves the
  // chain, so exec #2 has no legal target and is skipped silently — the very next decision is the
  // priority window on Discipline, with P1 still on 4 energy.
  test("(b) declining exec #1 counters Void Seeker at once and exec #2 does nothing — no second prompt (359.3.e.7)", async () => {
    const game = await board().build();
    await stackTwoSpells(game);
    await game.p2.cast("hb", { repeat: 1, targets: "seeker" });
    await bothPassToResolveBargain(game);
    expect(ransomPromptFor(game)).toBeDefined();
    await game.p1.no();
    expect(game.zoneOf("seeker")).toBe("trash");
    expect(ransomPromptFor(game)).toBeUndefined();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    expect(game.zoneOf("hb")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["discipline"]);
    expect(game.p1.energy()).toBe(4);
  });

  // rule 355.15: Hard Bargain named ONLY Void Seeker (twice); Discipline was never one of its targets
  // and targets are locked at play time, so after P1 refuses every ransom Discipline still resolves
  // (+2 Might, draw 1).
  test("(b) refusing every ransom leaves Void Seeker countered (no damage, no draw), P1 on 4 energy, and the never-targeted Discipline resolving normally (355.15)", async () => {
    const game = await board().build();
    await stackTwoSpells(game);
    await game.p2.cast("hb", { repeat: 1, targets: "seeker" });
    await bothPassToResolveBargain(game);
    for (let i = 0; i < 3 && ransomPromptFor(game); i++) {
      await game.p1.no();
    }
    expect(game.zoneOf("seeker")).toBe("trash");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("hb")).toBe("trash");
    expect(game.state("x").damage).toBe(0);
    expect(game.state("ally").might).toBe(4);
    expect(game.p1.hand()).toHaveLength(1); // Discipline's draw only
    expect(game.p1.energy()).toBe(4); // P1 was never made to pay
  });

  // ---------------------------------------------------------------- (c)
  test("(c) WITHOUT Repeat Hard Bargain may skip the top item and name the buried Void Seeker; declining counters only that spell while Discipline above it is untouched", async () => {
    const game = await board().build();
    await stackTwoSpells(game);
    await game.p2.cast("hb", { targets: "seeker" });
    expect(game.p2.energy()).toBe(2); // plain cost only
    expect(game.chain().map((c) => c.cardId)).toEqual(["seeker", "discipline", "hb"]);
    expect(game.chain()[2]?.targets).toEqual(["seeker"]);
    await bothPassToResolveBargain(game);
    expect(ransomPromptFor(game)).toMatchObject({ canAccept: true });
    await game.p1.no();
    expect(game.zoneOf("seeker")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["discipline"]);
    expect(ransomPromptFor(game)).toBeUndefined(); // one execution only
    await game.settle();
    expect(game.state("x").damage).toBe(0);
    expect(game.state("ally").might).toBe(4);
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.energy()).toBe(4);
  });

  test("(c) …and paying the single ransom for the buried spell saves it: both of P1's spells resolve", async () => {
    const game = await board().build();
    await stackTwoSpells(game);
    await game.p2.cast("hb", { targets: "seeker" });
    await bothPassToResolveBargain(game);
    await game.p1.yes();
    expect(game.p1.energy()).toBe(2);
    expect(ransomPromptFor(game)).toBeUndefined();
    await game.settle();
    expect(game.state("x").damage).toBe(4);
    expect(game.state("ally").might).toBe(4);
    expect(game.p1.hand()).toHaveLength(2);
  });

  // ---------------------------------------------------------------- (d)
  test("(d) P1 has EXACTLY 2 energy vs the double ransom on Void Seeker: pays exec #1 (→0), cannot pay exec #2 → countered anyway; the 2 already paid is gone for nothing (158.1, 425.1.c)", async () => {
    const game = await board(2).build();
    await stackTwoSpells(game);
    expect(game.p1.energy()).toBe(2);
    await game.p2.cast("hb", { repeat: 1, targets: "seeker" });
    await bothPassToResolveBargain(game);
    expect(ransomPromptFor(game)).toMatchObject({ canAccept: true });
    await game.p1.yes();
    expect(game.p1.energy()).toBe(0);
    // Exec #2: either no prompt at all or an unpayable one — never a working "yes".
    const second = ransomPromptFor(game);
    if (second) {
      expect(second.canAccept).toBe(false);
      const forced = await game.p1.try((p) => p.yes());
      if (forced.ok) {
        expect(game.zoneOf("seeker")).toBe("trash"); // a "yes" that cannot be funded must not save it
      } else if (ransomPromptFor(game)) {
        await game.p1.no();
      }
    }
    expect(game.zoneOf("seeker")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["discipline"]);
    await game.settle();
    expect(game.state("x").damage).toBe(0);
    expect(game.p1.energy()).toBe(0); // the instructed payment already made is not undone
    expect(game.p1.power("fury")).toBe(0);
    expect(game.state("ally").might).toBe(4); // Discipline was never targeted
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.zoneOf("hb")).toBe("trash");
  });
});
