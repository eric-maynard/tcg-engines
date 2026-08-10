/**
 * Interaction: LeBlanc, Everywhere at Once (unl-090-219) · Champion Unit · Mind · 4 · 4 Might
 *     "[Backline] (I must be assigned combat damage last.) Your [Temporary] effects at my battlefield
 *      don't trigger."
 *   × Petal Pixie (unl-076-219) · Unit · Mind · 2 · 2 Might
 *     "I have +1 [Might] for each of your units with [Temporary] at my battlefield."
 *   × Black Flame Altar (unl-208-219) · Battlefield
 *     "Units here with [Temporary] have [Shield]. (+1 [Might] while they're defenders.)"
 *   × Sprite token (unl-t07) · 3 Might · [Temporary]
 *   × Shadow's Call (unl-165-219) · Spell · Order · 2 · Action
 *     "Choose a friendly unit WITHOUT [Temporary]. Give it [Temporary]. Draw 2."
 *
 * Rules: 816.1.b / 816.1.c (Temporary = a TRIGGERED ability: "at the start of this permanent's controller's
 * Beginning Phase, before scoring, kill this"), 816.3 (whether a permanent HAS Temporary is a characteristic
 * other effects may check), 722 / 722.1 (text that is not doing anything is still present — keywords stay
 * referenceable), 383.2.c ("at [moment]" conditions are evaluated once, when that moment is processed),
 * 383.3.d (simultaneous same-controller triggers: that player orders them), 814 (Shield: +1 Might while a
 * defender), Backline (assigned combat damage last), 315.2 (Beginning Step precedes the Scoring Step),
 * 466.5.d / 186.1 (a killed token ceases to exist).
 *
 * Question: P1 controls Black Flame Altar (bf1) with LeBlanc, Petal Pixie and two Sprite tokens; Shadow's
 * Call in hand.
 *   (a) Pixie's Might? Do the Sprites get the Altar's Shield when P2 attacks — is a Temporary that "doesn't
 *       trigger" still a Temporary other cards can see?
 *   (b) Start of P1's Beginning Phase: anything on the chain? Sprites die? Hold + score? Pixie afterwards?
 *   (c) Shadow's Call: are the Sprites legal ("without Temporary")? Choosing Pixie: does it count itself,
 *       and does it survive P1's next Beginning Phase?
 *   (d) NO side — P2 kills LeBlanc on P2's turn: what happens at P1's next Beginning Phase?
 *   (e) Does a suppressed trigger fire late if LeBlanc leaves AFTER the start-of-phase moment?
 *
 * Expected: (a) LeBlanc only stops the trigger; the keyword is present → Pixie 2+2 = 4; each Sprite defends
 * at 3+1 = 4; LeBlanc is assigned damage last. (b) nothing on the chain, both Sprites live, P1 holds bf1
 * (+1), Pixie stays 4. (c) Sprites are NOT legal (they have Temporary); LeBlanc/Pixie are. Pixie chosen →
 * Temporary, draw 2, Pixie counts itself → 5, Altar Shield → 6 as a defender; its Temporary is likewise
 * suppressed → survives. (d) LeBlanc gone at that moment → one trigger per Temporary unit on the chain (P1's
 * items, P2 gets a window), all resolve before scoring → Sprites cease to exist; a non-Temporary Pixie drops
 * to 2 and alone holds bf1 (+1); if Pixie was Temporary too, everything dies and there is no hold. (e) No —
 * point-in-time; killing LeBlanc later that turn creates nothing; the Sprites trigger at the NEXT Beginning
 * Phase.
 *
 * Text-state map — Sprite.Temporary: (a)–(c) PRESENT as a characteristic (counted by Pixie, seen by the
 * Altar, seen by Shadow's Call's "without" filter) / trigger SUPPRESSED at bf1; (d) PRESENT / trigger FIRES;
 * (e) PRESENT / not created retroactively. Never removed, never "inactive" in the 721 sense.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const LEBLANC = "unl-090-219";
const PETAL_PIXIE = "unl-076-219";
const BLACK_FLAME_ALTAR = "unl-208-219";
const SPRITE_TOKEN = "unl-t07";
const SHADOWS_CALL = "unl-165-219";

/** Inline 0-cost Action spell "Kill a unit." — the NO-side lever that removes LeBlanc. */
const EXECUTE = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "order",
  energyCost: 0,
  name: "Test Execute",
  rulesText: "Kill a unit.",
  timing: "action",
} as const;

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** Flatten the `targets` field of P1's cast option into the set of card ids offered. */
function targetsOffered(game: Game, alias: string): string[] {
  const opt = game.p1.option("cast", alias);
  const field = opt?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/**
 * Turn 2, P2 to act (about to attack or end the turn). bf1 = Black Flame Altar (live text), controlled by
 * P1 with LeBlanc, Petal Pixie and two Sprite tokens on it. P1 holds Shadow's Call; P2 has a 5-Might
 * attacker in base and a free "Kill a unit" spell (the NO-side lever). P1 also has a copy of the kill spell
 * for (e).
 */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1, def: BLACK_FLAME_ALTAR, inert: false })
    .unit(P1, "bf1", LEBLANC, "lb")
    .unit(P1, "bf1", PETAL_PIXIE, "pixie")
    .unit(P1, "bf1", SPRITE_TOKEN, "s1")
    .unit(P1, "bf1", SPRITE_TOKEN, "s2")
    .unit(P2, "base", { might: 5, name: "Attacker" }, "atk")
    .hand(P1, SHADOWS_CALL, "call")
    .hand(P1, EXECUTE, "p1Exec")
    .hand(P2, EXECUTE, "p2Exec");
}

