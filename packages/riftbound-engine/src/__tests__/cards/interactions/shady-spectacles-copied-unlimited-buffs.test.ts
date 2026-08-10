/**
 * Interaction: Shady Spectacles (ven-137-166) · Equipment · "[Equip] [1][order] … As this is attached to
 *     a unit, choose another friendly unit. The equipped unit becomes a copy of that unit for as long as
 *     this is attached to it."
 *   × Lee Sin, Ascetic (ogn-078-298) · 5 Might · "[Shield] / [Exhaust]: Buff me. / I can have any number
 *     of buffs."
 *   × Wizened Elder (ogn-065-298) · 4 Might · "While I'm buffed, I have an additional +1 [Might]."
 *   (+ Detonate sfd-005-221 "Kill a gear. Its controller draws 2." to end the copy, and Blind Monk
 *    ogn-257-298 "[1],[Exhaust]: Buff a friendly unit." for the later buff attempt.)
 *
 * Question: P1 equips the Spectacles to Wizened Elder choosing Lee Sin, Ascetic → the Elder is a copy of
 * Lee Sin while attached. Over three turns P1 exhausts the Elder-copy three times (3 Buff counters). Then
 * P2 kills the Spectacles. (a) Might of the copy with 3 counters? (b) After detach: does the reverted Elder
 * keep 3 counters — and what is its Might? (c) Can a later "Buff a friendly unit" add a 4th? (d) Mirror:
 * Spectacles on Lee Sin #1 copying Lee Sin #2 — any difference before/after detach?
 *
 * Rules: 477.1.b.1 (copy = copyable traits incl. rules text), 426.1.b.2 (permission to hold several
 * buffs), 426.1.b.1 / 702.3.a (no permission → a further counter is simply not PLACED), 426.1.c (still a
 * legal choice, just not buffed), 703 (each buff = +1), 705 (buffs are removed only on leaving play).
 *
 * Expected: (a) 5 printed (Lee Sin) + 3 = 8. (b) Keeps all 3: 4 + 3 + 1 (own static back, it is buffed)
 * = 8. (c) No 4th counter: stays at 3 / 8 Might. (d) No difference: 5+3 = 8 while copied, 8 after detach,
 * and a 4th buff DOES land (own printed permission) → 9.
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPECTACLES = "ven-137-166";
const LEE_SIN = "ogn-078-298";
const WIZENED_ELDER = "ogn-065-298";
const DETONATE = "sfd-005-221";
const BLIND_MONK = "ogn-257-298";

/** Buff counters on a unit: the first buff is the `buffed` flag, further ones are `extraBuffs` (703). */
function buffs(game: Game, id: string): number {
  const s = game.state(id);
  return (s.isBuffed ? 1 : 0) + ((s.meta.extraBuffs as number | undefined) ?? 0);
}

/** Activate [Equip] onto `holder`, resolve it, and answer the "choose another friendly unit" ask with `model` if asked. */
async function equip(game: Game, holder: string, model: string): Promise<void> {
  await game.p1.choose("equipCard:-", { params: { equipmentId: "specs", unitId: holder } });
  for (let i = 0; i < 6; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect((d as PickDecision).options.map((o) => o.card ?? o.key)).toContain(model);
      await game.p1.pick(model);
      continue;
    }
    if (r.reason !== "unanswered") {
      break;
    }
  }
  expect(game.state("specs").attachedTo).toBe(holder);
}

/** P1: Blind Monk legend, Lee Sin + Wizened Elder in base, Spectacles in base, [1][order] for the Equip. P2 holds Detonate. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { order: 1 } })
    .legend(P1, BLIND_MONK, "monk")
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", LEE_SIN, "lee")
    .unit(P1, "base", WIZENED_ELDER, "elder")
    .unit(P2, "base", { might: 3, name: "Foe" }, "foe")
    .gear(P1, SPECTACLES, "specs")
    .hand(P2, DETONATE, "det");
}

/** Exhaust `holder` (now a Lee Sin copy) for "Buff me" on three consecutive P1 turns; ends on P1's turn. */
async function buffThrice(game: Game, holder: string): Promise<void> {
  for (let n = 1; n <= 3; n++) {
    if (n > 1) {
      await game.advanceToTurnOf(P2);
      await game.advanceToTurnOf(P1);
    }
    expect(game.state(holder).isReady).toBe(true);
    await game.p1.activate(holder);
    await game.settle();
    expect(buffs(game, holder)).toBe(n);
  }
}

/** P2's turn: Detonate the Spectacles (ends "for as long as this is attached"). Ends on P2's turn. */
async function detonateSpecs(game: Game): Promise<void> {
  await game.advanceToTurnOf(P2);
  await game.p2.do("addResources", { energy: 1, power: { fury: 1 } });
  await game.p2.cast("det", { targets: "specs" });
  await game.settle();
  expect(game.zoneOf("specs")).toBe("trash");
}

