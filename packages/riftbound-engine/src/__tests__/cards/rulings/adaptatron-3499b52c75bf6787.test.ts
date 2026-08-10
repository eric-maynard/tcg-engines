/**
 * Ruling 3499b52c75bf6787 — Adaptatron (OGN-056 → ogn-056-298) 3-Might unit
 *   "When I conquer, you may kill a gear. If you do, buff me."
 *   × Svellsongur (SFD-059 → sfd-059-221, Equipment) attached to Ornn, Forge God (SFD-085 → sfd-085-221)
 *     "[Deflect 2] (Opponents must pay [rainbow][rainbow] to choose me with a spell or ability.) [Weaponmaster] I have +1
 *      [Might] for each friendly gear."
 *
 * Q: When Adaptatron's trigger targets a gear attached to a unit with Deflect (Svellsongur on Ornn), must Deflect be paid?
 * A: No. Deflect protects the UNIT; the attached Equipment remains a separate object with its own properties. Choosing
 *    the gear is not choosing the unit, so no Deflect cost applies.
 * Rules: 727 (Deflect — choosing "me"), 716–719 (attached Equipment is its own permanent; Top-Most Card properties are
 *        not the Equipment's), RiftJudge FAQ #734.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ADAPTATRON = "ogn-056-298";
const SVELLSONGUR = "sfd-059-221";
const ORNN = "sfd-085-221";

/** Inline 1-cost [Action] "Deal 1 to a unit" — only to demonstrate that Ornn himself is Deflect-protected from a power-less P1. */
const SPARK = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Spark",
  timing: "action",
} as const;

/**
 * P1's turn. bf1 is empty and uncontrolled. P1: ready Adaptatron (3) in base, Spark in hand, 1 energy and NO power
 * (so a [rainbow][rainbow] Deflect payment is impossible). P2: Ornn in base wearing Svellsongur, plus a loose Trinket.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", ADAPTATRON, "ada")
    .unit(P2, "base", ORNN, "ornn", { equippedWith: ["svell"] } as Record<string, unknown>)
    .card("svell", { def: SVELLSONGUR, meta: { attachedTo: "ornn", copiedFromCardId: "ornn" } as Record<string, unknown>, owner: P2, zone: "base" })
    .gear(P2, { cardType: "gear", name: "Trinket" }, "trinket")
    .hand(P1, SPARK, "spark");
}

/** Adaptatron walks onto the empty bf1; both pass Focus; it conquers and its "you may kill a gear" is accepted. Returns at the gear pick. */
async function conquerAndOptIn(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("ada", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  await game.p2.passFocus();
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.p1.points()).toBe(1);
  // "you may" — asked of P1.
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  await game.p1.yes();
  return game;
}

describe("Ruling 3499b52c75bf6787 — Adaptatron may kill an Equipment attached to a Deflect unit without paying Deflect", () => {
  test("premise: Ornn (wearing Svellsongur) has Deflect and P1, holding no power, cannot even choose Ornn with a spell", async () => {
    const game = await board().build();
    expect(game.state("ornn")).toMatchObject({ attachments: ["svell"], keywords: expect.arrayContaining(["Deflect"]) });
    expect(game.state("svell")).toMatchObject({ attachedTo: "ornn", controller: P2 });
    const field = game.p1.option("cast", "spark")?.fields.find((f) => f.arg === "targets");
    const offered = (field?.options ?? []).flat() as string[];
    expect(offered).toContain("ada");
    expect(offered).not.toContain("ornn"); // Deflect 2 unpaid-able → not a legal choice
  });

  test("Adaptatron conquers; P1 opts in and is offered P2's gear INCLUDING the attached Svellsongur (Ornn himself is not what's being chosen)", async () => {
    const game = await conquerAndOptIn();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["svell", "trinket"]);
    expect(offered).not.toContain("ornn");
  });

  test("choosing the attached Svellsongur demands no Deflect payment: with zero power it is killed (→ P2's trash, detached from Ornn) and Adaptatron is buffed to 4", async () => {
    const game = await conquerAndOptIn();
    await game.p1.pick("svell");
    // No pay-Deflect prompt interposes: straight to the priority window on the trigger, then it resolves.
    const d = game.decision();
    expect(d?.kind === "yes-no" || d?.kind === "integer").toBe(false);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("svell")).toBe("trash");
    expect(game.p2.trash()).toContain("svell");
    expect(game.state("ornn")).toMatchObject({ attachments: [], damage: 0, zone: "base" }); // Ornn untouched (now +1 for the Trinket only)
    expect(game.state("ornn").might).toBe(5);
    expect(game.state("ada")).toMatchObject({ isBuffed: true, might: 4, zone: "battlefield-bf1" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: {} }); // nothing was paid
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
