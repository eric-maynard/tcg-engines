/**
 * Ruling b43c764cfdfe5b69 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · [Hidden] "If a friendly unit would die, kill this
 *     instead. Heal that unit, exhaust it, and recall it."
 *   × Tasty Faefolk (ogn-075-298) · 6 Might · "[Deathknell] — Channel 2 runes exhausted and draw 1."
 *
 * Q: When does Deathknell trigger during combat resolution, and can you respond to it with hidden cards?
 * A: Combat damage is dealt → in the cleanup the Deathknell goes pending BEFORE the unit is trashed → the unit dies → the remaining
 *    units heal → the trigger is finalized on the chain; in a showdown you still control the (contested) battlefield, so you may
 *    respond with a hidden card. A Zhonya's flipped then stays for another unit but does not un-kill the Deathknell unit. Control
 *    changes hands only afterwards. (Outside a showdown the ruling says the hidden card is lost at once — see RULING-CONFLICT.)
 * Rules: 808.1.d.2 (Deathknell pends before the trash move), 465–466 (combat damage, cleanup, heal, then control), 190.4 / 323.6
 *        (control timing), 811 (hidden → Reaction for [0]), 366–372 (a replacement must be in play before the event).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const TASTY_FAEFOLK = "ogn-075-298";
/** P2's out-of-combat removal: deal 6 to a unit. */
const BOLT = {
  abilities: [{ effect: { amount: 6, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
} as const;

/** P2's turn 3. P1 holds bf1 with a lone Faefolk (6) and a facedown Zhonya's; P1's Bystander (2) sits in base. P2: Brute (7), Bolt + [1]. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", TASTY_FAEFOLK, "fae")
    .facedown(P1, "bf1", ZHONYAS, "zhonya")
    .unit(P1, "base", { might: 2, name: "Bystander" }, "bystander")
    .unit(P2, "base", { might: 7, name: "Brute" }, "brute")
    .hand(P2, BOLT, "bolt");
}

const bf1 = (game: Game) => game.gameState.battlefields.bf1;

/** Brute (7) attacks the Faefolk (6); both pass focus; combat damage kills the Faefolk. Stops with its Deathknell on the chain. */
async function faefolkDiesInCombat(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("brute", "bf1");
  await game.p2.passFocus();
  await game.p1.passFocus();
  if (game.decision()?.kind === "order") {
    await game.acceptTriggerOrder();
  }
  return game;
}

describe("Ruling b43c764cfdfe5b69 — Deathknell timing in combat cleanup, and responding to it with a hidden Zhonya's", () => {
  test("after combat damage: the Faefolk is in the trash, its Deathknell is a finalized triggered item on the chain, and the REMAINING unit (Brute, took 6) has already been healed", async () => {
    const game = await faefolkDiesInCombat();
    expect(game.zoneOf("fae")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fae", controller: P1, triggered: true })]);
    expect(game.state("brute")).toMatchObject({ damage: 0, zone: "battlefield-bf1" }); // healed in the same cleanup
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("control has NOT changed hands yet: bf1 is still contested and still P1's while the Deathknell is on the chain — so P1's hidden Zhonya's is still there and may be flipped in response", async () => {
    const game = await faefolkDiesInCombat();
    expect(bf1(game)).toMatchObject({ contested: true, controller: P1 });
    expect(game.zoneOf("zhonya")).toBe("facedown-bf1");
    expect(game.p1.can("reveal", "zhonya")).toBe(true);
    const p1Energy = game.p1.energy();
    await game.p1.reveal("zhonya");
    expect(game.zoneOf("zhonya")).not.toBe("facedown-bf1");
    expect(game.zoneOf("zhonya")).not.toBe("trash");
    expect(game.p1.energy()).toBe(p1Energy); // played from hidden for [0]
  });

  test("the flipped Zhonya's does NOT prevent the Deathknell unit from dying (it already died): the Deathknell pays out, Zhonya's stays in play for another unit, and only THEN does P2 take bf1", async () => {
    const game = await faefolkDiesInCombat();
    const runes0 = game.p1.runes().length;
    const hand0 = game.p1.hand().length;
    await game.p1.reveal("zhonya");
    await game.settle();
    expect(game.zoneOf("fae")).toBe("trash");
    expect(game.p1.runes()).toHaveLength(runes0 + 2);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.zoneOf("zhonya")).toBe("base"); // a live gear in P1's base, saved for later
    expect(game.p1.gear()).toContain("zhonya");
    expect(bf1(game)).toMatchObject({ contested: false, controller: P2 }); // step 2: control changes after the chain
    expect(game.zoneOf("brute")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });

  test("'saved for another unit': later that Zhonya's replaces the Bystander's death — Zhonya's is killed instead and the Bystander survives exhausted in base", async () => {
    const game = await faefolkDiesInCombat();
    await game.p1.reveal("zhonya");
    await game.settle();
    await game.p2.do("addResources", { energy: 1 });
    // P2 still holds the Bolt (the combat line never cast it): 6 to the 2-Might Bystander would kill it.
    await game.p2.cast("bolt", { targets: "bystander" });
    await game.settle();
    expect(game.zoneOf("zhonya")).toBe("trash");
    expect(game.zoneOf("bystander")).toBe("base");
    expect(game.state("bystander")).toMatchObject({ damage: 0, isExhausted: true });
  });

  // RULING-CONFLICT: riftjudge b43c764cfdfe5b69 says that OUTSIDE a showdown control is lost immediately when the last unit dies, so
  // the hidden card is trashed before the Deathknell can be responded to. CR 808.1.d.2 (the Deathknell becomes a Pending Item BEFORE
  // the unit is trashed) + 401.1 (a Pending Item ⇒ Closed State) + 190.4 / 323.6 (control lapses only in an OPEN-State Cleanup),
  // with official clarification 9a32c2cc829f221a — engine follows CR: P1 keeps bf1 (and the facedown card) while the Deathknell is
  // on the chain; the card is only trashed at the first Open Cleanup after the chain empties.
  test("outside a showdown (Bolt kills the lone Faefolk): while its Deathknell is on the chain bf1 is STILL P1's and the hidden Zhonya's is still flippable; unflipped, it is trashed once the chain empties and bf1 becomes uncontrolled", async () => {
    const game = await board().build();
    await game.p2.cast("bolt", { targets: "fae" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Bolt resolves
    if (game.decision()?.kind === "order") {
      await game.acceptTriggerOrder();
    }
    expect(game.zoneOf("fae")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fae", controller: P1, triggered: true })]);
    expect(bf1(game)?.controller).toBe(P1);
    expect(game.zoneOf("zhonya")).toBe("facedown-bf1");
    expect(game.p1.can("reveal", "zhonya")).toBe(true);
    // Decline to flip: let the Deathknell resolve.
    await game.p1.passPriority();
    await game.settle();
    expect(bf1(game)).toMatchObject({ contested: false, controller: null });
    expect(game.zoneOf("zhonya")).toBe("trash");
  });
});