/** P2 ends the turn → P1's (suppressed) Beginning Phase → P1's main phase; P1 taps 2 and casts Shadow's Call on `target`. */
async function p1CastsShadowsCall(game: Game, target: string): Promise<void> {
  await game.p2.endTurn();
  await game.settle();
  expect(game.turnPlayer()).toBe(P1);
  await game.p1.tapRunes(2);
  await game.p1.cast("call", { targets: target });
  await game.settle();
}

describe("LeBlanc, Everywhere at Once × Petal Pixie × Black Flame Altar — a silenced Temporary is still a Temporary", () => {
  // ── (a) the keyword is present as a characteristic ─────────────────────────────────────────

  test("(a) at rest: both Sprites HAVE Temporary (and so the Altar's static Shield); Petal Pixie counts them → 2 + 2 = 4; Pixie/LeBlanc (no Temporary) get no Shield; nothing on the chain", async () => {
    const game = await board().build();
    for (const s of ["s1", "s2"]) {
      expect(game.state(s).keywords).toEqual(expect.arrayContaining(["Temporary", "Shield"]));
      expect(game.state(s).grantedKeywords).toEqual([{ duration: "static", keyword: "Shield" }]);
      expect(game.state(s).might).toBe(3); // Shield is defender-only Might
    }
    expect(game.state("pixie").might).toBe(4);
    expect(game.state("pixie").keywords).not.toContain("Shield");
    expect(game.state("lb").keywords).toContain("Backline");
    expect(game.state("lb").keywords).not.toContain("Shield");
    expect(game.state("lb").might).toBe(4);
    expect(game.chain()).toEqual([]);
  });

  test("(a) P2 attacks bf1: each Sprite DEFENDS at 3 + 1 (Altar Shield) = 4, Pixie at 4, LeBlanc at 4; the assignment prompt refuses any line that puts damage on LeBlanc before the others have lethal (Backline)", async () => {
    const game = await board().build();
    await game.p2.move("atk", "bf1");
    await game.p2.passFocus();
    await game.p1.passFocus();
    for (const d of ["s1", "s2"]) {
      expect(game.state(d)).toMatchObject({ combatRole: "defender", might: 4 });
    }
    expect(game.state("pixie")).toMatchObject({ combatRole: "defender", might: 4 });
    expect(game.state("lb")).toMatchObject({ combatRole: "defender", might: 4 });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "distribute", seat: P2, total: 5 });
    const buckets = d?.kind === "distribute" ? Object.fromEntries(d.buckets.map((b) => [b.key, b.lethal])) : {};
    expect(buckets).toEqual({ lb: 4, pixie: 4, s1: 4, s2: 4 });
    // Backline: LeBlanc first, or LeBlanc taking the spill-over while a non-Backline defender is unassigned → illegal.
    expect((await game.p2.try((p) => p.distribute({ lb: 4, s1: 1 }))).ok).toBe(false);
    expect((await game.p2.try((p) => p.distribute({ lb: 1, s1: 4 }))).ok).toBe(false);
    // A legal line: lethal on one Sprite, the last point on the other.
    await game.p2.distribute({ s1: 4, s2: 1 });
    await game.settle();
    expect(game.zoneOf("atk")).toBe("trash"); // took 16
    expect(game.zoneOf("s1")).toBe("gone"); // 4 ≥ 4 (shielded) — a dead token ceases to exist
    expect(game.zoneOf("s2")).toBe("battlefield-bf1"); // 1 < 4
    expect(game.state("s2").damage).toBe(0); // healed at end of combat
    expect(game.zoneOf("lb")).toBe("battlefield-bf1");
    expect(game.state("pixie").might).toBe(3); // one Temporary unit left
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  // ── (b) start of P1's Beginning Phase with LeBlanc present ─────────────────────────────────

  test("(b) P2 ends the turn → start of P1's Beginning Phase: NO Temporary item is created for either Sprite (chain empty, no response window), both survive, P1 holds bf1 for +1, Pixie is still 4", async () => {
    const game = await board().build();
    expect(game.p1.points()).toBe(0);
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // straight through to the Action Phase
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.units("bf1").sort()).toEqual(["lb", "pixie", "s1", "s2"]);
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("pixie").might).toBe(4); // the Sprites still HAVE Temporary
    expect(game.state("s1").keywords).toContain("Temporary");
  });

  // ── (c) Shadow's Call ─────────────────────────────────────────────────────────────────────

  test("(c) Shadow's Call's 'friendly unit WITHOUT Temporary' offers exactly LeBlanc and Pixie — neither Sprite (its Temporary is present regardless of LeBlanc); naming a Sprite is rejected", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.settle();
    await game.p1.tapRunes(2);
    expect(game.p1.can("cast", "call")).toBe(true);
    expect(targetsOffered(game, "call").sort()).toEqual(["lb", "pixie"]);
    await expect(game.p1.cast("call", { targets: "s1" })).rejects.toThrow();
    expect(game.zoneOf("call")).toBe("hand");
  });

  test("(c) choosing Pixie: Pixie gains Temporary, P1 draws 2; Pixie has no 'other' so it now counts ITSELF → 2 + 3 = 5, and being Temporary on the Altar it also shows Shield", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.settle();
    const hand0 = game.p1.hand().length;
    await game.p1.tapRunes(2);
    await game.p1.cast("call", { targets: "pixie" });
    await game.settle();
    expect(game.zoneOf("call")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 2);
    expect(game.state("pixie").keywords).toEqual(expect.arrayContaining(["Temporary", "Shield"]));
    expect(game.state("pixie").might).toBe(5);
    expect(game.state("s1").might).toBe(3); // Sprites don't count anything
  });

  test("(c) …and Pixie DEFENDS at 6 (5 + Altar Shield) when P2 attacks on the following turn", async () => {
    const game = await board().build();
    await p1CastsShadowsCall(game, "pixie");
    await game.advanceTurn(); // → P2
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.move("atk", "bf1");
    expect(game.state("pixie")).toMatchObject({ combatRole: "defender", might: 6 });
    expect(game.state("s1")).toMatchObject({ combatRole: "defender", might: 4 });
    expect(game.state("lb")).toMatchObject({ combatRole: "defender", might: 4 });
  });

  test("(c) Pixie's granted Temporary is also 'your Temporary effect at my battlefield': at P1's NEXT Beginning Phase nothing goes on the chain, Pixie and both Sprites survive, P1 holds again (2 points), Pixie still 5", async () => {
    const game = await board().build();
    await p1CastsShadowsCall(game, "pixie");
    expect(game.p1.points()).toBe(1);
    await game.advanceTurn(); // → P2
    await game.p2.endTurn(); // → P1's next Beginning Phase
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.units("bf1").sort()).toEqual(["lb", "pixie", "s1", "s2"]);
    expect(game.p1.points()).toBe(2);
    expect(game.state("pixie").might).toBe(5);
    expect(game.state("pixie").keywords).toContain("Temporary"); // given "permanently", not "this turn"
  });

  // ── (d) NO side: LeBlanc is gone when the moment arrives ─────────────────────────────────

  test("(d) P2 kills LeBlanc on P2's turn → at the start of P1's Beginning Phase each Sprite puts a Temporary trigger on the chain (P1's items); P1 holds priority first, and after P1 passes P2 gets a response window; nothing has died yet", async () => {
    const game = await board().build();
    await game.p2.cast("p2Exec", { targets: "lb" });
    await game.settle();
    expect(game.zoneOf("lb")).toBe("trash");
    expect(game.state("pixie").might).toBe(4); // Sprites still Temporary, still counted
    await game.p2.endTurn();
    await game.acceptTriggerOrder();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    const items = game.chain();
    expect(items.map((c) => c.cardId).sort()).toEqual(["s1", "s2"]);
    expect(items.every((c) => c.triggered && c.controller === P1)).toBe(true);
    expect(game.zoneOf("s1")).toBe("battlefield-bf1");
    expect(game.zoneOf("s2")).toBe("battlefield-bf1");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // P2's Reaction window
    expect(game.p1.points()).toBe(0); // scoring has not happened yet
  });

  test("(d) …all resolve before scoring: both Sprite tokens are killed and cease to exist (186.1); Pixie (not Temporary) survives, drops to 2, alone still holds bf1 → +1", async () => {
    const game = await board().build();
    await game.p2.cast("p2Exec", { targets: "lb" });
    await game.settle();
    await game.p2.endTurn();
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.has("s1")).toBe(false);
    expect(game.has("s2")).toBe(false);
    expect(game.zoneOf("s1")).toBe("gone");
    expect(game.zoneOf("s2")).toBe("gone");
    expect(game.p1.units("bf1")).toEqual(["pixie"]);
    expect(game.state("pixie").might).toBe(2);
    expect(game.state("pixie").keywords).not.toContain("Shield");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("(d) variant — Pixie was given Temporary (Shadow's Call) and THEN LeBlanc is killed on P2's turn: at P1's next Beginning Phase three items (pixie, s1, s2) go on the chain; all die; bf1 is left with nothing of P1's → uncontrolled, no hold point", async () => {
    const game = await board().build();
    await p1CastsShadowsCall(game, "pixie");
    expect(game.p1.points()).toBe(1);
    await game.advanceTurn(); // → P2
    await game.p2.cast("p2Exec", { targets: "lb" });
    await game.settle();
    expect(game.zoneOf("lb")).toBe("trash");
    await game.p2.endTurn();
    await game.acceptTriggerOrder();
    expect(game.phase()).toBe("beginning");
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["pixie", "s1", "s2"]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("pixie")).toBe("trash"); // a real card goes to the trash …
    expect(game.zoneOf("s1")).toBe("gone"); // … tokens cease to exist
    expect(game.zoneOf("s2")).toBe("gone");
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(null);
    expect(game.p1.points()).toBe(1); // nothing held this time
  });

  // rule 383.3.d — pixie, s1 and s2 trigger simultaneously under one controller, so P1 is offered the order
  // in which to put them on the chain: a soft `order` decision listing the three items. rule 816.1 — each
  // [Temporary] item kills its OWN source, so they are not interchangeable copies (the source-bound
  // `IMPLICIT_SELF_EFFECTS` signature in `abilities/trigger-finalization.ts`).
  test("(d) three simultaneous Temporary triggers of one controller → P1 is offered their order on the chain (383.3.d)", async () => {
    const game = await board().build();
    await p1CastsShadowsCall(game, "pixie");
    await game.advanceTurn();
    await game.p2.cast("p2Exec", { targets: "lb" });
    await game.settle();
    await game.p2.endTurn();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "order", seat: P1 });
    const items = d?.kind === "order" ? d.items.map((i) => i.card ?? i.key).sort() : [];
    expect(items).toEqual(["pixie", "s1", "s2"]);
  });

  // ── (e) point-in-time: no late trigger ────────────────────────────────────────────────────

  test("(e) LeBlanc leaves bf1 AFTER the start-of-Beginning-Phase moment (P1 kills her in P1's own main phase): no Temporary item is created then or for the rest of the turn, the Sprites survive P2's turn, and only trigger (and die) at P1's NEXT Beginning Phase (383.2.c)", async () => {
    const game = await board().build();
    await game.p2.endTurn(); // suppressed moment passes
    await game.settle();
    expect(game.p1.points()).toBe(1);
    await game.p1.cast("p1Exec", { targets: "lb" });
    await game.settle();
    expect(game.zoneOf("lb")).toBe("trash");
    expect(game.chain()).toEqual([]); // nothing retroactive
    expect(game.p1.units("bf1").sort()).toEqual(["pixie", "s1", "s2"]);
    expect(game.state("pixie").might).toBe(4);
    await game.advanceTurn(); // → P2's turn: still nothing
    expect(game.turnPlayer()).toBe(P2);
    expect(game.chain()).toEqual([]);
    expect(game.p1.units("bf1").sort()).toEqual(["pixie", "s1", "s2"]);
    await game.p2.endTurn(); // → P1's NEXT Beginning Phase: evaluated fresh, LeBlanc absent → fires
    await game.acceptTriggerOrder();
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["s1", "s2"]);
    await game.settle();
    expect(game.zoneOf("s1")).toBe("gone");
    expect(game.zoneOf("s2")).toBe("gone");
    expect(game.p1.units("bf1")).toEqual(["pixie"]);
    expect(game.state("pixie").might).toBe(2);
    expect(game.p1.points()).toBe(2); // Pixie alone still held bf1
  });
});
