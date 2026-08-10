/**
 * Ruling 2b44356e2bc5c0e9 — Riven, Shattered (VEN-041 → ven-041-166) · 3 Might "[Weaponmaster] When I attack, choose an
 *   enemy unit here. Deal 2 to it for each Equipment attached to me."
 *   × Svellsongur (SFD-059 → sfd-059-221) · Equipment +0 "[Equip][1][calm] As this is attached to a unit, copy that unit's
 *     text to this Equipment's effect text…"
 *   × Cull (SFD-134 → sfd-134-221) · Equipment +1 "[Equip][chaos] When I conquer, play a Gold gear token exhausted."
 *   (ruling also cites Ezreal, Dashing sfd-082-221 as the same principle.)
 *
 * Q: Riven carries Svellsongur and Cull and attacks. Can I target two DIFFERENT units with her ability?
 * A: Yes. Svellsongur copies Riven's "When I attack" text, so the attack produces two independent triggers, each
 *    choosing its own enemy unit here. Cull adds no trigger but counts as Equipment: each trigger deals 2 × 2 = 4.
 * Rules: 383 (each triggered ability is its own chain item with its own choice), 718 / Svellsongur copy text.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIVEN = "ven-041-166";
const SVELLSONGUR = "sfd-059-221";
const CULL = "sfd-134-221";

/**
 * P1's turn. P2 holds bf1 with Foe A and Foe B (5 Might each — they survive 4 so the damage can be read).
 * P1: Riven (3) in base, Svellsongur and Cull loose in base, exactly [1][calm] + [chaos] for the two Equips.
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 5, name: "Foe A" }, "foeA")
    .unit(P2, "bf1", { might: 5, name: "Foe B" }, "foeB")
    .unit(P1, "base", RIVEN, "riven")
    .gear(P1, SVELLSONGUR, "svell")
    .gear(P1, CULL, "cull")
    .resources(P1, { energy: 1, power: { calm: 1, chaos: 1 } });
}

/** Equip both onto Riven (Svellsongur copies her text as it attaches), then send her into bf1. */
async function equipAndAttack(): Promise<Game> {
  const game = await board().build();
  await game.p1.do("equipCard", { equipmentId: "svell", unitId: "riven" });
  await game.settle();
  await game.p1.do("equipCard", { equipmentId: "cull", unitId: "riven" });
  await game.settle();
  expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, chaos: 0 } });
  expect(game.state("riven").attachments.sort()).toEqual(["cull", "svell"]);
  expect(game.state("svell").meta.copiedFromCardId).toBe("riven"); // Svellsongur now carries Riven's text
  expect(game.state("riven").might).toBe(4); // 3 + Cull's +1 (+0 from Svellsongur)
  await game.p1.move("riven", "bf1");
  expect(game.state("riven").combatRole).toBe("attacker");
  if (game.decision()?.kind === "order") {
    expect(game.decision()?.seat).toBe(P1);
    await game.acceptTriggerOrder();
  }
  return game;
}

describe("Ruling 2b44356e2bc5c0e9 — Riven + Svellsongur + Cull: two attack triggers, two different targets, 4 damage each", () => {
  test("attacking puts TWO 'When I attack' triggers on the chain (Riven's own + Svellsongur's copy); Cull adds none", async () => {
    const game = await equipAndAttack();
    const triggers = game.chain().filter((c) => c.triggered && c.controller === P1 && c.name === "Riven, Shattered");
    expect(triggers).toHaveLength(2);
    expect(game.chain().some((c) => c.name === "Cull")).toBe(false);
  });

  test("each trigger asks P1 for ITS OWN enemy unit here — P1 may pick Foe A for one and Foe B for the other", async () => {
    const game = await equipAndAttack();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    let d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["foeA", "foeB"]);
    await game.p1.pick("foeA");
    d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 }); // the second, independent choice
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["foeA", "foeB"]); // no forced match
    await game.p1.pick("foeB");
    expect(game.chain().map((c) => c.targets)).toEqual([["foeA"], ["foeB"]]);
  });

  test("both resolve: 2 × (Svellsongur + Cull = 2 Equipment) = 4 to Foe A and 4 to Foe B", async () => {
    const game = await equipAndAttack();
    await game.p1.pick("foeA");
    await game.p1.pick("foeB");
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("foeA")).toMatchObject({ damage: 4, zone: "battlefield-bf1" });
    expect(game.state("foeB")).toMatchObject({ damage: 4, zone: "battlefield-bf1" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.violations()).toEqual([]);
  });

  test("nothing forces them apart either: both triggers may choose the SAME unit (8 total → a 5-Might Foe A dies)", async () => {
    const game = await equipAndAttack();
    await game.p1.pick("foeA");
    await game.p1.pick("foeA");
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("foeA")).toBe("trash");
    expect(game.state("foeB").damage).toBe(0);
  });

  test("control: with only Cull attached (no Svellsongur) there is ONE trigger dealing 2 × 1 = 2", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: null })
      .unit(P2, "bf1", { might: 5, name: "Foe A" }, "foeA")
      .unit(P2, "bf1", { might: 5, name: "Foe B" }, "foeB")
      .unit(P1, "base", RIVEN, "riven")
      .gear(P1, CULL, "cull")
      .resources(P1, { power: { chaos: 1 } })
      .build();
    await game.p1.do("equipCard", { equipmentId: "cull", unitId: "riven" });
    await game.settle();
    await game.p1.move("riven", "bf1");
    expect(game.chain().filter((c) => c.triggered)).toHaveLength(1);
    await game.p1.pick("foeA");
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.state("foeA").damage).toBe(2);
    expect(game.state("foeB").damage).toBe(0);
  });
});
