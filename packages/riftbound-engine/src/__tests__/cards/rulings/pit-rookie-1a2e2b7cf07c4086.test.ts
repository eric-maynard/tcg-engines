/**
 * Ruling 1a2e2b7cf07c4086 — Pit Rookie (OGN-136 → ogn-136-298) · Body Unit · [2] · 2 Might
 *     "When you play me, buff another friendly unit."
 *   × Lee Sin, Centered (OGN-151 → ogn-151-298) · Body Champion · 6 Might
 *     "Other buffed friendly units at my battlefield have +2 [Might]."
 *
 * Q: A unit's Might drops (another unit died in combat and its aura went away) so that its marked damage now equals
 *    its Might. Does it die, or is it healed first?
 * A: It survives and is healed. One cleanup kills damaged units exactly once: Lee Sin dies at the kill step, and the
 *    units that got through that step are healed at the very next step of the Combat Special Cleanup — so a buffed
 *    Pit Rookie with 3 damage (5 Might while Lee Sin lived) is back to 3 Might with no damage.
 * Rules: 323.3–323.5 (a Cleanup's step 3: 3a note Deathknells, 3b kill everything with lethal damage — once),
 *        466.1/466.1.a.1 (a Combat Cleanup inserts "3c. Heal all Units" right after that kill step),
 *        143.3.b.2 / 418 (damage is healed during a Combat Cleanup), 322 (a further cleanup only re-checks the state
 *        AFTER this one has finished — by then the damage is gone).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const LEE_SIN_CENTERED = "ogn-151-298";
const PIT_ROOKIE = "ogn-136-298";

/** A plain Action spell that kills a unit — used only to reproduce the same Might drop OUTSIDE a combat cleanup. */
const EXECUTE = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Execute (Action)",
  timing: "action",
} as const;

/**
 * P1's turn. P2 holds bf1 with a 6-Might Bruiser. P1 has Lee Sin, Centered (6) and a BUFFED Pit Rookie carrying
 * `damage` marked damage in base, ready to charge in together.
 */
function board(damage: number, bruiserMight = 6) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: bruiserMight, name: "Bruiser" }, "bruiser")
    .unit(P1, "base", LEE_SIN_CENTERED, "lee")
    .unit(P1, "base", PIT_ROOKIE, "rookie", { buffed: true, damage });
}

describe("Ruling 1a2e2b7cf07c4086 — a unit that survives the cleanup's kill step is healed even if the deaths there shrink its Might", () => {
  test("setup: at the battlefield the buffed Pit Rookie is 5 Might (2 printed + 1 buff + Lee Sin's +2) with 3 damage marked — not lethal", async () => {
    const game = await board(3).build();
    expect(game.state("rookie")).toMatchObject({ baseMight: 2, isBuffed: true, might: 3 }); // no Lee Sin aura in base
    await game.p1.move(["lee", "rookie"], "bf1");
    expect(game.state("rookie")).toMatchObject({ damage: 3, might: 5 });
    expect(game.state("lee").might).toBe(6);
    expect(game.state("rookie").combatRole).toBe("attacker");
  });

  test("Lee Sin's aura only reaches BUFFED allies — an unbuffed Pit Rookie stays at 2 Might beside him", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 6, name: "Bruiser" }, "bruiser")
      .unit(P1, "base", LEE_SIN_CENTERED, "lee")
      .unit(P1, "base", PIT_ROOKIE, "plain")
      .build();
    await game.p1.move(["lee", "plain"], "bf1");
    expect(game.state("plain")).toMatchObject({ isBuffed: false, might: 2 });
  });

  test("the combat cleanup kills Lee Sin (lethal combat damage) and then HEALS Pit Rookie — it does not die to its own 3 damage", async () => {
    const game = await board(3).build();
    await game.p1.move(["lee", "rookie"], "bf1");
    await game.settle();
    expect(game.zoneOf("lee")).toBe("trash"); // 6 damage on 6 Might
    // Pit Rookie survived the single kill step at 5 Might, so the very next step healed it.
    expect(game.zoneOf("rookie")).toBe("battlefield-bf1");
    expect(game.state("rookie")).toMatchObject({ damage: 0, might: 3 }); // aura gone → 2 + buff
    expect(game.zoneOf("bruiser")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("even 4 damage — above the 3 Might it drops to, still below the 5 it had — is survived and healed away", async () => {
    const game = await board(4).build();
    await game.p1.move(["lee", "rookie"], "bf1");
    expect(game.state("rookie")).toMatchObject({ damage: 4, might: 5 });
    await game.settle();
    expect(game.zoneOf("lee")).toBe("trash");
    expect(game.zoneOf("rookie")).toBe("battlefield-bf1");
    expect(game.state("rookie")).toMatchObject({ damage: 0, might: 3 });
    expect(game.violations()).toEqual([]);
  });

  test("the ruling's own numbers with real COMBAT damage: 1 marked + 2 dealt = 3 on a 5-Might Pit Rookie ⇒ survives, then heals to 3 Might / 0 damage", async () => {
    // An 8-Might Bruiser deals 6 to Lee Sin (lethal) and 2 to Pit Rookie.
    const game = await board(1, 8).build();
    await game.p1.move(["lee", "rookie"], "bf1");
    expect(game.state("rookie")).toMatchObject({ damage: 1, might: 5 });
    await game.settle();
    expect(game.zoneOf("lee")).toBe("trash");
    expect(game.zoneOf("rookie")).toBe("battlefield-bf1");
    expect(game.state("rookie")).toMatchObject({ damage: 0, might: 3 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — combat damage that IS lethal at the kill step (5 on the 5 Might it has then) does kill Pit Rookie; there is nothing left to heal", async () => {
    // An 11-Might Bruiser has exactly enough for both: 6 onto Lee Sin and 5 onto Pit Rookie.
    const game = await board(0, 11).build();
    await game.p1.move(["lee", "rookie"], "bf1");
    expect(game.state("rookie")).toMatchObject({ damage: 0, might: 5 });
    await game.settle();
    expect(game.zoneOf("lee")).toBe("trash");
    expect(game.zoneOf("rookie")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("contrast — the same Might drop OUTSIDE a combat cleanup has no heal step to save it: Pit Rookie dies at the follow-up cleanup (322)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", LEE_SIN_CENTERED, "lee")
      .unit(P1, "bf1", PIT_ROOKIE, "rookie", { buffed: true, damage: 3 })
      .hand(P1, EXECUTE, "exe")
      .build();
    expect(game.state("rookie")).toMatchObject({ damage: 3, might: 5 });
    await game.p1.cast("exe", { targets: "lee" });
    await game.settle();
    expect(game.zoneOf("lee")).toBe("trash");
    expect(game.zoneOf("rookie")).toBe("trash"); // 3 damage on the 3 Might left after the aura vanished
    expect(game.violations()).toEqual([]);
  });
});
