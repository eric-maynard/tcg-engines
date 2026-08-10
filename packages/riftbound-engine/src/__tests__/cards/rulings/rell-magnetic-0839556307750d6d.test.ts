/**
 * Ruling 0839556307750d6d — Rell, Magnetic (SFD-024 → sfd-024-221, 4 Might, [Tank])
 *   "When I attack, you may play an Equipment with Energy cost no more than [2], ignoring its cost. If you do,
 *    then do this: Attach it to me."
 *   × Recurve Bow (sfd-016-221, Equipment, 2, +0) Effect Text "When I attack or defend, deal 2 to an enemy unit here."
 *
 * Q: Rell attacks and her trigger plays + attaches Recurve Bow — does the Bow's "When I attack" deal 2 now?
 * A: No. Attack triggers fire once, when the unit gains the Attacker designation; the Bow was attached only while
 *    Rell's own attack trigger resolved — after that moment — so its trigger does not fire this combat. It works
 *    on Rell's later attacks, and its defend half fires when Rell later defends.
 * Rules: 383.4.e / 383.4.e.2.a (attack trigger checked once, at designation), 383.2.c, 718.3 (Effect Text
 *        appended to the bearer), 383.4.f (defend triggers).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RELL = "sfd-024-221";
const RECURVE_BOW = "sfd-016-221";

/** P1's turn. P2's Foe holds bf1; P2 also has a Raider (2) in base for the later defence. Rell in P1's base, Bow in hand, no resources. */
function board(foeMight: number) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: foeMight, name: "Foe" }, "foe")
    .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
    .unit(P1, "base", RELL, "rell")
    .hand(P1, RECURVE_BOW, "bow");
}

/** Rell attacks bf1; P1 accepts her trigger; it resolves and P1 picks the Bow → attached. Stops before combat damage. */
async function attackAndFetchBow(game: Game): Promise<void> {
  await game.p1.move("rell", "bf1");
  expect(game.state("rell").combatRole).toBe("attacker");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rell", controller: P1, triggered: true })]);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  await game.p1.yes();
  await game.p1.passPriority();
  await game.p2.passPriority(); // Rell's trigger resolves → which Equipment?
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toContain("bow");
  await game.p1.pick("bow");
  expect(game.state("bow").attachedTo).toBe("rell");
  expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // "ignoring its cost"
}

describe("Ruling 0839556307750d6d — Recurve Bow fetched by Rell's attack trigger does not shoot in that same attack", () => {
  test("this combat: after the Bow attaches there is NO 'When I attack' item on the chain and Foe is undamaged; P1 simply has Focus in the showdown (383.4.e.2.a)", async () => {
    const game = await board(3).build();
    await attackAndFetchBow(game);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ kind: "action", context: "showdown", seat: P1 });
    expect(game.decision()?.kind).not.toBe("pick"); // nobody is asked for "an enemy unit here"
    expect(game.state("foe").damage).toBe(0);
  });

  test("discriminating outcome: into a 5-Might Foe the missing 2 damage matters — Foe survives (takes only Rell's 4) and Rell (4) dies; had the Bow fired Foe would have taken 6", async () => {
    const game = await board(5).build();
    await attackAndFetchBow(game);
    await game.settle();
    expect(game.zoneOf("foe")).toBe("battlefield-bf1");
    expect(game.zoneOf("rell")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test("the Bow still works LATER: next turn P2's Raider attacks Rell (now wearing the Bow) → her conferred 'When I defend' trigger fires, P1 picks the enemy unit here and it takes 2", async () => {
    const game = await board(3).build();
    await attackAndFetchBow(game);
    await game.settle(); // 4 ≥ 3: Foe dies, Rell conquers bf1
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("rell").attachments).toEqual(["bow"]);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.move("raider", "bf1");
    // The only "enemy unit here" is the Raider, so the target binds without asking.
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick("raider");
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rell", controller: P1, targets: ["raider"], triggered: true })]);
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("raider")).toBe("trash"); // 2 ≥ 2 before combat damage
    await game.settle();
    expect(game.locationOf("rell")).toBe("bf1");
    expect(game.violations()).toEqual([]);
  });
});
