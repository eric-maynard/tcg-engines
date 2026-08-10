/**
 * Interaction: Irelia, Fervent (sfd-057-221) × The Dreaming Tree (ogn-292-298) × Discipline (ogn-058-298)
 *              × Defy (ogn-045-298)  (+ Wind Wall ogn-064-298 for the contrast case)
 *
 *   Irelia, Fervent — Champion Unit · Calm · 5 · 4 Might
 *     "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)
 *      When you choose or ready me, give me +1 [Might] this turn."
 *   The Dreaming Tree — Battlefield
 *     "When a player chooses a friendly unit here with a spell for the first time each turn, they draw 1."
 *   Discipline — Spell · 2 · [Reaction] "Give a unit +2 [Might] this turn. Draw 1."
 *   Defy — Spell · 1 + [calm] · [Reaction] "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   Wind Wall — Spell · 3 + [calm][calm] · [Reaction] "Counter a spell."
 *
 * Rules: 383.4.b.2 / 383.4.b.3 / 355.6 (Targeting Effects trigger when the object is TARGETED, i.e. when
 * the choosing spell is finalized), 337.1 / 337.4 (pending items are finalized before anyone gets
 * priority), 355.9.a.2 ("spell" on Defy = a spell chain item, not an ability), 340.1 (LIFO), 425.1.a.1 /
 * 425.1.b / 425.1.c / 425.1.c.1 (countered → trash, nothing refunded incl. additional costs; only
 * "played" triggers are denied), 809.1.c / 356.2.a (Deflect = mandatory additional cost), 383.3.e
 * ("first time each turn"), 419.4.a.
 *
 * Question: P1's Irelia (4) sits at P1's Dreaming Tree; P1 has chosen nothing this turn. P1 Disciplines
 * Irelia; P2 Defies the Discipline.
 *  (a) What is on the chain when P2 first gets priority; what may Defy target?
 *  (b) Resolve: Irelia's Might, P1's draws, where Discipline went, refunds.
 *  (c) A second, un-countered spell on Irelia later this turn: Tree again? Irelia +1 again?
 *  (d) Contrast: P2's own spell chooses Irelia (paying Deflect) and P1 Wind Walls it — Irelia +1? refund?
 *
 * Expected: (a) [Discipline, Irelia-trigger, Tree-trigger] before P2 can act; Defy may only name
 * Discipline. (b) Discipline countered → trash, no +2/draw, 2 energy gone; both triggers still resolve:
 * Irelia 5, P1 drew exactly 1 (Tree); Defy → P2's trash. (c) no second Tree draw (the countered cast WAS
 * the first choosing), Irelia +1 again (+2 more if the spell resolves). (d) enemy choice never triggers
 * "when YOU choose me"; the Deflect power stays spent when Wind Wall counters the spell.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const IRELIA = "sfd-057-221";
const DREAMING_TREE = "ogn-292-298";
const DISCIPLINE = "ogn-058-298";
const DEFY = "ogn-045-298";
const WIND_WALL = "ogn-064-298";

function targetsOffered(game: Game, seat: "p1" | "p2", alias: string): string[] {
  const opt = game[seat].option("cast", alias);
  const field = opt?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

const chainIds = (game: Game) => game.chain().map((c) => c.cardId);

/**
 * P1's turn. Irelia (P1) at P1's live Dreaming Tree. P1: 4 energy, two Disciplines, known deck d1..d3.
 * P2: exactly 1 + [calm] and Defy.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4 })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("tree", { controller: P1, def: DREAMING_TREE, inert: false, owner: P1 })
    .unit(P1, "tree", IRELIA, "irelia")
    .hand(P1, DISCIPLINE, "discipline")
    .hand(P1, DISCIPLINE, "discipline2")
    .hand(P2, DEFY, "defy")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

/** P1 Disciplines Irelia (keeping the listed trigger order), passes; P2 Defies the Discipline. */
async function disciplineThenDefy(game: Game): Promise<void> {
  await game.p1.cast("discipline", { targets: "irelia" });
  await game.acceptTriggerOrder(); // 383.3.d soft offer — keep the scan order
  await game.p1.passPriority();
  await game.p2.cast("defy", { targets: "discipline" });
}

