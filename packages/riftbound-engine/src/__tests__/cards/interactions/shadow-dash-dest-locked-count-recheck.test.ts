/**
 * Interaction: Shadow Dash (ven-148-166) "Move an enemy unit to a battlefield where
 *   you have units. If you have exactly two units there, they each get +1 [Might] this turn."
 *   × Flash (ogs-011-024) "[Reaction] Move up to 2 friendly units to base."
 *   × Janna, Savior (sfd-053-221) "[Reaction] … When you play me, …"
 *
 * Q: which half of the spell is frozen when it is played and which half is re-read
 *    when it resolves? Four boards differing only in what happens in between.
 *
 * Rules
 *  - 355.4 / 355.4.a  a Move effect's DESTINATION is a Relevant Choice of playing the
 *                     card — picked now, from locations satisfying the stated restriction,
 *                     and never the mover's current location.
 *  - 355.7            the enemy unit is a target, chosen at play time.
 *  - 355.15           a choice already made is not re-made later.
 *  - 355.10.d         "if you have exactly two units there" is a programmatic count of the
 *                     caster's own units — never a choice, never a prompt.
 *  - 135.2.b.5.a      a condition attached to an instruction is read when that instruction
 *                     executes, i.e. at resolution.
 *  - 449.1            the destination must still satisfy the restriction the source states.
 *  - 359.3.e.6        an instruction that cannot be followed is ignored …
 *  - 359.3.e.10       … but the spell was still played: it is trashed and its cost stays paid.
 *  - 337.2 / 446.3    a Reaction unit resolves as it is played, so it is on the board before
 *                     the spell it responded to resolves.
 *
 * Expected: 355.4 + 355.15 fix WHICH location was picked (never re-offered); 449.1 +
 * 359.3.e.6 re-test whether that location still qualifies; 355.10.d + 135.2.b.5.a make the
 * unit count a resolution-time read. The engine must not conflate "the destination is
 * frozen" with "the destination's legality is frozen".
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SHADOW_DASH = "ven-148-166";
const FLASH = "ogs-011-024";
const JANNA = "sfd-053-221";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * bfA = the destination P1 names (P1 units there), bfC = a SECOND battlefield where P1 also
 * has a unit (so a swap is physically available), bfB = where the enemy unit starts.
 */
function board(unitsAtA: 1 | 2) {
  let s = scenario()
    .resources(P1, { energy: 12, power: { calm: 4, rainbow: 4, chaos: 2 } })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .battlefield("bfC", { controller: P1 })
    .unit(P2, "bfB", { might: 2 }, "foe")
    .unit(P1, "bfC", { might: 2 }, "spare")
    .unit(P1, "bfA", { might: 2 }, "mine1");
  if (unitsAtA === 2) {
    s = s.unit(P1, "bfA", { might: 2 }, "mine2");
  }
  return s.hand(P1, SHADOW_DASH, "dash").hand(P1, FLASH, "flash").hand(P1, JANNA, "janna");
}

/**
 * rule 355.4 — the destination is demanded as part of PLAYING the spell, before anyone
 * receives priority: answer it, then responses may be made, then everyone passes.
 */
async function chooseDest(game: Game, destination: string) {
  expect(game.decision()?.kind).toBe("pick");
  await game.p1.pick(destination);
}

/** Everyone passes until Shadow Dash itself has resolved — and no further (the showdown
 * its arrival opens is a different question). */
async function letItResolve(game: Game) {
  for (let i = 0; i < 6 && game.zoneOf("dash") !== "trash"; i++) {
    await game.p1.passPriority();
    await game.p2.passPriority();
  }
}

