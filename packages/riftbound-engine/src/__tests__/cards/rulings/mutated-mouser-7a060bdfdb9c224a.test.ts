/**
 * Ruling 7a060bdfdb9c224a — Mutated Mouser (UNL-036 → unl-036-219) · 1 Might · "[Shield 2] (+2 [Might] while I'm a defender.) [Tank]"
 *   × Switcheroo (SFD-145 → sfd-145-221) · [Hidden] Action · "Swap the Might of two units at the same battlefield this turn."
 *
 * Q: Can I flip Switcheroo from hidden before Shield "activates" on my defending Mutated Mouser?
 * A: No. Shield is a passive keyword, not a trigger: nothing goes on the chain and there is no moment where the Mouser is a defender
 *    without the +2. By the time you can play Switcheroo (Reaction timing from hidden, inside the showdown) the Mouser already reads 3;
 *    Switcheroo snapshots the CURRENT Might values (Shield included) when it resolves and swaps those.
 * Rules: 814.1 (Shield is passive), 811.6 (hidden → Reaction), FAQ #8532 (Switcheroo snapshots at resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MUTATED_MOUSER = "unl-036-219";
const SWITCHEROO = "sfd-145-221";

/** P2's turn. P1 holds bf1 with Mutated Mouser (1, Shield 2, Tank) and a facedown Switcheroo; P2's 4-Might Attacker in base. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", MUTATED_MOUSER, "mouser")
    .facedown(P1, "bf1", SWITCHEROO, "sw")
    .unit(P2, "base", { might: 4, name: "Attacker" }, "attacker");
}

async function attacked(): Promise<Game> {
  const game = await board().build();
  expect(game.state("mouser")).toMatchObject({ combatRole: null, might: 1 }); // not defending yet: plain 1
  await game.p2.move("attacker", "bf1");
  return game;
}

/** P2 passes Focus; P1 flips Switcheroo naming Mouser + Attacker; everyone passes so it resolves (combat still open). */
async function flipSwitcheroo(game: Game): Promise<void> {
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("reveal", "sw")).toBe(true);
  await game.p1.reveal("sw", { answers: [["mouser", "attacker"], "mouser", "attacker"] });
  for (let i = 0; i < 6 && game.zoneOf("sw") !== "trash"; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      const want = d.options.find((o) => ["mouser", "attacker"].includes(String(o.card ?? o.key)));
      await game.p1.pick(String(want?.card ?? want?.key));
    } else if (d?.kind === "action") {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
  game.clearScript(P1);
  expect(game.zoneOf("sw")).toBe("trash");
}

describe("Ruling 7a060bdfdb9c224a — Shield is passive: Switcheroo can only ever see the Mouser's shielded Might", () => {
  test("the instant the showdown opens the Mouser is a defender at 3 Might (1 + Shield 2) — no chain item, nothing to respond to, and the very first decision offered to anyone already sees 3", async () => {
    const game = await attacked();
    expect(game.chain()).toEqual([]); // Shield never uses the chain
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 }); // first window of the combat
    expect(game.state("mouser")).toMatchObject({ combatRole: "defender", might: 3 });
    expect(game.chain().some((c) => c.cardId === "mouser")).toBe(false);
  });

  test("P1's earliest chance to flip Switcheroo is inside the showdown — and at that point the Mouser STILL reads 3, the Attacker 4", async () => {
    const game = await attacked();
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "sw")).toBe(true);
    expect(game.state("mouser").might).toBe(3);
    expect(game.state("attacker").might).toBe(4);
  });

  // Expected: the swap snapshots CURRENT Might (Shield included): 3 ↔ 4 → difference 1 → Mouser 1+2(Shield)+1 = 4, Attacker 4−1 = 3
  // (same precedent as ruling d3315ccad82e376e, Assault/Shield Switcheroo). Actual: the engine computes the difference from the
  // Mouser's UNshielded Might (1 vs 4 → ±3) and then Shield applies on top again — Mouser reads 6, Attacker 1.
  test("ruling 7a060bdfdb9c224a — engine swaps around the unshielded value and re-adds Shield (Mouser 6 / Attacker 1 instead of 4 / 3)", async () => {
    const game = await attacked();
    await flipSwitcheroo(game);
    expect(game.state("attacker").might).toBe(3);
    expect(game.state("mouser").might).toBe(4);
    expect(game.state("mouser").combatRole).toBe("defender"); // still mid-combat, still shielded underneath
  });

  test("combat then resolves on those numbers: the 3-Might Attacker dies to 4, the Mouser (4) survives 3 damage and P1 keeps bf1", async () => {
    const game = await attacked();
    await flipSwitcheroo(game);
    await game.settle();
    expect(game.zoneOf("attacker")).toBe("trash");
    expect(game.zoneOf("mouser")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("control: without the flip the Mouser defends at 3 and dies to the 4-Might Attacker, which survives (3 < 4) and conquers", async () => {
    const game = await attacked();
    await game.settle();
    expect(game.zoneOf("mouser")).toBe("trash");
    expect(game.zoneOf("attacker")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });
});
