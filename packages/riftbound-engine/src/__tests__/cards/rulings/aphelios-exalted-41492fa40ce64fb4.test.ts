/**
 * Ruling 41492fa40ce64fb4 — Aphelios, Exalted (SFD-049 → sfd-049-221)
 *   "When you attach an Equipment to me, choose one that hasn't been chosen this turn — Ready 2 runes.
 *    Channel 1 rune exhausted. Buff a friendly unit."
 *   × Svellsongur (sfd-059-221, Equipment) "As this is attached to a unit, copy that unit's text to this
 *     Equipment's effect text for as long as this is attached to it."
 *   × Shady Spectacles (VEN-137 → ven-137-166) "As this is attached to a unit, choose another friendly
 *     unit. The equipped unit becomes a copy of that unit for as long as this is attached to it."
 *
 * Q: How does Aphelios interact with Svellsongur and Shady Spectacles?
 * A: Aphelios triggers exactly ONCE when either is attached to him — the "as attached" copy is a
 *    replacement that adds a copy action to the single attachment event, not a second attachment; the
 *    trigger is created before the copy happens and copied text does not look back. A DIFFERENT unit
 *    that becomes a copy of Aphelios via Shady Spectacles does not trigger at all (it lacked the ability
 *    when the attachment event occurred).
 * Rules: 369.1, 370.1.b.1, 370.1.a.2, 383.2.c, 401.1, 401.2.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const APHELIOS = "sfd-049-221";
const SVELLSONGUR = "sfd-059-221";
const SHADY_SPECTACLES = "ven-137-166";

/** Aphelios trigger items currently on the chain. */
const apheliosTriggers = (game: Game) => game.chain().filter((i) => i.cardId === "aph" && i.triggered);

function svellBoard() {
  return scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } }) // Svellsongur's Equip cost [1][calm]
    .unit(P1, "base", APHELIOS, "aph")
    .unit(P1, "base", { might: 2, name: "Bystander" }, "ally")
    .gear(P1, SVELLSONGUR, "svell");
}

describe("Ruling 41492fa40ce64fb4 — Aphelios, Exalted × Svellsongur / Shady Spectacles", () => {
  test("Svellsongur attached to Aphelios: exactly ONE Aphelios trigger is put on the chain (383.2.c, 401.1)", async () => {
    const game = await svellBoard().build();
    await game.p1.do("equipCard", { equipmentId: "svell", unitId: "aph" });
    // The attachment happened and Svellsongur's replacement copied Aphelios's text …
    expect(game.state("svell").attachedTo).toBe("aph");
    expect(game.state("aph").attachments).toEqual(["svell"]);
    expect(game.state("svell").meta.copiedFromCardId).toBe("aph");
    // … yet only one pending trigger exists: the copy is not a second attachment event (370.1.a.2).
    expect(apheliosTriggers(game)).toHaveLength(1);
    expect(game.chain()).toHaveLength(1);
    expect(game.chain().filter((i) => i.cardId === "svell")).toHaveLength(0);
  });

  test("Svellsongur: the single trigger resolves once (one mode choice for P1) and no second trigger ever appears", async () => {
    const game = await svellBoard().build();
    await game.p1.do("equipCard", { equipmentId: "svell", unitId: "aph" });
    expect(apheliosTriggers(game)).toHaveLength(1);
    await game.p1.passPriority();
    await game.p2.passPriority();
    // Aphelios's "choose one" is P1's decision.
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const labels = d?.kind === "pick" ? d.options.map((o) => o.label) : [];
    expect(labels).toEqual(expect.arrayContaining(["Ready 2 runes", "Channel 1 rune exhausted", "Buff a friendly unit"]));
    await game.p1.chooseMode(2); // Buff a friendly unit
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("aph");
    }
    await game.settle();
    // One resolution only: chain is empty, we're back in P1's open main phase, no copied-text re-trigger.
    expect(game.chain()).toEqual([]);
    expect(apheliosTriggers(game)).toHaveLength(0);
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1, context: "main" });
    // Exactly one unit got buffed by the single resolution.
    const buffed = ["aph", "ally"].filter((id) => game.state(id).isBuffed);
    expect(buffed).toHaveLength(1);
    expect(game.violations()).toEqual([]);
  });

  // Expected: Shady Spectacles is an Equipment; attaching it to Aphelios (choosing "ally" as the unit to
  // copy) is ONE attachment event → exactly one Aphelios trigger, created before he becomes a copy.
  // Actual: ven-137-166 is typed "gear" with an unparsed (raw) copy effect — equipCard rejects it, so it
  // can never be attached.
  test.failing("BUG: ruling 41492fa40ce64fb4 — Shady Spectacles attached to Aphelios triggers him exactly once (engine: cannot attach ven-137-166 at all)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { order: 1 } })
      .unit(P1, "base", APHELIOS, "aph")
      .unit(P1, "base", { might: 2, name: "Bystander" }, "ally")
      .gear(P1, SHADY_SPECTACLES, "shady")
      .script(P1, ["ally"]) // "choose another friendly unit" for the copy
      .build();
    await game.p1.do("equipCard", { equipmentId: "shady", unitId: "aph" });
    expect(game.state("shady").attachedTo).toBe("aph");
    expect(apheliosTriggers(game)).toHaveLength(1);
  });

  // Expected: attaching Shady Spectacles to "ally" and choosing Aphelios makes ally a copy of Aphelios,
  // but ally did not have the ability when the attachment event occurred → NO trigger from ally (and
  // none from Aphelios, who was not equipped). Actual: the attach itself is rejected (see above), so the
  // scenario cannot be reached; the assertions on the copy never hold.
  test.failing("BUG: ruling 41492fa40ce64fb4 — a unit that becomes a copy of Aphelios via Shady Spectacles does not trigger (engine: cannot attach ven-137-166)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { order: 1 } })
      .unit(P1, "base", APHELIOS, "aph")
      .unit(P1, "base", { might: 2, name: "Bystander" }, "ally")
      .gear(P1, SHADY_SPECTACLES, "shady")
      .script(P1, ["aph"]) // the unit to copy
      .build();
    await game.p1.do("equipCard", { equipmentId: "shady", unitId: "ally" });
    expect(game.state("shady").attachedTo).toBe("ally");
    // ally is now a copy of Aphelios …
    expect(game.state("ally").name).toBe("Aphelios, Exalted");
    // … but nothing triggered: no chain item from ally or from Aphelios.
    expect(game.chain().filter((i) => i.triggered)).toHaveLength(0);
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1, context: "main" });
  });
});