describe("Shady Spectacles copy of Lee Sin, Ascetic on Wizened Elder — unlimited buffs during and after the copy", () => {
  test("setup: equipping the Elder and choosing Lee Sin makes it a 5-Might 'Lee Sin, Ascetic' with his [Exhaust] ability; 0 counters", async () => {
    const game = await board().build();
    expect(game.state("elder")).toMatchObject({ baseMight: 4, might: 4, name: "Wizened Elder" });
    expect(game.p1.can("activate", "elder")).toBe(false); // the printed Elder has no activated ability
    await equip(game, "elder", "lee");
    expect(game.state("elder")).toMatchObject({ baseMight: 5, isBuffed: false, might: 5, name: "Lee Sin, Ascetic" });
    expect(buffs(game, "elder")).toBe(0);
    expect(game.p1.can("activate", "elder")).toBe(true);
    expect(game.state("lee")).toMatchObject({ might: 5, name: "Lee Sin, Ascetic" }); // model untouched
  });

  test("(a) while copied, three activations over three turns place 0→1→2→3 counters (permission from the COPIED text, 426.1.b.2) and it is 5 + 3 = 8", async () => {
    const game = await board().build();
    await equip(game, "elder", "lee");
    await buffThrice(game, "elder");
    expect(buffs(game, "elder")).toBe(3);
    expect(game.state("elder")).toMatchObject({ baseMight: 5, might: 8, name: "Lee Sin, Ascetic" });
    expect(game.violations()).toEqual([]);
  });

  test("(b) Detonate kills the Spectacles: the copy ends, the Elder is its printed self again — and KEEPS all 3 counters (705: only leaving play removes buffs)", async () => {
    const game = await board().build();
    await equip(game, "elder", "lee");
    await buffThrice(game, "elder");
    const handBefore = game.p1.hand().length;
    await detonateSpecs(game);
    expect(game.p1.trash()).toContain("specs");
    expect(game.p1.hand()).toHaveLength(handBefore + 2); // "its controller draws 2" — P1 controlled the Spectacles
    expect(game.state("elder")).toMatchObject({ attachments: [], baseMight: 4, name: "Wizened Elder" });
    expect(game.zoneOf("elder")).toBe("base");
    expect(buffs(game, "elder")).toBe(3);
    expect(game.state("elder").isBuffed).toBe(true);
  });

  test("(b) reverted Elder's Might: 4 printed + 3 buffs (703) + 1 (its own 'while I'm buffed' static is back) = 8", async () => {
    const game = await board().build();
    await equip(game, "elder", "lee");
    await buffThrice(game, "elder");
    await detonateSpecs(game);
    expect(game.state("elder").might).toBe(8);
  });

  test("(c) a later 'Buff a friendly unit' (Blind Monk) may CHOOSE the reverted Elder but places no 4th counter (426.1.b.1 / 426.1.c): still 3 counters, still 8", async () => {
    const game = await board().build();
    await equip(game, "elder", "lee");
    await buffThrice(game, "elder");
    await detonateSpecs(game);
    await game.advanceToTurnOf(P1);
    expect(game.p1.can("activate", "elder")).toBe(false); // no longer has Lee Sin's [Exhaust] ability
    await game.p1.do("addResources", { energy: 1 });
    await game.p1.activate("monk", 0, { targets: "elder" });
    expect(game.state("monk").isExhausted).toBe(true); // cost paid — the choice was legal
    await game.settle();
    expect(buffs(game, "elder")).toBe(3);
    expect(game.state("elder").might).toBe(8);
  });

  test("(c) control: the same Blind Monk buff on the never-buffed real Lee Sin does place a counter (5 → 6)", async () => {
    const game = await board().build();
    await equip(game, "elder", "lee");
    await buffThrice(game, "elder");
    await detonateSpecs(game);
    await game.advanceToTurnOf(P1);
    await game.p1.do("addResources", { energy: 1 });
    await game.p1.activate("monk", 0, { targets: "lee" });
    await game.settle();
    expect(buffs(game, "lee")).toBe(1);
    expect(game.state("lee").might).toBe(6);
  });

  // ---- (d) mirror: Lee Sin #1 wearing the Spectacles, copying Lee Sin #2 ------------------------------

  test("(d) Lee Sin #1 copying Lee Sin #2: 3 activations → 3 counters, 8 Might; after the Spectacles die still 3 counters / 8 Might; a 4th buff next turn DOES land (own printed permission) → 4 counters, 9 Might", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { order: 1 } })
      .legend(P1, BLIND_MONK, "monk")
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", LEE_SIN, "lee1")
      .unit(P1, "base", LEE_SIN, "lee2")
      .unit(P2, "base", { might: 3, name: "Foe" }, "foe")
      .gear(P1, SPECTACLES, "specs")
      .hand(P2, DETONATE, "det")
      .build();
    await equip(game, "lee1", "lee2");
    expect(game.state("lee1")).toMatchObject({ baseMight: 5, might: 5, name: "Lee Sin, Ascetic" });
    await buffThrice(game, "lee1");
    expect(game.state("lee1").might).toBe(8);
    await detonateSpecs(game);
    expect(game.state("lee1")).toMatchObject({ attachments: [], baseMight: 5, name: "Lee Sin, Ascetic" });
    expect(buffs(game, "lee1")).toBe(3);
    expect(game.state("lee1").might).toBe(8);
    // Next P1 turn: his own printed "[Exhaust]: Buff me" + "any number of buffs" → a 4th counter.
    await game.advanceToTurnOf(P1);
    await game.p1.activate("lee1");
    await game.settle();
    expect(buffs(game, "lee1")).toBe(4);
    expect(game.state("lee1").might).toBe(9);
    expect(buffs(game, "lee2")).toBe(0); // the model was never the one buffed
    expect(game.violations()).toEqual([]);
  });
});
