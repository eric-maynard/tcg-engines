/**
 * Ruling 03861cdfaacd8d59 — Shady Spectacles (VEN-137 → ven-137-166)
 *   Gear · Order · 4: "[Equip] [1][order] (Attach this to a unit you control.) As this is attached to a
 *    unit, choose another friendly unit. The equipped unit becomes a copy of that unit for as long as this
 *    is attached to it."
 *   × Mirror Image (unl-200-219) "Choose a unit. Play a ready Reflection unit token to your base. It becomes
 *     a copy of that unit. Give it [Temporary]." (Deceiver's token works the same way.)
 *
 * Q: Does a Reflection token with Temporary lose Temporary after Shady Spectacles makes it a copy of a unit
 *    that doesn't have Temporary?
 * A: No. Mirror Image/Deceiver first play the token, then make it a copy, THEN grant Temporary — the
 *    keyword is a separate grant, not a copied trait. Shady Spectacles' copy applies in the trait layer;
 *    the keyword grant applies afterwards in the ability layer and, having no duration, lasts as long as
 *    the token is on the board. So the copied token keeps Temporary.
 * Rules: 477.1.b, 477.1.b.1(.b), 477.2, 477.2.a, 801.3.a.3; 816 (Temporary).
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SHADY_SPECTACLES = "ven-137-166";
const MIRROR_IMAGE = "unl-200-219"; // 3 energy + 2 [rainbow] (mind/order hybrid)
const SKULKER = "ogn-175-298"; // Shipyard Skulker — vanilla 3-Might unit, no Temporary

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

const hasTemporary = (game: Game, id: string) =>
  game.state(id).keywords.includes("Temporary") || game.state(id).grantedKeywords.some((k) => k.keyword === "Temporary");

/**
 * A Reflection exactly as Mirror Image leaves it: a ready 2-Might copy of "Small Guy" in P1's base whose
 * Temporary is a separately GRANTED keyword (no duration). Shady Spectacles is in P1's base, un-attached;
 * P1 has exactly the [1][order] Equip cost. Shipyard Skulker (3 Might, no Temporary) is the other friendly unit.
 */
function seededBoard() {
  return scenario()
    .resources(P1, { energy: 1, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Small Guy" }, "refl", {
      grantedKeywords: [{ duration: "permanent", keyword: "Temporary" }],
    })
    .unit(P1, "base", SKULKER, "skulker")
    .gear(P1, SHADY_SPECTACLES, "specs");
}

/** Attach the Spectacles to `unit` through whatever surface the engine exposes for [Equip]. */
async function equipSpecs(game: Game, unit: string): Promise<void> {
  const viaMenu = game.p1.legal().find(
    (o) => (o.moveId === "equipCard" || o.verb === "equip" || o.verb === "activate") && (o.card === "specs" || o.key.includes("specs")),
  );
  if (viaMenu) {
    await game.p1.choose(viaMenu.key, { targets: unit, params: { unitId: unit, equipmentId: "specs" } }, { answers: [unit] });
  } else {
    await game.p1.do("equipCard", { equipmentId: "specs", playerId: P1, unitId: unit });
  }
}

