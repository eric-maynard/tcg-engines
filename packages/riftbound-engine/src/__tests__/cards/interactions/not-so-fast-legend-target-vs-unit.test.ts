/**
 * Interaction: Not So Fast (sfd-045-221) · Spell · Calm · 2 + [calm] · Reaction
 *     "Counter an enemy spell or ability that chooses a friendly unit or gear."
 *   × Royal Entourage (sfd-039-221) · Unit · Calm · 3 · 4 might
 *     "When you play me, ready or exhaust a legend."
 *   × Void Seeker (ogn-024-298) · Spell · Fury · 3 + [fury] · Action
 *     "Deal 4 to a unit at a battlefield. Draw 1."
 *
 * Question: P2 holds Not So Fast.
 *   Case 1: P1 plays Royal Entourage; its trigger chooses P2's LEGEND (exhaust it).
 *   Case 2: P1 plays Void Seeker choosing P2's unit at a battlefield.
 *   Case 3: P1 plays Void Seeker choosing P1's OWN unit.
 *   (a) Is an opposing legend a legal choice for the trigger, and is it targeted?
 *   (b) In which cases may P2 legally play Not So Fast?
 *
 * Rules: 355.9.a.4 ("legend" = a legend in the Legend Zone), 355.10.a (Legend Zone is public →
 * "ready a legend" TARGETS a legend; nothing restricts it to friendly legends), 355.9.b (a target
 * must meet all targeting restrictions — Not So Fast needs "chooses a friendly unit or gear",
 * friendly relative to Not So Fast's controller), 355.8 (no valid target → cannot be put on the
 * chain), 355.9.a.2 ("spell or ability" = an object on the chain), 425.1.a (countered → does
 * nothing, cleared to trash; Void Seeker's "Draw 1" never happens).
 *
 * Expected: (a) yes — P1 may pick P2's legend and it is exhausted. (b) Case 1: NOT legal (a legend
 * is neither unit nor gear). Case 2: legal — Void Seeker is countered, no damage, no draw.
 * Case 3: NOT legal — the chosen unit is friendly to P1, not to P2.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const NOT_SO_FAST = "sfd-045-221";
const ROYAL_ENTOURAGE = "sfd-039-221";
const VOID_SEEKER = "ogn-024-298";
const LEGEND = "ogs-017-024"; // Dark Child - Starter (end-of-turn text only; inert here)

function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { calm: 1, fury: 1 } }) // Royal Entourage (3+calm) + Void Seeker (3+fury)
    .resources(P2, { energy: 2, power: { calm: 1 } }) // exactly Not So Fast
    .battlefield("bf1", { controller: P2 })
    .legend(P1, LEGEND, "p1Legend")
    .legend(P2, LEGEND, "p2Legend")
    .unit(P1, "bf1", { might: 5, name: "P1 Veteran" }, "mine")
    .unit(P2, "bf1", { might: 5, name: "P2 Veteran" }, "theirs")
    .hand(P1, ROYAL_ENTOURAGE, "royal")
    .hand(P1, VOID_SEEKER, "voidSeeker")
    .hand(P2, NOT_SO_FAST, "nsf");
}

describe("Not So Fast × Royal Entourage (legend target) / Void Seeker (unit target)", () => {
  // ---- Case 1: Royal Entourage's play trigger --------------------------------------------

  test("Case 1: playing Royal Entourage puts its 'ready or exhaust a legend' trigger on the chain as P1's ability", async () => {
    const game = await board().build();
    await game.p1.play("royal", { to: "base" });
    expect(game.zoneOf("royal")).toBe("base");
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "royal", controller: P1, triggered: true, type: "ability" }),
    ]);
  });

  test("(a) the trigger TARGETS a legend in either Legend Zone — P1 may choose P2's legend and it is exhausted on resolution (355.9.a.4, 355.10.a)", async () => {
    // Expected: after choosing the "exhaust" mode P1 is asked which legend (both p1Legend and
    // p2Legend offered); picking p2Legend exhausts it. Actual: the parsed target is `{type:"unit"}`,
    // no legend is ever offered and neither legend changes state.
    const game = await board().build();
    await game.p1.play("royal", { to: "base" });
    const r = await game.settle(); // rule 402: the mode prompt is already pending (finalization)
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "mode" });
    await game.p1.chooseMode(1); // "exhaust"
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    const offered = d && d.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(offered).toContain("p1Legend");
    expect(offered).toContain("p2Legend");
    await game.p1.pick("p2Legend");
    await game.settle();
    expect(game.state("p2Legend").isExhausted).toBe(true);
    expect(game.state("p1Legend").isExhausted).toBe(false);
  });

  test("Case 1 (b): Not So Fast is NOT legal against Royal Entourage's trigger — it chooses a legend, not a unit or gear (355.9.b, 355.8)", async () => {
    const game = await board().build();
    await game.p1.play("royal", { to: "base" });
    await game.p1.chooseMode(1); // rule 402 (finalization): mode and legend are chosen before anyone gets priority
    await game.p1.pick("p2Legend");
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.chain().map((i) => i.cardId)).toEqual(["royal"]);
    expect(game.p2.can("cast", "nsf")).toBe(false);
    const r = await game.p2.try((p) => p.cast("nsf", { targets: "royal" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("nsf")).toBe("hand");
    expect(game.p2.resources()).toEqual({ energy: 2, power: { calm: 1 } });
  });

  // ---- Case 2: Void Seeker at P2's unit -----------------------------------------------------

  test("Case 2 (b): Void Seeker choosing P2's unit — Not So Fast IS legal for P2 and Void Seeker is its only offered target", async () => {
    const game = await board().build();
    await game.p1.cast("voidSeeker", { targets: "theirs" });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "nsf")).toBe(true);
    const targets = game.p2.option("cast", "nsf")?.fields.find((f) => f.name === "targets")?.options;
    expect(targets).toEqual([["voidSeeker"]]);
  });

  test("Case 2: Not So Fast counters Void Seeker — both spells to trash, no damage to P2's unit, P1 does NOT draw (425.1.a)", async () => {
    const game = await board().build();
    const p1HandBefore = game.p1.hand().length; // royal + voidSeeker
    const p1DeckBefore = game.p1.deck().length;
    await game.p1.cast("voidSeeker", { targets: "theirs" });
    await game.p1.passPriority();
    await game.p2.cast("nsf", { targets: "voidSeeker" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((i) => i.cardId)).toEqual(["voidSeeker", "nsf"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("voidSeeker")).toBe("trash");
    expect(game.zoneOf("nsf")).toBe("trash");
    expect(game.state("theirs").damage).toBe(0);
    expect(game.zoneOf("theirs")).toBe("battlefield-bf1");
    expect(game.p1.hand()).toHaveLength(p1HandBefore - 1); // spent Void Seeker, drew nothing
    expect(game.p1.deck()).toHaveLength(p1DeckBefore);
  });

  test("Case 2 control: without Not So Fast, Void Seeker resolves and deals 4 to P2's unit", async () => {
    const game = await board().build();
    await game.p1.cast("voidSeeker", { targets: "theirs" });
    await game.settle();
    expect(game.zoneOf("voidSeeker")).toBe("trash");
    expect(game.state("theirs").damage).toBe(4);
  });

  // ---- Case 3: Void Seeker at P1's own unit -------------------------------------------------

  test("Case 3 (b): Void Seeker choosing P1's OWN unit — Not So Fast is NOT legal for P2 ('friendly' is relative to Not So Fast's controller; 355.9.b, 355.8)", async () => {
    // Expected: the only spell on the chain chooses a unit friendly to P1, so P2 has no valid target
    // and cannot even begin to play Not So Fast. Actual: Not So Fast is parsed as an unrestricted
    // `counter` and is offered against (and counters) Void Seeker.
    const game = await board().build();
    await game.p1.cast("voidSeeker", { targets: "mine" });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "nsf")).toBe(false);
    const r = await game.p2.try((p) => p.cast("nsf", { targets: "voidSeeker" }));
    expect(r.ok).toBe(false);
    await game.settle();
    expect(game.state("mine").damage).toBe(4); // Void Seeker resolves against P1's own unit
  });
});
