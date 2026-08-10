/**
 * Ruling c57c50eaf580eed7 — Shady Spectacles (VEN-137 → ven-137-166) · Gear · Order · 4
 *     "[Equip] [1][order]. As this is attached to a unit, choose another friendly unit. The equipped unit becomes a copy
 *      of that unit for as long as this is attached to it."
 *   × Sprite (ogn-274-298, 3-Might token with PRINTED [Temporary]) × Reflection (unl-t06) as made by Deceiver
 *     (unl-199-219) / Mirror Image (unl-200-219): "… It becomes a copy of that unit. Give it [Temporary]."
 *
 * Q: Does equipping Shady Spectacles to a Temporary unit (Sprite / Reflection) remove Temporary?
 * A: Depends on printed vs granted. The copy is a Layer-1 (trait) effect and overwrites copyable/printed traits only;
 *    granted keywords are Layer 2 and sit on top. So: a Sprite copying a non-Temporary unit LOSES its printed
 *    Temporary; a Reflection whose Temporary was GRANTED keeps it; and copying a Reflection that has a granted
 *    Temporary does NOT give the copier Temporary (grants are not copyable).
 * Rules: 477.1.b / 477.1.b.1.a–b (copy = copyable traits, in the trait layer), 477.2 (ability-granting layer),
 *        816 (Temporary), 719 (Equip).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SHADY_SPECTACLES = "ven-137-166";
const SPRITE = "ogn-274-298";
const SKULKER = "ogn-175-298"; // Shipyard Skulker — vanilla 3 Might, no Temporary

const hasTemporary = (game: Game, id: string) =>
  game.state(id).keywords.includes("Temporary") || game.state(id).grantedKeywords.some((k) => k.keyword === "Temporary");

/** Attach the Spectacles (alias "specs") to `unit`, resolve the Equip item, and answer "choose another friendly unit". */
async function equipSpecsCopying(game: Game, unit: string, copyOf: string): Promise<void> {
  const viaMenu = game.p1
    .legal()
    .find((o) => (o.moveId === "equipCard" || o.verb === "equip" || o.verb === "activate") && (o.card === "specs" || o.key.includes("specs")));
  if (viaMenu) {
    await game.p1.choose(viaMenu.key, { params: { equipmentId: "specs", unitId: unit }, targets: unit }, { answers: [unit] });
  } else {
    await game.p1.do("equipCard", { equipmentId: "specs", playerId: P1, unitId: unit });
  }
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      const offered = d.options.map((o) => o.card ?? o.key);
      expect(offered).toContain(copyOf);
      expect(offered).not.toContain(unit); // "another friendly unit"
      await game.p1.pick(copyOf);
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  expect(game.state("specs").attachedTo).toBe(unit);
  expect(game.chain()).toEqual([]);
}

describe("Ruling c57c50eaf580eed7 — Shady Spectacles' copy overwrites PRINTED Temporary but not a GRANTED one", () => {
  test("printed: a Sprite token (printed [Temporary]) wearing the Spectacles as a copy of Shipyard Skulker LOSES Temporary — and so survives its controller's next Beginning Phase", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { order: 1 } })
      .unit(P1, "base", SPRITE, "sprite")
      .unit(P1, "base", SKULKER, "skulker")
      .unit(P2, "base", { might: 1, name: "Bystander" }, "bystander")
      .gear(P1, SHADY_SPECTACLES, "specs")
      .build();
    expect(game.state("sprite").keywords).toContain("Temporary"); // printed
    expect(game.state("sprite").grantedKeywords).toEqual([]);
    await equipSpecsCopying(game, "sprite", "skulker");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.state("sprite").name).toBe("Shipyard Skulker");
    expect(game.state("sprite").might).toBe(3);
    expect(hasTemporary(game, "sprite")).toBe(false);
    // Live check: Temporary would kill it at the start of P1's next Beginning Phase — it does not.
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("sprite")).toBe("base");
    expect(game.state("specs").attachedTo).toBe("sprite");
    expect(game.violations()).toEqual([]);
  });

  test("granted: a Reflection whose Temporary was GRANTED (Deceiver / Mirror Image) keeps Temporary after the Spectacles make it a copy of Shipyard Skulker — and still dies at P1's next Beginning Phase", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { order: 1 } })
      .unit(P1, "base", { might: 2, name: "Small Guy" }, "refl", { grantedKeywords: [{ duration: "permanent", keyword: "Temporary" }] })
      .unit(P1, "base", SKULKER, "skulker")
      .unit(P2, "base", { might: 1, name: "Bystander" }, "bystander")
      .gear(P1, SHADY_SPECTACLES, "specs")
      .build();
    expect(game.state("refl").grantedKeywords).toEqual([expect.objectContaining({ keyword: "Temporary" })]);
    await equipSpecsCopying(game, "refl", "skulker");
    expect(game.state("refl").name).toBe("Shipyard Skulker");
    expect(game.state("refl").might).toBe(3);
    expect(hasTemporary(game, "refl")).toBe(true);
    expect(game.state("refl").grantedKeywords.map((k) => k.keyword)).toContain("Temporary");
    await game.advanceTurn(); // → P2
    expect(game.zoneOf("refl")).toBe("base");
    await game.advanceTurn(); // → P1: Temporary kills it before the main phase
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.units("base")).not.toContain("refl");
    expect(game.zoneOf("skulker")).toBe("base");
  });

  test("copying a granted keyword: the Skulker wearing the Spectacles as a copy of a Reflection-with-granted-Temporary does NOT gain Temporary (grants are not copyable traits) — it takes the Reflection's copyable traits only and survives P1's next Beginning Phase", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { order: 1 } })
      .unit(P1, "base", { might: 2, name: "Small Guy" }, "refl", { grantedKeywords: [{ duration: "permanent", keyword: "Temporary" }] })
      .unit(P1, "base", SKULKER, "skulker")
      .unit(P2, "base", { might: 1, name: "Bystander" }, "bystander")
      .gear(P1, SHADY_SPECTACLES, "specs")
      .build();
    await equipSpecsCopying(game, "skulker", "refl");
    expect(game.state("skulker").name).toBe("Small Guy");
    expect(game.state("skulker").might).toBe(2);
    expect(hasTemporary(game, "skulker")).toBe(false);
    expect(hasTemporary(game, "refl")).toBe(true); // the source keeps its own grant
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1: only the Reflection dies
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("skulker")).toBe("base");
    expect(game.p1.units("base")).not.toContain("refl");
    expect(game.violations()).toEqual([]);
  });
});
