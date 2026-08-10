/**
 * Ruling 342f98cde7b20acf — Svellsongur (SFD-059 → sfd-059-221) Equipment "[Equip] [1][calm] … As this is attached to a
 *   unit, copy that unit's text to this Equipment's effect text for as long as this is attached to it."
 *   × Ivern, Friend to All (UNL-177 → unl-177-219) "As you play me, choose Bird, Cat, Dog, or Poro. I gain that tag. …"
 *   (unl-t02 is the tag-bearing token family the tags refer to; not needed on the board.)
 *
 * Q: If Svellsongur is attached to Ivern, does Svellsongur get to pick a tag?
 * A: No. Svellsongur copies Ivern's text including "As you play me, choose …", but that only functions while the
 *    card itself is being PLAYED from hand. Svellsongur is already on the board when it is attached, so the condition
 *    is never met — no choice is offered and it gains no tag.
 * Rules: 135.2.b.3 / 762 ("As you play me" is part of playing the card), 718 (copied effect text), Equip (434).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const SVELLSONGUR = "sfd-059-221";
const IVERN = "unl-177-219";

describe("Ruling 342f98cde7b20acf — Svellsongur attached to Ivern does not get to choose a tag", () => {
  test("premise: playing IVERN himself from hand surfaces the 'choose Bird/Cat/Dog/Poro' decision to P1 as he is played, and the tag is recorded on him", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { order: 1 } })
      .battlefield("bf1", { controller: null })
      .hand(P1, IVERN, "ivern")
      .build();
    await game.p1.play("ivern", { to: "base" });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "name", seat: P1 });
    expect(d?.kind === "name" ? [...d.vocabulary].sort() : []).toEqual(["Bird", "Cat", "Dog", "Poro"]);
    await game.p1.name("Dog");
    await game.settle();
    expect(game.zoneOf("ivern")).toBe("base");
    expect(game.state("ivern").meta.namedTag).toBe("Dog");
  });

  test("equipping Svellsongur to an Ivern already on the board: the [Equip] resolves, Svellsongur attaches and copies Ivern's text — but NO tag choice is ever offered and Svellsongur gains no tag", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { calm: 1 } }) // exactly the Equip cost
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", IVERN, "ivern", { namedTag: "Bird" } as Record<string, unknown>) // Ivern was played earlier naming Bird
      .gear(P1, SVELLSONGUR, "svell")
      .build();
    expect(game.state("ivern").meta.namedTag).toBe("Bird");
    await game.p1.do("equipCard", { equipmentId: "svell", unitId: "ivern" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    // Walk the Equip activation off the chain by hand so any interposed prompt would be seen.
    let sawTagPrompt = false;
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (!d) {
        break;
      }
      if (d.kind === "name" || (d.kind === "pick" && d.options.some((o) => /bird|cat|dog|poro/i.test(o.label)))) {
        sawTagPrompt = true;
        break;
      }
      if (d.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
        continue;
      }
      break;
    }
    expect(sawTagPrompt).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    // Attached, text copied …
    expect(game.state("svell")).toMatchObject({ attachedTo: "ivern", zone: "base" });
    expect(game.state("svell").meta.copiedFromCardId).toBe("ivern");
    expect(game.state("ivern").attachments).toEqual(["svell"]);
    // … but no tag was gained by the Equipment, and Ivern's own earlier choice is untouched.
    expect(game.state("svell").meta.namedTag).toBeUndefined();
    expect(game.state("ivern").meta.namedTag).toBe("Bird");
    expect(game.violations()).toEqual([]);
  });
});
