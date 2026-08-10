/**
 * Ruling 15d12a27307a549a — Crescent Strike (UNL-072 → unl-072-219) · Spell · Mind · 3 + [mind] · [Action]
 *   "Choose a battlefield and an enemy unit there. Deal 4 to that unit and 1 to each other enemy unit there."
 *   × Alpha Wildclaw (UNL-057 → unl-057-219) · Unit · 7 · [Tank]
 *     "Your units here with less Might than me can't be chosen by enemy spells and abilities."
 *
 * Q: Can Crescent Strike's 1 damage hit units at a battlefield where an Alpha Wildclaw out-mights them all?
 * A: Yes. Only the 4-damage unit is CHOSEN; the "each other enemy unit there" splash selects by criteria, not by
 *    choice, so Wildclaw's "can't be chosen" protection does not stop it. (And Wildclaw only ever protects its
 *    controller's own units — a Wildclaw on the caster's side is irrelevant.)
 * Rules: 355.5 / 355.5.a (choosing vs. affecting by criteria).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CRESCENT_STRIKE = "unl-072-219";
const ALPHA_WILDCLAW = "unl-057-219";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

function targetsOffered(game: Game, alias: string): string[] {
  const opt = game.p1.option("cast", alias);
  const field = opt?.fields.find((f) => f.name === "targets" || f.arg === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

describe("Ruling 15d12a27307a549a — Crescent Strike's splash is not a 'choice', so Alpha Wildclaw can't shield units from it", () => {
  /** P1's turn, 3 + [mind]. P2 holds bf1 with Alpha Wildclaw (7) + two small units (2, 3). */
  function enemyWildclaw() {
    return scenario()
      .resources(P1, { energy: 3, power: { mind: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", ALPHA_WILDCLAW, "claw")
      .unit(P2, "bf1", { might: 2, name: "Cub A" }, "cubA")
      .unit(P2, "bf1", { might: 3, name: "Cub B" }, "cubB")
      .hand(P1, CRESCENT_STRIKE, "strike");
  }

  test("premise: Wildclaw's static makes the smaller enemy units un-choosable — Crescent Strike may only CHOOSE the Wildclaw itself", async () => {
    const game = await enemyWildclaw().build();
    expect(game.state("claw").might).toBe(7);
    expect(game.p1.can("cast", "strike")).toBe(true);
    const offered = targetsOffered(game, "strike");
    expect(offered).toContain("claw");
    expect(offered).not.toContain("cubA");
    expect(offered).not.toContain("cubB");
  });

  test("choosing the Wildclaw: it takes 4, and EACH OTHER enemy unit there still takes the 1 splash despite 'can't be chosen' (355.5.a)", async () => {
    const game = await enemyWildclaw().build();
    await game.p1.cast("strike", { targets: "claw" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.zoneOf("strike")).toBe("trash");
    expect(game.state("claw").damage).toBe(4);
    expect(game.zoneOf("claw")).toBe("battlefield-bf1"); // 4 < 7
    expect(game.state("cubA").damage).toBe(1);
    expect(game.zoneOf("cubA")).toBe("battlefield-bf1"); // 1 < 2
    expect(game.state("cubB").damage).toBe(1);
    expect(game.zoneOf("cubB")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });

  test("a Wildclaw on the CASTER's side protects only 'your units' — every enemy unit there is choosable and the splash lands on all the others", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { mind: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", ALPHA_WILDCLAW, "claw")
      .unit(P2, "bf1", { might: 2, name: "Foe A" }, "foeA")
      .unit(P2, "bf1", { might: 3, name: "Foe B" }, "foeB")
      .unit(P2, "bf1", { might: 1, name: "Foe C" }, "foeC")
      .hand(P1, CRESCENT_STRIKE, "strike")
      .build();
    const offered = targetsOffered(game, "strike");
    expect(offered.sort()).toEqual(["foeA", "foeB", "foeC"]);
    await game.p1.cast("strike", { targets: "foeB" });
    await game.settle();
    expect(game.zoneOf("foeB")).toBe("trash"); // 4 ≥ 3
    expect(game.state("foeA").damage).toBe(1);
    expect(game.zoneOf("foeA")).toBe("battlefield-bf1");
    expect(game.zoneOf("foeC")).toBe("trash"); // 1 ≥ 1
    expect(game.state("claw").damage).toBe(0); // friendly — never hit
    expect(game.violations()).toEqual([]);
  });
});