describe("Ruling 03861cdfaacd8d59 — a Temporary Reflection copied again by Shady Spectacles keeps Temporary", () => {
  // Expected (the ruling's premise, 477.2.a): Mirror Image's Reflection is a copy of the chosen unit (name
  // "Small Guy", 2 Might, a unit) whose Temporary is a separately granted keyword.
  // Actual: the engine's Mirror Image asks for no unit, and the token it makes is a 0-Might copy of the
  // Mirror Image SPELL with no Temporary at all.
  test.failing("BUG: ruling 03861cdfaacd8d59 (premise) — Mirror Image's Reflection should be a unit copy of the chosen unit carrying a GRANTED Temporary; engine makes a spell-copy token without Temporary", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { rainbow: 2 } })
      .unit(P1, "base", { might: 2, name: "Small Guy" }, "small")
      .hand(P1, MIRROR_IMAGE, "mirror")
      .build();
    const before = game.p1.base();
    await game.p1.cast("mirror", { answers: ["small"], targets: "small" });
    let stop = await game.settle();
    if (stop.reason === "unanswered") {
      expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
      await game.p1.pick("small");
      stop = await game.settle();
    }
    const token = game.p1.base().find((id) => !before.includes(id));
    expect(token).toBeDefined();
    const t = game.state(token as string);
    expect(t.isToken).toBe(true);
    expect(t.cardType).toBe("unit");
    expect(t.name).toBe("Small Guy");
    expect(t.might).toBe(2);
    expect(t.isReady).toBe(true);
    // Temporary is there, and it is a GRANT layered on top of the copy — not a copied/printed trait.
    expect(t.grantedKeywords.map((k) => k.keyword)).toContain("Temporary");
  });

  test("premise (seeded): the Reflection reads as a 2-Might 'Small Guy' with a granted Temporary; the Skulker has no Temporary", async () => {
    const game = await seededBoard().build();
    expect(game.state("refl").name).toBe("Small Guy");
    expect(game.state("refl").might).toBe(2);
    expect(hasTemporary(game, "refl")).toBe(true);
    expect(game.state("refl").grantedKeywords).toEqual([expect.objectContaining({ keyword: "Temporary" })]);
    expect(hasTemporary(game, "skulker")).toBe(false);
    expect(game.state("specs").keywords).toContain("Equip");
    expect(game.state("specs").attachedTo).toBeUndefined();
  });

  // Expected: [Equip] [1][order] attaches the Spectacles to the Reflection (P1 pays exactly [1][order]) and,
  // "as this is attached", P1 is asked to choose ANOTHER friendly unit — the Skulker is offered, the
  // Reflection itself is not.
  // Actual: the engine exposes no Equip action for Shady Spectacles (it is loaded as plain "gear", and the
  // raw equipCard move rejects non-"equipment" cards), so it can never be attached.
  test.failing("BUG: ruling 03861cdfaacd8d59 — Shady Spectacles cannot be equipped at all; expected: attach to the Reflection for [1][order], then a P1 pick of ANOTHER friendly unit (Skulker offered, Reflection not)", async () => {
    const game = await seededBoard().build();
    await equipSpecs(game, "refl");
    expect(game.state("specs").attachedTo).toBe("refl");
    expect(game.state("refl").attachments).toContain("specs");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    const d = game.decision() as Extract<Decision, { kind: "pick" }>;
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d.options.map((o) => o.card ?? o.key);
    expect(offered).toContain("skulker");
    expect(offered).not.toContain("refl"); // "another friendly unit"
    await game.p1.pick("skulker");
  });

  // Expected (the ruling): after choosing the Skulker the Reflection becomes a copy of Shipyard Skulker
  // (name, 3 Might, its — empty — keyword line) yet KEEPS its separately granted Temporary (477.2 after
  // 477.1.b), and that Temporary still works: the token is killed at the start of P1's next Beginning Phase.
  // Actual: unreachable — the Spectacles cannot be attached (see above).
  test.failing("BUG: ruling 03861cdfaacd8d59 — Reflection copied into 'Shipyard Skulker' (3 Might) by Shady Spectacles must STILL have Temporary and still die at P1's next Beginning Phase; engine cannot equip the Spectacles", async () => {
    const game = await seededBoard().build();
    await equipSpecs(game, "refl");
    let stop = await game.settle();
    if (stop.reason === "unanswered") {
      await game.p1.pick("skulker");
      stop = await game.settle();
    }
    expect(stop.reason).toBe("open");
    expect(game.state("specs").attachedTo).toBe("refl");
    // Trait layer: now a Skulker …
    expect(game.state("refl").name).toBe("Shipyard Skulker");
    expect(game.state("refl").might).toBe(3); // Shady Spectacles itself grants +0 Might
    // … ability layer: the granted Temporary survives the copy.
    expect(hasTemporary(game, "refl")).toBe(true);
    expect(game.state("refl").grantedKeywords.map((k) => k.keyword)).toContain("Temporary");
    expect(hasTemporary(game, "skulker")).toBe(false); // the source is untouched
    // And it is a live Temporary: P2's turn passes, then at the start of P1's turn the token is killed.
    await game.advanceTurn(); // → P2
    expect(game.zoneOf("refl")).toBe("base");
    await game.advanceTurn(); // → P1: Beginning Phase kills the Temporary unit before P1's main phase opens
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.units("base")).not.toContain("refl");
    expect(game.zoneOf("skulker")).toBe("base");
  });
});
