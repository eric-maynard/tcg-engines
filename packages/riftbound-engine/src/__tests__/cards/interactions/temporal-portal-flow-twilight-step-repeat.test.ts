/**
 * Interaction: Temporal Portal (sfd-078-221) · Gear · Mind · 3
 *     "[rainbow], [Exhaust]: Give the next spell you play this turn [Repeat] equal to its cost."
 *   × Twilight Step (ven-105-166) · Spell · Chaos · 2 + [chaos]
 *     "Move a unit with 3 [Might] or less. [Flow] [4][chaos] (You may play this from your trash for its Flow
 *      cost. Then banish it.)"
 *   (+ Ravenbloom Student ogn-103-298 "When you play a spell, give me +1 [Might] this turn" as the
 *    'one spell played' probe, and En Garde ogn-046-298 as P2's +Might response.)
 *
 * Question: P1's turn, Open state. P1 activates Temporal Portal; the next spell P1 plays is Twilight Step from
 * the TRASH via Flow. (a) Does the grant attach to a spell played from trash? (b) Repeat cost = printed 2+[chaos]
 * or the Flow 4+[chaos]; exact total with Repeat? (c) With Repeat: how many units/destinations, chosen when; may
 * the two executions pick different ≤3-Might units and destinations; what if one is buffed to 4 in response?
 * (d) Where does the Flowed, Repeated Twilight Step go, and is it one spell played or two? (e) Contrast: cast
 * from HAND; and: Repeat declined on the Flow cast — is the grant still consumed?
 *
 * Rules: 206 ("its cost" = printed cost → Repeat [2][chaos]); 356.1.a / 829.1.c.1 (Flow cost REPLACES the base
 * cost); 356.2.b.1 / 820.1.d (Repeat is an optional ADDITIONAL cost on top); 829.1.b.2 / 419.1 (Flow only changes
 * the zone played from — it is still "a spell you play"); 355.1.a / 355.4 / 355.4.a / 820.2 / 820.2.a (Repeat
 * elected and every execution's target + destination chosen in Make Choices, independently); 359.3.e.2 (a target
 * that no longer meets "3 [Might] or less" at resolution is illegal — that execution's move is skipped);
 * 820.1.d.1 / 820.3.a (played ONCE, executed twice); 829.1.b.1 (Flowed → banished as it leaves the chain).
 *
 * Expected: (a) yes. (b) Flow 4+[chaos] + Repeat 2+[chaos] = 6 energy + 2 chaos; without Repeat 4 + 1 chaos.
 * (c) two targets + two destinations at play time, freely different (A bf1→bf2, E bf2→its base); E buffed to 4
 * in response ⇒ E's move skipped, A still moves. (d) one card played once (one Student trigger, cardsPlayed 1);
 * banished. (e) from hand: 2+[chaos] (+2+[chaos] Repeat = 4 + 2 chaos), same choices, goes to TRASH (Flow-able
 * later); a Flow cast without Repeat still consumes the grant — a later spell gets no Repeat.
 *
 * Harness note: the Portal's [rainbow] pip is paid out of whatever power is in the pool — P1 holds only chaos here
 * (3 = Portal + Twilight Step + Repeat), so every figure is exact.
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TEMPORAL_PORTAL = "sfd-078-221";
const TWILIGHT_STEP = "ven-105-166";
const RAVENBLOOM_STUDENT = "ogn-103-298";
const EN_GARDE = "ogn-046-298";

/**
 * P1's turn. bf1 (P1): Ally A (2) + Big B (5). bf2 (P2): Enemy E (3) + Giant G (6). P1's base: Ravenbloom
 * Student (2) and a ready Temporal Portal. Twilight Step ×2: one in P1's TRASH (Flow) and one in HAND.
 * P1: 8 energy + 3 chaos. P2: 1 energy + 1 calm and En Garde in hand.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { chaos: 3 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .gear(P1, TEMPORAL_PORTAL, "portal")
    .unit(P1, "bf1", { might: 2, name: "Ally A" }, "a")
    .unit(P1, "bf1", { might: 5, name: "Big B" }, "b")
    .unit(P2, "bf2", { might: 3, name: "Enemy E" }, "e")
    .unit(P2, "bf2", { might: 6, name: "Giant G" }, "g")
    .unit(P1, "base", RAVENBLOOM_STUDENT, "student")
    .trash(P1, TWILIGHT_STEP, "tsFlow")
    .hand(P1, TWILIGHT_STEP, "tsHand")
    .hand(P2, EN_GARDE, "enGarde");
}

function castField(game: Game, alias: string, name: "targets" | "repeatCount" | "viaFlow") {
  return game.p1.option("cast", alias)?.fields.find((f) => f.name === name);
}

function repeatOptions(game: Game, alias: string): number[] {
  return ((castField(game, alias, "repeatCount")?.options ?? []) as number[]).map(Number);
}

function targetsOffered(game: Game, alias: string): string[] {
  return [...new Set((castField(game, alias, "targets")?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].sort();
}

/** Activate the Portal and let it resolve: exhausted, one chaos spent on the [rainbow] pip, chain empty. */
async function portal(game: Game): Promise<void> {
  await game.p1.activate("portal");
  await game.settle();
  expect(game.state("portal").isExhausted).toBe(true);
  expect(game.p1.resources()).toEqual({ energy: 8, power: { chaos: 2 } });
  expect(game.chain()).toEqual([]);
}

