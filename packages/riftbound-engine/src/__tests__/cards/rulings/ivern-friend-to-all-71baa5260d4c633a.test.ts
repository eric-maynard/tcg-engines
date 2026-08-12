/**
 * Ruling 71baa5260d4c633a — Ivern, Friend to All (UNL-177 → unl-177-219) · Unit · Order · [6] · 6 Might
 *     "As you play me, choose Bird, Cat, Dog, or Poro. I gain that tag.
 *      When I conquer or hold, score 1 point if your units have all of the following tags among them — Bird, Cat, Dog and Poro."
 *
 * Q: When Ivern goes to the trash, does he lose the extra tag he was given?
 * A: Yes. The gained tag is a temporary modification on the object; moving to a Non-Board zone stops every temporary
 *    modification from being tracked, so the trashed (or bounced) card is a plain Ivern again.
 * Rules: 110 (temporary modifications cease on a change to/from a Non-Board zone), 762 (naming), 383.4.d (hold).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const IVERN = "unl-177-219";
const BIRD_TOKEN = "unl-t02";

/** Inline [1] action spells: kill a unit / return a unit to its owner's hand. */
const SLAY = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "order",
  energyCost: 1,
  name: "Test Slay",
  timing: "action",
};
const RECALL = {
  abilities: [{ effect: { target: { type: "unit" }, type: "return-to-hand" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "order",
  energyCost: 1,
  name: "Test Recall",
  timing: "action",
};

describe("Ruling 71baa5260d4c633a — Ivern loses his named tag the moment he leaves the board", () => {
  test("playing him: the tag is chosen from the printed four and recorded on the card while it is on the board", async () => {
    const game = await scenario().resources(P1, { energy: 6 }).hand(P1, IVERN, "ivern").build();
    await game.p1.play("ivern", { to: "base" });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "name", seat: P1 });
    expect(d?.kind === "name" ? [...d.vocabulary].sort() : []).toEqual(["Bird", "Cat", "Dog", "Poro"]);
    await game.p1.name("Dog");
    await game.settle();
    expect(game.zoneOf("ivern")).toBe("base");
    expect(game.state("ivern").meta.namedTag).toBe("Dog");
  });

  test("the tag is live while he is on the board: Ivern-as-Dog beside a Bird, a Cat and a Poro scores his extra point on a hold", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", IVERN, "ivern", { namedTag: "Dog" } as Record<string, unknown>)
      .unit(P1, "bf1", BIRD_TOKEN, "bird")
      .unit(P1, "bf1", { might: 2, name: "Test Cat", tags: ["Cat"] }, "cat")
      .unit(P1, "bf1", { might: 1, name: "Test Poro", tags: ["Poro"] }, "poro")
      .build();
    expect(game.state("ivern").meta.namedTag).toBe("Dog");
    await game.advanceTurn();
    expect(game.p1.points()).toBe(2); // 1 hold + 1 Ivern (Bird, Cat, Dog, Poro all present)
  });

  // Expected (rule 110): once Ivern reaches the trash the named tag is no longer tracked on the card.
  // Actual: the engine leaves `namedTag` on the card's meta after it changes to a Non-Board zone.
  test("ruling 71baa5260d4c633a — killed Ivern keeps his named tag in the trash (rule 110 says it stops being tracked)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .unit(P1, "base", IVERN, "ivern", { namedTag: "Dog" } as Record<string, unknown>)
      .hand(P1, SLAY, "slay")
      .build();
    expect(game.state("ivern").meta.namedTag).toBe("Dog");
    await game.p1.cast("slay", { targets: "ivern" });
    await game.settle();
    expect(game.zoneOf("ivern")).toBe("trash");
    expect(game.state("ivern").meta.namedTag).toBeUndefined();
    expect(game.violations()).toEqual([]);
  });

  // Same deviation on the other Non-Board zone: bouncing him to hand should also drop the tag (rule 110).
  test("ruling 71baa5260d4c633a — Ivern bounced to hand keeps his named tag", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .unit(P1, "base", IVERN, "ivern", { namedTag: "Poro" } as Record<string, unknown>)
      .hand(P1, RECALL, "recall")
      .build();
    await game.p1.cast("recall", { targets: "ivern" });
    await game.settle();
    expect(game.zoneOf("ivern")).toBe("hand");
    expect(game.state("ivern").meta.namedTag).toBeUndefined();
    expect(game.violations()).toEqual([]);
  });
});
