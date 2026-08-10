/**
 * Ruling 7d34e58b51bbb90d — Brush (UNL-T03 → unl-t03) · Battlefield token · "Bird, Cat, Dog, Poro, and Ivern units here have +1
 *   [Might]. …"   × Ivern, Friend to All (UNL-177 → unl-177-219) · 6 Might · Ivern · "As you play me, choose Bird, Cat, Dog, or Poro.
 *   I gain that tag. …"   (Bird token unl-t02 is one of the listed tags.)
 *
 * Q: Ivern carries the Ivern tag AND (say) the Bird tag — does Brush give him +1 twice?
 * A: No. Brush checks whether a unit has ANY of the listed tags; a unit matching several still gets a single +1.
 * Rules: 184.8 / 187.8 (Brush token text), 476 (passive Might modification applies once per ability, not per matching tag).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BRUSH = "unl-t03";
const IVERN = "unl-177-219";
const STALWART_PORO = "ogn-052-298"; // 2-Might Poro — single-tag control

/** P1's turn 3. P1 controls a live Brush (held by a Stalwart Poro); Ivern in hand with [6]. */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 6 })
    .battlefield("brush", { controller: P1, def: BRUSH, inert: false })
    .unit(P1, "brush", STALWART_PORO, "poro")
    .unit(P1, "brush", { might: 2, name: "Plain" }, "plain") // no listed tag
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .hand(P1, IVERN, "ivern");
}

describe("Ruling 7d34e58b51bbb90d — Brush's +1 is per unit, not per matching tag", () => {
  test("premise: at Brush the single-tag Poro reads 2+1 = 3 and the untagged Plain stays 2", async () => {
    const game = await board().build();
    expect(game.state("brush").name).toBe("Brush");
    expect(game.state("poro").might).toBe(3);
    expect(game.state("plain").might).toBe(2);
  });

  test("Ivern played to Brush naming 'Bird' carries BOTH the Ivern and Bird tags, yet reads 6 + 1 = 7 — not 8", async () => {
    const game = await board().build();
    await game.p1.play("ivern", { to: "brush" });
    // "As you play me, choose …" — P1 names the tag.
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (d?.kind === "name" && d.seat === P1) {
        expect([...d.vocabulary].toSorted()).toEqual(["Bird", "Cat", "Dog", "Poro"]);
        await game.p1.name("Bird");
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.zoneOf("ivern")).toBe("battlefield-brush");
    expect(game.p1.energy()).toBe(0);
    // He has gained Bird on top of his printed Ivern tag …
    expect(game.state("ivern").meta.namedTag).toBe("Bird");
    // … and still gets exactly ONE +1 from Brush.
    expect(game.state("ivern").baseMight).toBe(6);
    expect(game.state("ivern").might).toBe(7);
    expect(game.state("poro").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });
});