describe("Shadow Dash: destination fixed at play, count re-read at resolution", () => {
  test(
    "the destination is asked when the spell is played — rule 355.4 makes it a Relevant Choice of PLAYING (and 355.15 forbids re-making it)",
    async () => {
      const game = await board(2).build();
      await game.p1.cast("dash", { targets: "foe" });
      // A `choose-destination` pick bound to the chain item, timing FIN, before anyone
      // receives priority: the rider is a pure count (355.10.d), so nothing about it is
      // re-decided at resolution and the destination stays a choice of PLAYING.
      const d = game.decision();
      expect(d?.kind).toBe("pick");
      expect(d?.timing).toBe("FIN");
      expect((d as { semantics?: string } | undefined)?.semantics).toBe("destination");
    },
  );

  test("(a) nothing changes: the enemy unit moves and P1's two units there each get +1 [Might]", async () => {
    const game = await board(2).build();
    await game.p1.cast("dash", { targets: "foe" });
    await chooseDest(game, "bfA");
    await letItResolve(game);
    expect(game.locationOf("foe")).toBe("bfA");
    // The ARRIVING enemy unit is not one of P1's — the count is mine1 + mine2 = exactly two.
    expect(game.state("mine1").might).toBe(3);
    expect(game.state("mine2").might).toBe(3);
    expect(game.state("mine1").mightModifier).toBe(1);
    // The rider is anchored at the destination (location "same"), so bfC is untouched.
    expect(game.state("spare").might).toBe(2);
    expect(game.state("foe").might).toBe(2);
    expect(game.zoneOf("dash")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("(b) Flashing one of the two home: the destination still qualifies so the move happens, but the count is now 1 — NO buff (135.2.b.5.a, resolution beats finalization)", async () => {
    const game = await board(2).build();
    await game.p1.cast("dash", { targets: "foe" });
    await chooseDest(game, "bfA");
    await game.p1.cast("flash", { targets: ["mine2"] }); // reaction: mine2 goes home
    await letItResolve(game);
    expect(game.locationOf("mine2")).toBe("base");
    expect(game.locationOf("foe")).toBe("bfA"); // 449.1 satisfied — mine1 is still there
    expect(game.state("mine1").might).toBe(2); // count was TRUE at play, FALSE at resolution
    expect(game.state("mine2").might).toBe(2);
    expect(game.state("mine1").mightModifier).toBe(0);
    expect(game.zoneOf("dash")).toBe("trash");
  });

  test("(c) a Reaction unit arriving makes the count TRUE at resolution: the move happens and BOTH P1 units there get +1 (337.2)", async () => {
    const game = await board(1).build();
    await game.p1.cast("dash", { targets: "foe" }); // only mine1 at bfA — the rider is false right now
    await chooseDest(game, "bfA");
    await game.p1.play("janna", { to: "bfA" }); // Reaction unit; resolves at once (337.2 / 446.3)
    expect(game.locationOf("janna")).toBe("bfA");
    await letItResolve(game);
    expect(game.locationOf("foe")).toBe("bfA");
    expect(game.state("mine1").might).toBe(3);
    expect(game.state("janna").might).toBe(4); // printed 3 + 1
    expect(game.state("spare").might).toBe(2);
    expect(game.zoneOf("dash")).toBe("trash");
  });

  test(
    "(d) with the lone unit Flashed home the destination no longer qualifies — the move must be IGNORED (449.1 / 359.3.e.6) and must NOT be re-pointed at another battlefield (355.4 / 355.15)",
    async () => {
      const game = await board(1).build();
      await game.p1.cast("dash", { targets: "foe" });
      await chooseDest(game, "bfA");
      await game.p1.cast("flash", { targets: ["mine1"] }); // bfA is now empty of P1 units
      await game.p1.passPriority();
      await game.p2.passPriority(); // Flash resolves
      await game.p1.passPriority();
      await game.p2.passPriority(); // Shadow Dash resolves
      // The chosen destination bfA fails 449.1, so the move instruction is ignored and the
      // enemy unit stays put — it is never re-pointed at bfC (355.15).
      expect(game.locationOf("foe")).not.toBe("bfC");
      expect(game.locationOf("foe")).toBe("bfB");
      expect(game.zoneOf("foe")).toBe("battlefield-bfB");
    },
  );

  test("(d) no buff is granted, and Shadow Dash is still 'played': it goes to the trash with its cost spent (359.3.e.10)", async () => {
    const game = await board(1).build();
    const energyBefore = game.p1.energy();
    await game.p1.cast("dash", { targets: "foe" });
    await chooseDest(game, "bfA");
    await game.p1.cast("flash", { targets: ["mine1"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("mine1").mightModifier).toBe(0);
    expect(game.state("spare").mightModifier).toBe(0); // count is never two, wherever it is read
    expect(game.state("mine1").might).toBe(2);
    expect(game.state("spare").might).toBe(2);
    expect(game.zoneOf("dash")).toBe("trash");
    expect(game.p1.energy()).toBe(energyBefore - 2 - 2); // Shadow Dash 2 + Flash 2, nothing refunded
    expect(game.violations()).toEqual([]);
  });
});
