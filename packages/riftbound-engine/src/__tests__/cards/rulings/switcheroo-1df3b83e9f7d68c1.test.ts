/**
 * Ruling 1df3b83e9f7d68c1 — Switcheroo (SFD-145 → sfd-145-221) · Chaos · [2] · [Hidden] [Action]
 *   "Swap the Might of two units at the same battlefield this turn."
 *   × [Shield N] — a passive: "+N Might while I am a Defender."
 *
 * Q: Can Switcheroo be played from Hidden BEFORE a defending unit's Shield bonus applies?
 * A: No. Shield is a passive keyword, not a triggered ability: it never goes on the chain and cannot be
 *    responded to. The bonus is applied the instant the Defender designation is acquired — before the Initial
 *    Chain exists — so any Switcheroo played later snapshots a Might that already includes it.
 * Rules: 459.2.b.4 (Defender designation applied before "when I defend" triggers are chained), 810 (Shield is
 *        a passive/static keyword), 355 (the swap reads the Might values as it resolves).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SWITCHEROO = "sfd-145-221";

/** 3-Might defender with [Shield 2] ("+2 Might while defending"). */
const SHEN = {
  abilities: [{ keyword: "Shield", type: "keyword", value: 2 }],
  cardType: "unit",
  keywords: ["Shield"],
  might: 3,
  name: "Shen (test)",
  rulesText: "[Shield 2]",
} as const;

/** P1's turn. P2 holds bf1 with the Shield defender and a hidden Switcheroo there. P1 has a 6-Might Brute. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", SHEN, "shen")
    .unit(P1, "base", { might: 6, name: "Brute" }, "brute")
    .facedown(P2, "bf1", SWITCHEROO, "switch");
}

/** The Brute attacks; the showdown is open and P2 will get focus after P1 passes. */
async function attack(): Promise<Game> {
  const game = await board().build();
  expect(game.state("shen").might).toBe(3); // no designation yet, no Shield bonus
  await game.p1.move("brute", "bf1");
  return game;
}

describe("Ruling 1df3b83e9f7d68c1 — Shield is applied with the Defender designation; there is no window in front of it", () => {
  test("the instant the attack lands, Shen is already the Defender at 3+2 = 5 Might — and NOTHING is on the chain, so nobody could have acted first", async () => {
    const game = await attack();
    expect(game.state("shen").combatRole).toBe("defender");
    expect(game.state("shen").might).toBe(5);
    expect(game.chain()).toEqual([]); // Shield is passive: it never became a chain item
    expect(game.state("brute").combatRole).toBe("attacker");
  });

  test("Shield never asks anything: the first decision after the attack is the ordinary showdown action menu, not a trigger prompt", async () => {
    const game = await attack();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("ruling: the earliest moment P2 can reveal the hidden Switcheroo, the shielded 5 is already the value it will swap", async () => {
    const game = await attack();
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("reveal", "switch")).toBe(true);
    expect(game.state("shen").might).toBe(5); // still 5 — no pre-Shield window ever existed
    await game.p2.reveal("switch"); // the only pair at bf1 — auto-bound
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("switch")).toBe("trash");
    // The Brute receives the SHIELD-INCLUSIVE 5, not Shen's printed 3.
    expect(game.state("brute").might).toBe(5);
    expect(game.state("shen").might).toBe(6);
  });

  test("…and Shield keeps applying afterwards as a continuous passive: once the combat ends and Shen stops defending, its Might drops by exactly the Shield 2 (6 → 4)", async () => {
    const game = await attack();
    await game.p1.passFocus();
    await game.p2.reveal("switch");
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.state("shen").might).toBe(6); // 3 printed + 1 (swap) + 2 (Shield, still live)
    await game.settle();
    expect(game.zoneOf("brute")).toBe("trash"); // 6 dealt to a 5-Might attacker
    expect(game.state("shen").combatRole).toBeNull();
    expect(game.state("shen").might).toBe(4); // the Shield's +2 is gone with the designation
    expect(game.violations()).toEqual([]);
  });

  test("control: with no attack at all Shen is not a Defender and the swap moves the bare 3", async () => {
    const game = await scenario()
      .resources(P2, { energy: 2, power: { chaos: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", SHEN, "shen")
      .unit(P2, "bf1", { might: 6, name: "Brute" }, "brute")
      .hand(P2, SWITCHEROO, "switch")
      .active(P2)
      .build();
    expect(game.state("shen").might).toBe(3);
    await game.p2.cast("switch", { targets: ["shen", "brute"] });
    await game.settle();
    expect(game.state("brute").might).toBe(3);
    expect(game.state("shen").might).toBe(6);
    expect(game.violations()).toEqual([]);
  });
});
