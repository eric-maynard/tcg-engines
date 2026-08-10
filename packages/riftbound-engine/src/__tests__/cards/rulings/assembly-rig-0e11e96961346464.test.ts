/**
 * Ruling 0e11e96961346464 — Assembly Rig (SFD-019 → sfd-019-221) · Gear · Fury · 4
 *   "[1][fury], Recycle a unit from your trash, [Exhaust]: Play a 3 [Might] Mech unit token to your base."
 *   (Rumble, Hotheaded sfd-026-221 is only cited as Mech context; it plays no part in the question.)
 *
 * Q: How does Assembly Rig work — can it make a 3-Might token every turn?
 * A: Activation pays ALL THREE costs at once (1 energy + 1 fury, recycle a unit card from your trash to the
 *    bottom of your Main Deck, exhaust the Rig); the ability then goes on the chain (opponent may respond) and
 *    resolves into a 3-Might Mech token in your base (entering exhausted). There is no once-per-turn text, so
 *    yes, every turn — as long as you have the resources, a unit in the trash (else the cost can't be paid at
 *    all) and a READY Rig (the [Exhaust] cost limits it to once per turn absent a ready effect).
 * Rules: 370.2 / 377–379 (activated abilities: costs before ":" paid on activation; uses the chain),
 *        403.1 / 403.3 (Recycle as a cost must be completed in full), 179.1.d / 143.4 (unit tokens; enter exhausted).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ASSEMBLY_RIG = "sfd-019-221";
const SKULKER = "ogn-175-298"; // vanilla 3-Might unit cards for the trash

const mechsInBase = (game: Game) => game.p1.units("base").filter((id) => game.state(id).isToken && game.state(id).name === "Mech");

/** P1's turn: Rig ready in base, two unit cards + one spell in the trash, exactly 1 energy + 1 fury. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { fury: 1 } })
    .gear(P1, ASSEMBLY_RIG, "rig")
    .trash(P1, SKULKER, "dead1")
    .trash(P1, SKULKER, "dead2")
    .trash(P1, { cardType: "spell", energyCost: 1, name: "Junk Spell" }, "junk");
}

/** Activate the Rig, recycling `unit` for the cost (answering the pick if the engine asks which). */
async function activateRecycling(game: Game, unit: string): Promise<void> {
  expect(game.p1.can("activate", "rig")).toBe(true);
  await game.p1.activate("rig", undefined, { answers: [unit] });
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick(unit);
  }
}

describe("Ruling 0e11e96961346464 — how Assembly Rig works, and yes: one Mech per turn while you can pay", () => {
  test("activation pays all three costs together — 1 energy + 1 fury gone, the chosen unit card recycled from trash to the BOTTOM of the deck, the Rig exhausted — and only a UNIT may be recycled", async () => {
    const game = await board().build();
    // Which unit to recycle is P1's choice between the two unit cards; the spell is never offered.
    const recycle = game.p1.option("activate", "rig")?.fields.find((f) => f.name === "recycle" || f.arg === "recycle");
    expect([...(recycle?.options ?? [])].map(String).sort()).toEqual(["dead1", "dead2"]);
    await activateRecycling(game, "dead1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.state("rig").isExhausted).toBe(true);
    expect(game.zoneOf("dead1")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("dead1"); // bottom (403.1)
    expect(game.zoneOf("dead2")).toBe("trash");
    expect(game.zoneOf("junk")).toBe("trash");
  });

  test("it uses the chain (370.2): after activation the opponent gets priority to respond before any token exists; on resolution a 3-Might Mech unit token is played to base, exhausted", async () => {
    const game = await board().build();
    await activateRecycling(game, "dead1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rig", controller: P1, triggered: false })]);
    expect(mechsInBase(game)).toHaveLength(0);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ kind: "action", context: "chain", seat: P2 }); // P2 may respond
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    const mechs = mechsInBase(game);
    expect(mechs).toHaveLength(1);
    expect(game.state(mechs[0]!)).toMatchObject({ cardType: "unit", isExhausted: true, isToken: true, might: 3, name: "Mech" });
  });

  test("[Exhaust] limits it to once per turn: right after the first activation (even refilled with 1+fury and a unit still in the trash) the exhausted Rig cannot be activated again", async () => {
    const game = await board().build();
    await activateRecycling(game, "dead1");
    await game.settle();
    expect(mechsInBase(game)).toHaveLength(1);
    await game.p1.do("addResources", { energy: 1, power: { fury: 1 } });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    expect(game.zoneOf("dead2")).toBe("trash"); // a unit is still available
    expect(game.state("rig").isExhausted).toBe(true);
    expect(game.p1.can("activate", "rig")).toBe(false);
    const r = await game.p1.try((p) => p.activate("rig", 0));
    expect(r.ok).toBe(false);
  });

  test("…but there is no once-per-turn clause: next turn the Rig readies and, with 1+fury and another unit in the trash, it makes a SECOND Mech", async () => {
    const game = await board().build();
    await activateRecycling(game, "dead1");
    await game.settle();
    expect(mechsInBase(game)).toHaveLength(1);
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1: Awaken readies the Rig
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("rig").isReady).toBe(true);
    await game.p1.do("addResources", { energy: 1, power: { fury: 1 } });
    await activateRecycling(game, "dead2");
    expect(game.zoneOf("dead2")).toBe("mainDeck");
    await game.settle();
    expect(mechsInBase(game)).toHaveLength(2);
    expect(game.p1.trash()).toEqual(["junk"]);
  });

  test("trash availability (403.3): with only a spell in the trash the recycle cost cannot be paid, so the ability cannot be activated at all — nothing is spent or exhausted", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { fury: 1 } })
      .gear(P1, ASSEMBLY_RIG, "rig")
      .trash(P1, { cardType: "spell", energyCost: 1, name: "Junk Spell" }, "junk")
      .build();
    expect(game.p1.can("activate", "rig")).toBe(false);
    const r = await game.p1.try((p) => p.activate("rig", 0));
    expect(r.ok).toBe(false);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    expect(game.state("rig").isReady).toBe(true);
    expect(game.chain()).toEqual([]);
  });

  test("resource availability: missing the fury or the 1 energy also makes it un-activatable", async () => {
    const noFury = await board().resources(P1, { energy: 1, power: { fury: 0 } }).build();
    expect(noFury.p1.can("activate", "rig")).toBe(false);
    const noEnergy = await board().resources(P1, { energy: 0, power: { fury: 1 } }).build();
    expect(noEnergy.p1.can("activate", "rig")).toBe(false);
  });
});