describe("Irelia, Fervent at The Dreaming Tree — choose-triggers fire at finalization and survive a Defy", () => {
  // ── (a) the chain when P2 can first act ────────────────────────────────────────────────────

  test("(a) casting Discipline on Irelia finalizes it AND queues both Targeting Effects at once: chain = [Discipline, Irelia +1, Tree draw], all P1's, the two on top triggered — before anyone holds priority (383.4.b.2, 337.1)", async () => {
    const game = await board().build();
    expect(game.state("irelia").might).toBe(4);
    await game.p1.cast("discipline", { targets: "irelia" });
    expect(game.p1.energy()).toBe(2);
    // P1 controls two fresh triggers → the soft 383.3.d order offer, addressed to P1, nothing resolved yet.
    expect(game.decision()).toMatchObject({ kind: "order", seat: P1, defaultable: true, timing: "FIN" });
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "discipline", controller: P1, targets: ["irelia"], triggered: false, type: "spell" }),
      expect.objectContaining({ cardId: "irelia", controller: P1, triggered: true }),
      expect.objectContaining({ cardId: "tree", controller: P1, triggered: true }),
    ]);
    expect(game.state("irelia").might).toBe(4); // nothing has resolved
    expect(game.p1.hand()).toEqual(["discipline2"]);
  });

  test("(a) P1 gets priority first (controller of the newest item, 337.4); only after P1 passes does P2 act — and by then all three items already sit on the chain, so there is no moment where Discipline is alone", async () => {
    const game = await board().build();
    await game.p1.cast("discipline", { targets: "irelia" });
    await game.acceptTriggerOrder();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p2.legal()).toEqual([]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(chainIds(game)).toEqual(["discipline", "irelia", "tree"]);
  });

  test("(a) Defy is offered exactly ONE target — Discipline (a spell, 2 ≤ 4, no Power); the Irelia and Tree items are abilities, not spells (355.9.a.2), and are never offered", async () => {
    const game = await board().build();
    await game.p1.cast("discipline", { targets: "irelia" });
    await game.acceptTriggerOrder();
    await game.p1.passPriority();
    expect(game.p2.can("cast", "defy")).toBe(true);
    expect(targetsOffered(game, "p2", "defy")).toEqual(["discipline"]);
    await expect(game.p2.cast("defy", { targets: "irelia" })).rejects.toThrow();
    await expect(game.p2.cast("defy", { targets: "tree" })).rejects.toThrow();
    await game.p2.cast("defy", { targets: "discipline" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(chainIds(game)).toEqual(["discipline", "irelia", "tree", "defy"]);
  });

  // ── (b) resolution ─────────────────────────────────────────────────────────────────────────

  test("(b) resolve everything: Defy counters Discipline → P1's trash, no +2, no Discipline draw, P1's 2 energy NOT refunded (425.1.a.1 / 425.1.c); Defy → P2's trash", async () => {
    const game = await board().build();
    await disciplineThenDefy(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("discipline")).toBe("trash");
    expect(game.p1.trash()).toContain("discipline");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.p2.trash()).toContain("defy");
    expect(game.p1.energy()).toBe(2); // 4 − 2, nothing came back
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.state("irelia").mightModifier).toBe(1); // only Irelia's own +1 — see next test — never Discipline's +2
  });

  test("(b) …yet both Targeting Effects resolve normally — the choosing already happened at finalization: Irelia is 5 (4 + 1, not 7) and P1 drew exactly 1 off the Tree (hand: −Discipline +d1)", async () => {
    const game = await board().build();
    await disciplineThenDefy(game);
    await game.settle();
    expect(game.state("irelia").might).toBe(5);
    expect(game.p1.hand()).toEqual(["discipline2", "d1"]);
    expect(game.p1.deck()[0]).toBe("d2"); // exactly one card left the deck
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(b) control — no Defy: Discipline resolves too → Irelia 7 (4 + 1 + 2) and P1 drew 2 (Tree + Discipline)", async () => {
    const game = await board().build();
    await game.p1.cast("discipline", { targets: "irelia" });
    await game.settle();
    expect(game.state("irelia").might).toBe(7);
    expect(game.p1.hand()).toEqual(["discipline2", "d1", "d2"]);
    expect(game.zoneOf("discipline")).toBe("trash");
  });

  // ── (c) a second spell the same turn ───────────────────────────────────────────────────────

  test("(c) later the same turn P1 casts a second Discipline on Irelia: NO Tree item (the countered cast already was 'the first time this turn', 383.3.e) but Irelia's trigger fires again — chain = [Discipline2, Irelia]", async () => {
    const game = await board().build();
    await disciplineThenDefy(game);
    await game.settle();
    await game.p1.cast("discipline2", { targets: "irelia" });
    expect(chainIds(game)).toEqual(["discipline2", "irelia"]);
    expect(game.chain().some((c) => c.cardId === "tree")).toBe(false);
  });

  test("(c) …resolved un-countered: Irelia 8 this turn (5 + 1 choose + 2 Discipline); P1 drew exactly one more card (Discipline's own draw, d2) — no Tree draw", async () => {
    const game = await board().build();
    await disciplineThenDefy(game);
    await game.settle();
    expect(game.p1.hand()).toEqual(["discipline2", "d1"]);
    await game.p1.cast("discipline2", { targets: "irelia" });
    await game.settle();
    expect(game.state("irelia").might).toBe(8);
    expect(game.p1.hand()).toEqual(["d1", "d2"]);
    expect(game.p1.deck()[0]).toBe("d3");
    expect(game.p1.energy()).toBe(0);
    // all of it is "this turn"
    await game.advanceTurn();
    expect(game.state("irelia").might).toBe(4);
    expect(game.violations()).toEqual([]);
  });

  // ── (d) contrast: an ENEMY spell chooses Irelia and is countered ───────────────────────────

  /** P2's turn. P2 holds a Discipline and exactly 2 + one [calm] (the Deflect tax); P1 holds Wind Wall with 3 + [calm][calm]. */
  function enemyChooses(p2Power: Record<string, number> = { calm: 1 }) {
    return scenario()
      .active(P2)
      .resources(P1, { energy: 3, power: { calm: 2 } })
      .resources(P2, { energy: 2, power: p2Power })
      .battlefield("tree", { controller: P1, def: DREAMING_TREE, inert: false, owner: P1 })
      .unit(P1, "tree", IRELIA, "irelia")
      .hand(P2, DISCIPLINE, "theirDiscipline")
      .hand(P1, WIND_WALL, "windWall")
      .deck(P2, ["ogn-175-298", "ogn-175-298"], ["e1", "e2"]);
  }

  test("(d) Deflect is a mandatory additional cost (809.1.c / 356.2.a): with 2 energy and NO power P2's Discipline cannot choose Irelia at all; with one power of any domain she is offered and the cast debits 2 + that power", async () => {
    const broke = await enemyChooses({}).build();
    expect(targetsOffered(broke, "p2", "theirDiscipline")).toEqual([]);
    expect(broke.p2.can("cast", "theirDiscipline")).toBe(false);

    const game = await enemyChooses({ fury: 1 }).build(); // any domain pays [rainbow] (809.1.c.1)
    expect(targetsOffered(game, "p2", "theirDiscipline")).toEqual(["irelia"]);
    await game.p2.cast("theirDiscipline", { targets: "irelia" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("(d) an ENEMY spell choosing Irelia triggers neither 'When YOU choose me' nor the Tree for P2 (Irelia is not friendly to the chooser): the chain is the spell alone", async () => {
    const game = await enemyChooses().build();
    await game.p2.cast("theirDiscipline", { targets: "irelia" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "theirDiscipline", controller: P2, targets: ["irelia"], triggered: false })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // no trigger-order offer, straight to priority
    expect(game.state("irelia").might).toBe(4);
  });

  test("(d) P1 Wind Walls it: the spell is countered → P2's trash, Irelia stays 4 (no +1 ever, no +2), P2 drew nothing, and NOTHING is refunded — the 2 energy and the Deflect [rainbow] stay spent (425.1.c.1)", async () => {
    const game = await enemyChooses().build();
    await game.p2.cast("theirDiscipline", { targets: "irelia" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.p2.passPriority();
    await game.p1.cast("windWall", { targets: "theirDiscipline" });
    expect(chainIds(game)).toEqual(["theirDiscipline", "windWall"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("theirDiscipline")).toBe("trash");
    expect(game.p2.trash()).toContain("theirDiscipline");
    expect(game.zoneOf("windWall")).toBe("trash");
    expect(game.state("irelia")).toMatchObject({ might: 4, mightModifier: 0 });
    expect(game.p2.hand()).toEqual([]);
    expect(game.p2.deck()[0]).toBe("e1");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } }); // Deflect power not returned
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("(d) control — un-countered enemy Discipline: Irelia gets the +2 (→ 6) but still no +1 of her own, and P2 (not P1) draws Discipline's card", async () => {
    const game = await enemyChooses().build();
    const p1Hand = game.p1.hand().length;
    await game.p2.cast("theirDiscipline", { targets: "irelia" });
    await game.settle();
    expect(game.state("irelia").might).toBe(6);
    expect(game.state("irelia").mightModifier).toBe(2);
    expect(game.p2.hand()).toEqual(["e1"]);
    expect(game.p1.hand()).toHaveLength(p1Hand);
  });
});
