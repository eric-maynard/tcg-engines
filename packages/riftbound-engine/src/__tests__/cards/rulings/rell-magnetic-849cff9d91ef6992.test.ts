/**
 * Ruling 849cff9d91ef6992 — Rell, Magnetic (SFD-024 → sfd-024-221, Champion · Fury · 4 · 4 Might · [Tank])
 *   "When I attack, you may play an Equipment with Energy cost no more than [2], ignoring its cost. If you do,
 *    then do this: Attach it to me."
 *   × Long Sword (SFD-022 → sfd-022-221, Equipment · Fury · [2]+[fury] · +2) "[Quick-Draw] [Equip] [fury]"
 *
 * Q: Can Rell equip a Long Sword for free when she attacks?
 * A: Yes. Long Sword's Energy cost 2 ≤ [2] so it is eligible; "ignoring its cost" zeroes BOTH its Energy (2) and Power
 *    ([fury]) cost; Rell's own effect then attaches it to her, so the [fury] Equip cost is never paid either. Quick-Draw's
 *    attach trigger is redundant. Net: 0 Energy, 0 Power, 0 Equip cost, Sword on Rell.
 * Rules: 356.1.b.1 ("ignoring its cost" = Energy and Power), 383.4.e (attack triggers), 716 (attach), 821 (Quick-Draw).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RELL = "sfd-024-221";
const LONG_SWORD = "sfd-022-221";

/**
 * P1's turn. P2's 7-Might Wall holds bf1 (survives Rell either way, so combat outcome is not the point). Rell ready in
 * P1's base, Long Sword in hand. P1 has exactly 2 energy + 1 fury — enough that a NON-free play/equip would visibly
 * drain it; the ruling says none of it is spent.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 7, name: "Wall" }, "wall")
    .unit(P1, "base", RELL, "rell")
    .hand(P1, LONG_SWORD, "sword");
}

/** Rell attacks bf1 → her optional trigger is asked; P1 accepts; both pass; P1 picks the Sword when asked. */
async function attackAndTakeSword(game: Game): Promise<void> {
  await game.p1.move("rell", "bf1");
  expect(game.state("rell").combatRole).toBe("attacker");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rell", controller: P1, triggered: true })]);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  await game.p1.yes();
  await game.p1.passPriority();
  await game.p2.passPriority(); // trigger resolves → which Equipment?
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toContain("sword");
  await game.p1.pick("sword");
  // Drain any redundant Quick-Draw follow-up / priority windows, staying inside the showdown.
  for (let i = 0; i < 6; i++) {
    const next = game.decision();
    if (!next || next.kind !== "action" || next.context !== "chain") {
      break;
    }
    await game.acting().passPriority();
  }
}

describe("Ruling 849cff9d91ef6992 — Rell's attack trigger plays AND attaches Long Sword entirely for free", () => {
  test("Long Sword (Energy cost 2 ≤ [2]) is offered by Rell's trigger; picking it plays it with P1's 2 energy + 1 fury UNTOUCHED (Energy and Power both ignored) and it ends attached to Rell (+2 → 6 Might)", async () => {
    const game = await board().build();
    expect(game.state("sword").energyCost).toBe(2);
    await attackAndTakeSword(game);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 1 } }); // nothing paid: not [2], not [fury], not the [fury] Equip
    expect(game.state("sword").attachedTo).toBe("rell");
    expect(game.state("rell").attachments).toEqual(["sword"]);
    expect(game.state("rell")).toMatchObject({ baseMight: 4, might: 6 });
    expect(game.zoneOf("sword")).toBe("battlefield-bf1");
    // No separate Equip activation / Quick-Draw re-attach is left dangling: we're simply in the showdown.
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ kind: "action", context: "showdown" });
    expect(game.violations()).toEqual([]);
  });

  test("it also works with an EMPTY pool (0 energy, 0 power) — the whole sequence needs no resources at all", async () => {
    const game = await board().resources(P1, { energy: 0, power: { fury: 0 } }).build();
    await attackAndTakeSword(game);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.state("sword").attachedTo).toBe("rell");
    expect(game.state("rell").might).toBe(6);
  });

  test("combat then resolves normally after the free equip: Rell (6) into the 7-Might Wall — Wall survives, Rell dies, and P1's pool is STILL untouched at the end", async () => {
    const game = await board().build();
    await attackAndTakeSword(game);
    await game.settle();
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.zoneOf("rell")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 1 } }); // still never charged
  });
});
