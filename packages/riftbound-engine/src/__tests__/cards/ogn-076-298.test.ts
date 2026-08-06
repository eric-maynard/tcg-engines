/**
 * Yasuo, Remorseful — ogn-076-298 · Champion Unit · Calm · 6 energy + [calm][calm] · 6 might · Yasuo
 *
 *   When I attack, deal damage equal to my Might to an enemy unit here.
 *
 * Rule 383.4.e.1 — "When I attack" triggers when the unit gains the Attacker designation.
 * Rule 359.3.f.4 — uses this exact card as its example: "enemy"/"here" are read from the trigger.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-076-298";

function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 8 }, "big")
    .unit(P2, "bf1", { might: 2 }, "small")
    .unit(P2, "bf2", { might: 1 }, "elsewhere")
    .unit(P1, "base", CARD, "yasuo");
}

/** Attack bf1 with Yasuo and let the trigger resolve onto `target`, stopping inside the showdown. */
async function attackAndResolveTrigger(target: string) {
  const game = await board().build();
  await game.p1.move("yasuo", "bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", triggered: true })]);
  // Target may be asked up front or on resolution; answer whenever the pick appears.
  for (let i = 0; i < 6 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind === "pick") {
      await game.p1.pick(target);
    } else {
      await game.acting().pass();
    }
  }
  if (game.decision()?.kind === "pick") {
    await game.p1.pick(target);
  }
  return game;
}

describe("Yasuo, Remorseful (ogn-076-298)", () => {
  test("costs 6 energy + 2 calm; unaffordable with a single calm", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { calm: 2 } }).hand(P1, CARD, "yasuo").build();
    await game.p1.play("yasuo");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.zoneOf("yasuo")).toBe("base");
    const short = await scenario().resources(P1, { energy: 6, power: { calm: 1 } }).hand(P1, CARD, "yasuo").build();
    expect(short.p1.can("play", "yasuo")).toBe(false);
  });

  test("on attack: deals damage equal to his Might (6) to the chosen enemy unit here, before combat damage", async () => {
    const game = await attackAndResolveTrigger("big");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.state("big").damage).toBe(6);
    expect(game.state("small").damage).toBe(0);
    expect(game.state("elsewhere").damage).toBe(0);
  });

  test("'here': only enemy units at Yasuo's battlefield are offered (not bf2, not Yasuo himself)", async () => {
    const game = await board().build();
    await game.p1.move("yasuo", "bf1");
    let d = game.decision();
    for (let i = 0; i < 6 && d?.kind !== "pick"; i++) {
      await game.acting().pass();
      d = game.decision();
    }
    expect(d?.kind).toBe("pick");
    const keys = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
    expect(keys.sort()).toEqual(["big", "small"]);
  });

  test("damage scales with current Might: a buffed Yasuo (7) deals 7", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 9 }, "big")
      .unit(P1, "base", CARD, "yasuo", { buffed: true })
      .build();
    expect(game.state("yasuo").might).toBe(7);
    await game.p1.move("yasuo", "bf1");
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (d?.kind === "pick") {
        await game.p1.pick("big");
      } else {
        await game.acting().pass();
      }
    }
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("big");
    }
    expect(game.state("big").damage).toBe(7);
  });

  test("full combat: trigger 6 + combat 6 = 12 kills the 8-might defender; Yasuo (6) dies to 8+2 back", async () => {
    const game = await board().script(P1, ["big"]).build();
    await game.p1.move("yasuo", "bf1");
    await game.settle();
    expect(game.zoneOf("big")).toBe("trash");
    expect(game.zoneOf("yasuo")).toBe("trash");
  });

  test("does not trigger when defending", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "yasuo")
      .unit(P2, "base", { might: 9 }, "attacker")
      .build();
    await game.p2.move("attacker", "bf1");
    expect(game.chain()).toHaveLength(0);
    expect(game.state("attacker").damage).toBe(0);
    expect((game.decision() as ActionDecision).context).toBe("showdown");
  });
});
