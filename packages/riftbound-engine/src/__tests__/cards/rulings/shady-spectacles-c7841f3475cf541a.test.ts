/**
 * Ruling c7841f3475cf541a — Shady Spectacles (VEN-137 → ven-137-166) · Gear · [4] · "[Equip] [1][order] ·
 *   As this is attached to a unit, choose another friendly unit. The equipped unit becomes a copy of that
 *   unit for as long as this is attached to it."
 *   × Serene Ascetic (VEN-030 → ven-030-166) · Unit · [3] · 3 Might · "[Empower] [3] · [Empowered][>] I have
 *     [Deflect] and [Shield 3]." (the unit being copied, Empowered first)
 *
 * Q: Does Shady Spectacles copy the Empowered status of the chosen unit?
 * A: No. A copy effect copies only COPYABLE traits — the printed (or previously copied) name, type, Might,
 *    rules text and keywords. Empowered is a granted/appended status, not a printed trait, so it is
 *    invisible to the copy: the equipped unit arrives un-Empowered and its [Empowered] abilities are off.
 *    It can be Empowered separately afterwards.
 * Rules: 472.1.b.3 / 477.1.b / 477.2 (copy effects copy copyable traits; granted traits are excluded),
 *        827 (Empower is an activated ability granting a status).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const SHADY_SPECTACLES = "ven-137-166";
const SERENE_ASCETIC = "ven-030-166";

/** P1: the Ascetic (to be Empowered and copied), a 1-Might holder, and the Spectacles waiting in base. */
function specsAndAscetic() {
  return scenario()
    .resources(P1, { energy: 7, power: { order: 1 } })
    .unit(P1, "base", SERENE_ASCETIC, "model")
    .unit(P1, "base", { might: 1, name: "Holder" }, "holder")
    .gear(P1, SHADY_SPECTACLES, "specs");
}

describe("Ruling c7841f3475cf541a — the copy takes printed traits, never the Empowered status", () => {
  test("the model is genuinely Empowered first, with its [Empowered] keywords live", async () => {
    const game = await specsAndAscetic().build();
    await game.p1.activate("model", 0); // [Empower] [3]
    await game.settle();
    expect(game.state("model").isEmpowered).toBe(true);
    expect(game.state("model").keywords.toSorted()).toEqual(["Deflect", "Shield"]);
  });

  test("equipping the Spectacles copies name and Might but NOT Empowered, so no [Deflect] / [Shield 3]", async () => {
    const game = await specsAndAscetic().build();
    await game.p1.activate("model", 0);
    await game.settle();
    await game.p1.do("equipCard", { equipmentId: "specs", playerId: P1, unitId: "holder" });
    await game.settle();
    const holder = game.state("holder");
    expect(holder.name).toBe("Serene Ascetic"); // printed traits copied…
    expect(holder.baseMight).toBe(3);
    expect(holder.isEmpowered).toBe(false); // …granted status not copied
    expect(holder.keywords).toEqual([]);
    expect(game.state("model").isEmpowered).toBe(true); // the original is untouched
    expect(game.violations()).toEqual([]);
  });

  test("the copy can be Empowered separately afterwards — then it does get the [Empowered] keywords", async () => {
    const game = await specsAndAscetic().build();
    await game.p1.activate("model", 0);
    await game.settle();
    await game.p1.do("equipCard", { equipmentId: "specs", playerId: P1, unitId: "holder" });
    await game.settle();
    expect(game.p1.can("activate", "holder")).toBe(true); // it copied the [Empower] ability too
    await game.p1.activate("holder", 0);
    await game.settle();
    expect(game.state("holder").isEmpowered).toBe(true);
    expect(game.state("holder").keywords.toSorted()).toEqual(["Deflect", "Shield"]);
  });

  test("copying an UN-Empowered model is the same picture — the status simply never travels", async () => {
    const game = await specsAndAscetic().build();
    await game.p1.do("equipCard", { equipmentId: "specs", playerId: P1, unitId: "holder" });
    await game.settle();
    expect(game.state("model").isEmpowered).toBe(false);
    expect(game.state("holder")).toMatchObject({ baseMight: 3, isEmpowered: false, name: "Serene Ascetic" });
  });
});