function destinationPrompt(game: Game): PickDecision {
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", timing: "FIN" });
  return d as PickDecision;
}

/** Both players pass once each → the top chain item resolves (no combat auto-run). */
async function bothPass(game: Game): Promise<void> {
  await game.p1.passPriority();
  await game.p2.passPriority();
}

describe("Temporal Portal → Twilight Step played from TRASH via Flow (± Repeat) vs from hand", () => {
  // ── the grant ───────────────────────────────────────────────────────────────────────────────────

  test("premise: before the Portal neither copy offers Repeat; both offer exactly the ≤3-Might units A, E and the Student (B 5 / G 6 excluded); the trash copy is castable only via Flow", async () => {
    const game = await board().build();
    expect(repeatOptions(game, "tsHand")).toEqual([]);
    expect(repeatOptions(game, "tsFlow")).toEqual([]);
    expect(targetsOffered(game, "tsHand")).toEqual(["a", "e", "student"]);
    expect(targetsOffered(game, "tsFlow")).toEqual(["a", "e", "student"]);
    expect(castField(game, "tsFlow", "viaFlow")).toMatchObject({ options: [true], required: true });
  });

  test("Temporal Portal: [rainbow] (paid from the chaos) + Exhaust; once it resolves the HAND copy is offered exactly ONE Repeat instance — Repeat [2][chaos] = its printed cost (206) — and up to 2 targets (820.2)", async () => {
    const game = await board().build();
    await portal(game);
    expect(repeatOptions(game, "tsHand")).toEqual([1]);
    expect(castField(game, "tsHand", "targets")).toMatchObject({ max: 2, min: 1 });
    const pairs = (castField(game, "tsHand", "targets")?.options ?? []).filter((v) => Array.isArray(v) && v.length === 2);
    expect(pairs).toContainEqual(["a", "e"]); // one friendly, one enemy — independent choices (820.2.a)
    expect(pairs).toContainEqual(["a", "a"]);
  });

  // Expected (829.1.b.2 / 419.1): "the next spell you play this turn" keys on the PLAY, not the origin zone, so the
  // Flow variant of the trash copy must carry the same single Repeat instance. Actual: after the Portal the trash
  // copy's cast option is unchanged (max 1 target, no repeatCount) — the grant is only applied to plays from hand.
  test("(a) the Portal grant also attaches to the TRASH copy played via Flow — its cast option offers Repeat ×1 and up to 2 targets (829.1.b.2, 419.1)", async () => {
    const game = await board().build();
    await portal(game);
    expect(repeatOptions(game, "tsFlow")).toEqual([1]);
    expect(castField(game, "tsFlow", "targets")).toMatchObject({ max: 2, min: 1 });
  });

  // ── (b) Flow cast after the Portal, Repeat NOT elected ─────────────────────────────────────────

  test("(b) Flow WITHOUT Repeat after the Portal: pays exactly the Flow cost 4 + [chaos] (8→4 energy, 2→1 chaos; 356.1.a / 829.1.c.1), destination asked at once (355.4), one chain item; resolves → A moves, card BANISHED (829.1.b.1)", async () => {
    const game = await board().build();
    await portal(game);
    await game.p1.cast("tsFlow", { flow: true, targets: "a" });
    expect(game.p1.resources()).toEqual({ energy: 4, power: { chaos: 1 } });
    expect(destinationPrompt(game).options.map((o) => o.key).sort()).toEqual(["base", "battlefield-bf2"]);
    await game.p1.pick("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tsFlow", controller: P1, targets: ["a"], triggered: false, type: "spell" })]);
    await bothPass(game);
    expect(game.locationOf("a")).toBe("base");
    expect(game.zoneOf("tsFlow")).toBe("banishment");
    expect(game.p1.trash()).not.toContain("tsFlow");
  });

  test("(e) …and that Flow cast WAS 'the next spell you play': the grant is consumed even though no Repeat was paid — the hand copy afterwards has no Repeat option and costs just 2 + [chaos]", async () => {
    const game = await board().build();
    await portal(game);
    await game.p1.cast("tsFlow", { flow: true, targets: "a" });
    await game.p1.pick("base");
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(repeatOptions(game, "tsHand")).toEqual([]);
    expect(castField(game, "tsHand", "targets")).toMatchObject({ max: 1, min: 1 });
    const r = await game.p1.try((p) => p.cast("tsHand", { repeat: 1, targets: ["e", "e"] }));
    expect(r.ok).toBe(false);
    await game.p1.cast("tsHand", { targets: "e" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 0 } }); // 4 − 2, 1 − 1
  });

  // ── (b)(c)(d) Flow cast WITH Repeat — blocked today by bug (a) ─────────────────────────────────

  // Expected: Determine Total Cost = Flow 4+[chaos] (replaces base) + Repeat 2+[chaos] (printed cost, additional)
  // = 6 energy + 2 chaos → pool {2, chaos 0}; ONE chain item carrying both targets; one card played.
  // Actual: no Flow+Repeat variant exists, the cast is rejected.
  test("(b) Flow + Repeat elected: total = 6 energy + 2 chaos (356.1.a + 356.2.b.1 + 206); a single chain item with targets [A, E]; counted as ONE card played (820.3.a)", async () => {
    const game = await board().build();
    await portal(game);
    await game.p1.cast("tsFlow", { flow: true, repeat: 1, targets: ["a", "e"] });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 0 } });
    destinationPrompt(game);
    await game.p1.pick("battlefield-bf2"); // exec 1: A bf1 → bf2
    destinationPrompt(game);
    await game.p1.pick("base"); // exec 2: E bf2 → its (P2's) base
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tsFlow", controller: P1, targets: ["a", "e"], triggered: false, type: "spell" })]);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
  });

  // Expected: both executions happen (A → bf2, E → P2's base), exactly one "when you play a spell" trigger
  // (Student 2 → 3), and — having been played via Flow — the card is BANISHED, Repeat notwithstanding.
  // Actual: the Flow+Repeat cast cannot be made (bug (a)).
  test("(c)(d) Flow + Repeat resolves: A bf1→bf2 and E bf2→P2's base (different units, different destinations, 820.2.a); ONE Student trigger; Twilight Step BANISHED not trashed (829.1.b.1, 820.3.a)", async () => {
    const game = await board().build();
    await portal(game);
    await game.p1.cast("tsFlow", { flow: true, repeat: 1, targets: ["a", "e"] });
    await game.p1.pick("battlefield-bf2");
    await game.p1.pick("base");
    await bothPass(game);
    expect(game.locationOf("a")).toBe("bf2");
    expect(game.state("e")).toMatchObject({ controller: P2, location: "base" });
    expect(game.p2.base()).toContain("e");
    expect(game.zoneOf("tsFlow")).toBe("banishment");
    expect(game.p1.trash()).not.toContain("tsFlow");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "student", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.state("student").might).toBe(3);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
  });

  // ── (e) the same line cast from HAND (this path works today and pins the Repeat mechanics) ────

  test("(e) from HAND with Repeat: 2+[chaos] + Repeat 2+[chaos] = 4 energy + 2 chaos (8→4, 2→0); Repeat and BOTH destinations are Make-Choices decisions asked at FIN before anyone gets priority (355.1.a, 355.4, 820.2); one chain item, one card played", async () => {
    const game = await board().build();
    await portal(game);
    await game.p1.cast("tsHand", { repeat: 1, targets: ["a", "e"] });
    expect(game.p1.resources()).toEqual({ energy: 4, power: { chaos: 0 } });
    const first = destinationPrompt(game);
    expect(first).toMatchObject({ allowDecline: false, source: { cardId: "a" } });
    expect(first.options.map((o) => o.key).sort()).toEqual(["base", "battlefield-bf2"]); // A's: own base or bf2 — not bf1 (current)
    await game.p1.pick("battlefield-bf2");
    destinationPrompt(game); // a second, separate destination for the repeat execution
    await game.p1.pick("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tsHand", controller: P1, targets: ["a", "e"], triggered: false, type: "spell" })]);
    expect(game.chain()).toHaveLength(1);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    // nothing has moved yet
    expect(game.locationOf("a")).toBe("bf1");
    expect(game.locationOf("e")).toBe("bf2");
  });

  // Expected (355.4.a, 820.2): the second prompt is the REPEAT execution's own destination — for Enemy E, whose
  // valid locations are its controller's base and bf1 (not bf2, where it stands). Actual: the second prompt
  // repeats A's menu (source A, options {base, battlefield-bf2}) although the answer is then applied to E.
  test("(c) the second destination prompt names exec 2's mover E and offers E's legal destinations {base, battlefield-bf1} (355.4.a) — not A's menu again", async () => {
    const game = await board().build();
    await portal(game);
    await game.p1.cast("tsHand", { repeat: 1, targets: ["a", "e"] });
    await game.p1.pick("battlefield-bf2");
    const second = destinationPrompt(game);
    expect(second.source).toMatchObject({ cardId: "e" });
    expect(second.options.map((o) => o.key).sort()).toEqual(["base", "battlefield-bf1"]);
  });

  test("(e)(c)(d) from HAND with Repeat resolves: exec 1 moves friendly A bf1→bf2, exec 2 moves ENEMY E bf2→P2's base (820.2.a); Twilight Step goes to the TRASH (not banishment); exactly ONE 'when you play a spell' trigger — Student +1 once (820.3.a)", async () => {
    const game = await board().build();
    await portal(game);
    await game.p1.cast("tsHand", { repeat: 1, targets: ["a", "e"] });
    await game.p1.pick("battlefield-bf2");
    await game.p1.pick("base");
    await bothPass(game);
    expect(game.state("a")).toMatchObject({ controller: P1, isExhausted: false, location: "bf2" });
    expect(game.state("e")).toMatchObject({ controller: P2, location: "base" });
    expect(game.p2.base()).toContain("e");
    expect(game.p1.base()).not.toContain("e");
    expect(game.zoneOf("tsHand")).toBe("trash");
    expect(game.p1.banishment()).toEqual([]);
    // one play ⇒ one Student trigger on the chain, then +1 exactly once
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "student", controller: P1, triggered: true })]);
    await game.settle(); // Student resolves; A (2) then fights G (6) alone at bf2 and dies — irrelevant here
    expect(game.state("student").might).toBe(3);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("(e)(d) …and because it went to the TRASH, that same card can later be Flowed for 4 + [chaos] and is THEN banished", async () => {
    const game = await board().resources(P1, { energy: 10, power: { chaos: 4 } }).build();
    await game.p1.activate("portal");
    await game.settle();
    await game.p1.cast("tsHand", { repeat: 1, targets: ["a", "a"] });
    await game.p1.pick("base");
    await game.p1.pick("base");
    await game.settle();
    expect(game.zoneOf("tsHand")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 6, power: { chaos: 1 } });
    expect(castField(game, "tsHand", "viaFlow")).toMatchObject({ options: [true] });
    expect(repeatOptions(game, "tsHand")).toEqual([]); // grant already used up
    await game.p1.cast("tsHand", { flow: true, targets: "student" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 0 } });
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    expect(game.locationOf("student")).toBe("bf1");
    expect(game.zoneOf("tsHand")).toBe("banishment");
  });

  test("(c) legality is re-checked per execution at resolution: P2 answers with En Garde on E (3 → 4) — E no longer has '3 [Might] or less' (359.3.e.2) so exec 2's move is SKIPPED (E stays at bf2) while exec 1 still moves A to bf2; spell → trash, nothing refunded", async () => {
    const game = await board().build();
    await portal(game);
    await game.p1.cast("tsHand", { repeat: 1, targets: ["a", "e"] });
    await game.p1.pick("battlefield-bf2");
    await game.p1.pick("base");
    await game.p1.passPriority();
    expect(game.p2.can("cast", "enGarde")).toBe(true); // Twilight Step is a normal chain item P2 may answer
    await game.p2.cast("enGarde", { targets: "e" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["tsHand", "enGarde"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // En Garde resolves: +1 (G is also there, so no 'alone' bonus)
    expect(game.state("e").might).toBe(4);
    expect(game.chain().map((c) => c.cardId)).toEqual(["tsHand"]);
    await bothPass(game); // Twilight Step resolves
    expect(game.locationOf("a")).toBe("bf2"); // exec 1 happened
    expect(game.state("e")).toMatchObject({ location: "bf2", might: 4 }); // exec 2 skipped — illegal target
    expect(game.p2.base()).not.toContain("e");
    expect(game.zoneOf("tsHand")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 4, power: { chaos: 0 } });
  });

  test("(c) control — without the response the very same declaration does move E home (so the skip above is the Might check, not the declaration)", async () => {
    const game = await board().build();
    await portal(game);
    await game.p1.cast("tsHand", { repeat: 1, targets: ["a", "e"] });
    await game.p1.pick("battlefield-bf2");
    await game.p1.pick("base");
    await bothPass(game);
    expect(game.locationOf("e")).toBe("base");
  });

  // ── contrast: no Portal at all ─────────────────────────────────────────────────────────────────

  test("contrast (no Portal): hand cast = 2 + [chaos] → trash; Flow cast = 4 + [chaos] → banishment; neither ever offers Repeat", async () => {
    const game = await board().build();
    await game.p1.cast("tsHand", { targets: "a" });
    expect(game.p1.resources()).toEqual({ energy: 6, power: { chaos: 2 } });
    await game.p1.pick("base");
    await game.settle();
    expect(game.zoneOf("tsHand")).toBe("trash");
    expect(repeatOptions(game, "tsFlow")).toEqual([]);
    await game.p1.cast("tsFlow", { flow: true, targets: "student" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 1 } });
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    expect(game.zoneOf("tsFlow")).toBe("banishment");
    expect(game.locationOf("student")).toBe("bf1");
  });
});
