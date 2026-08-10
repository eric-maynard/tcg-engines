/**
 * Ruling 09e50268e39cfc4d — Spinning Axe (SFD-186 → sfd-186-221) · Equipment · Fury/Chaos · 2+[rainbow] · +3
 *   "[Quick-Draw] [Equip] [rainbow] [Temporary]"
 *
 * Q: My unit wearing Spinning Axe dies on my opponent's turn — can I re-attach the Axe to another unit right away?
 * A: No. [Equip] is an activated ability: only on your own turn, in an Open State (empty chain, no showdown); the Axe's
 *    Equip has no Reaction timing. When the bearer dies the Axe detaches and is recalled to base at the next Cleanup;
 *    on YOUR turn, in an Open State, you may pay [rainbow] to attach it to another unit you control.
 * Rules: 381 / 151.2 (activated abilities: your turn, Open State), 457.1 (unattached equipment recalled at Cleanup).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPINNING_AXE = "sfd-186-221";

/** [Action] "Deal 3 to a unit." — the opponent's removal. */
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  rulesText: "[Action] Deal 3 to a unit.",
  timing: "action",
} as const;

/**
 * P1 holds bf1 with the 2-Might Bearer wearing Spinning Axe (+3 → 5, so Bolt alone won't kill it — we pre-damage it 2)
 * and a spare 2-Might Squire in base; P1 has 1 rainbow for a re-Equip. The killer (whoever's turn it is) holds Bolt + 1.
 */
function board(active: typeof P1 | typeof P2) {
  const killer = active;
  return scenario()
    .active(active)
    .resources(P1, { power: { rainbow: 1 } })
    .resources(killer, { energy: 1, ...(killer === P1 ? { power: { rainbow: 1 } } : {}) })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Bearer" }, "bearer", { damage: 2, equippedWith: ["axe"] })
    .card("axe", { def: SPINNING_AXE, meta: { attachedTo: "bearer" }, owner: P1, zone: "bf1" })
    .unit(P1, "bf1", { might: 2, name: "Anchor" }, "anchor")
    .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
    .hand(killer, BOLT, "bolt");
}

const equipOptions = (game: Game) => game.p1.legal().filter((o) => o.moveId === "equipCard");

async function killBearer(game: Game, killer: "p1" | "p2"): Promise<void> {
  expect(game.state("bearer")).toMatchObject({ attachments: ["axe"], damage: 2, might: 5 });
  await game[killer].cast("bolt", { targets: "bearer" });
  await game.settle();
  expect(game.zoneOf("bearer")).toBe("trash");
  expect(game.chain()).toEqual([]);
}

describe("Ruling 09e50268e39cfc4d — Spinning Axe can't be re-Equipped on the opponent's turn", () => {
  test("opponent's turn: the Bearer dies, the Axe detaches and (after the Cleanup) sits unattached in P1's base under P1's control", async () => {
    const game = await board(P2).build();
    await killBearer(game, "p2");
    expect(game.zoneOf("axe")).toBe("base");
    expect(game.state("axe")).toMatchObject({ attachedTo: undefined, controller: P1, owner: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("…and P1 has NO way to activate its [Equip] now: no equip option in P1's menu and a forced equipCard is rejected (381: your turn + Open State only)", async () => {
    const game = await board(P2).build();
    await killBearer(game, "p2");
    expect(game.turnPlayer()).toBe(P2);
    expect(equipOptions(game)).toEqual([]);
    const forced = await game.p1.try((p) => p.do("equipCard", { equipmentId: "axe", unitId: "squire" }));
    expect(forced.ok).toBe(false);
    expect(game.state("axe").attachedTo).toBeUndefined();
    expect(game.state("squire").might).toBe(2);
  });

  test("contrast — on P1's OWN turn, once the chain is empty and the Axe is back in base, P1 may pay [rainbow] to Equip it to another unit", async () => {
    const game = await board(P1).build();
    await killBearer(game, "p1");
    expect(game.zoneOf("axe")).toBe("base");
    expect(game.turnPlayer()).toBe(P1);
    const opts = equipOptions(game);
    expect(opts.length).toBeGreaterThan(0);
    expect(game.p1.power("rainbow")).toBe(1);
    await game.p1.do("equipCard", { equipmentId: "axe", unitId: "squire" });
    await game.settle();
    expect(game.p1.power("rainbow")).toBe(0);
    expect(game.state("axe").attachedTo).toBe("squire");
    expect(game.state("squire").might).toBe(5);
    expect(game.violations()).toEqual([]);
  });
});
