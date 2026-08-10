/**
 * Ruling f0f89b61e6f3df94 — Annie, Stubborn (OGS-010 → ogs-010-024) · Unit · "When you play me, return a spell from your trash to
 *   your hand."   × Morbid Return (OGN-170 → ogn-170-298) · [Action] · "Return a unit from your trash to your hand."
 *
 * Q: Do you have to show your opponent which card you take from your trash with Annie, Stubborn or Morbid Return?
 * A: Yes. The card in your trash is TARGETED — the trash is public information — so the choice is announced when the
 *    spell/trigger is put on the chain, and the opponent can respond to that targeting before it resolves.
 * Rules: 128 (trash is a Public zone), 355.5 / 402.2 (targets are chosen as the item is played/finalized, before priority),
 *        383.4.a (Annie's play trigger goes on the chain), 336–340 (opponent gets priority to respond).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, isHiddenView, scenario } from "../../../harness";

const ANNIE_STUBBORN = "ogs-010-024";
const MORBID_RETURN = "ogn-170-298";
const SKULKER = "ogn-175-298"; // a unit for the trash
const CHARM = "ogn-043-298"; // spells for the trash
const RIDE_THE_WIND = "ogn-173-298";

/** P1's turn with plenty of resources; P1's trash holds two units (deadA, deadB) and two spells (spellA, spellB); Annie + Morbid Return in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { chaos: 2, fury: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Bystander" }, "bystander")
    .trash(P1, SKULKER, "deadA")
    .trash(P1, { cardType: "unit", energyCost: 3, might: 4, name: "Dead B" }, "deadB")
    .trash(P1, CHARM, "spellA")
    .trash(P1, RIDE_THE_WIND, "spellB")
    .hand(P1, MORBID_RETURN, "morbid")
    .hand(P1, ANNIE_STUBBORN, "annie");
}

describe("Ruling f0f89b61e6f3df94 — the trash card taken by Morbid Return / Annie, Stubborn is a public, respondable target", () => {
  test("premise: the trash is public — P2's own view lists P1's trash cards by identity (nothing redacted)", async () => {
    const game = await board().build();
    const seen = (game.p2.view().zones.trash ?? []).filter((c) => !isHiddenView(c) && c.owner === P1).map((c) => (isHiddenView(c) ? "?" : c.id));
    expect(seen.sort()).toEqual(["deadA", "deadB", "spellA", "spellB"]);
  });

  test("Morbid Return: WHICH unit is named as the spell is cast (a required target: deadA | deadB); the chain item shows targets ['deadB'] in P2's view, and P2 gets priority to respond before it returns to hand", async () => {
    const game = await board().build();
    const field = game.p1.option("cast", "morbid")?.fields.find((f) => f.name === "targets");
    expect(field).toMatchObject({ min: 1, required: true });
    expect((field?.options ?? []).flat().sort()).toEqual(["deadA", "deadB"]);
    await game.p1.cast("morbid", { targets: "deadB" });
    // Opponent's view of the chain names the chosen trash card.
    expect(game.p2.view().chain).toEqual([expect.objectContaining({ cardId: "morbid", controller: P1, targets: ["deadB"] })]);
    expect(game.zoneOf("deadB")).toBe("trash"); // not moved yet — respondable
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // P2's response window
    await game.p2.passPriority();
    expect(game.zoneOf("morbid")).toBe("trash");
    expect(game.zoneOf("deadB")).toBe("hand");
    expect(game.zoneOf("deadA")).toBe("trash");
  });

  test("Annie, Stubborn: her play trigger asks P1 WHICH spell right away (finalization, before anyone has priority); the answer is then visible on the chain item to P2, who gets a response window before the spell comes back", async () => {
    const game = await board().build();
    await game.p1.play("annie");
    expect(game.zoneOf("annie")).toBe("base");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.source?.cardId).toBe("annie");
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(expect.arrayContaining(["spellA", "spellB"]));
    expect(offered).not.toContain("deadA"); // "a spell"
    await game.p1.pick("spellA");
    expect(game.p2.view().chain).toEqual([expect.objectContaining({ cardId: "annie", controller: P1, targets: ["spellA"], triggered: true })]);
    expect(game.zoneOf("spellA")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("spellA")).toBe("hand");
    expect(game.zoneOf("spellB")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
