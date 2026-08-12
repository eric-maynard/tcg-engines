/**
 * Ruling c632fb7eee9e3bed — Fizz, Trickster (SFD-140 → sfd-140-221) · Unit · [3][chaos] · 3 Might
 *   "When you play me, you may play a spell from your trash with Energy cost no more than [3], ignoring its
 *    Energy cost. Recycle that spell after you play it. (You must still pay its Power cost.)"
 *   × Charm (OGN-043 → ogn-043-298) · [1][calm] · "Move an enemy unit." (the spell replayed from the trash)
 *
 * Q: Does Fizz target the spell it replays?
 * A: Yes — the trash spell is TARGETED when Fizz's "when you play me" ability is put on the Chain. The
 *    spell's own targets are declared later, when the ability resolves and actually plays it.
 * Rules: 402.2 (a triggered item's caster-chosen targets are named at finalization), 355.8 (a played spell
 *        names its own targets as it is played), 359 (resolution).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FIZZ = "sfd-140-221";
const CHARM = "ogn-043-298";
const GUST = "ogn-169-298";

/** Two eligible spells in P1's trash, two enemy units to aim Charm at once it is replayed. */
function fizzWithTwoSpells() {
  return scenario()
    .resources(P1, { energy: 4, power: { chaos: 2, calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 5, name: "Foe" }, "foe")
    .unit(P2, "bf1", { might: 5, name: "Second Foe" }, "foe2")
    .trash(P1, CHARM, "charm")
    .trash(P1, GUST, "gust")
    .hand(P1, FIZZ, "fizz");
}

describe("Ruling c632fb7eee9e3bed — Fizz targets the trash spell at trigger time, the spell aims later", () => {
  test("the trash spell is chosen at FINALIZATION and lands on the Chain item as its target", async () => {
    const game = await fizzWithTwoSpells().build();
    await game.p1.play("fizz");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" }); // "you may"
    await game.p1.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target", timing: "FIN" });
    expect(d?.source?.cardId).toBe("fizz");
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).toSorted() : []).toEqual(["charm", "gust"]);
    await game.p1.pick("charm");
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "fizz", controller: P1, targets: ["charm"], triggered: true }),
    ]);
    expect(game.zoneOf("charm")).toBe("trash"); // still in the trash — only targeted
  });

  test("Charm's own target is asked when the ability RESOLVES and plays it, not at trigger time", async () => {
    const game = await fizzWithTwoSpells().build();
    await game.p1.play("fizz");
    await game.p1.yes();
    await game.p1.pick("charm");
    const settled = await game.settle();
    expect(settled.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target" });
    expect(d?.source?.cardId).toBe("charm"); // a NEW chain item for the replayed spell
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).toSorted() : []).toEqual(["foe", "foe2"]);
    await game.p1.pick("foe");
    expect(game.chain().some((c) => c.cardId === "charm")).toBe(true); // aimed, still unresolved
  });

  test("the Energy cost is ignored but the Power cost is still paid, and Gust — the spell not chosen — stays in the trash", async () => {
    const game = await fizzWithTwoSpells().build();
    await game.p1.play("fizz");
    await game.p1.yes();
    await game.p1.pick("charm");
    await game.settle();
    await game.p1.pick("foe");
    expect(game.p1.power("calm")).toBe(0); // Charm's [calm] was paid…
    expect(game.p1.energy()).toBe(1); // …only Fizz's own [3] left P1's Energy
    expect(game.p1.trash()).toContain("gust");
    expect(game.violations()).toEqual([]);
  });
});
