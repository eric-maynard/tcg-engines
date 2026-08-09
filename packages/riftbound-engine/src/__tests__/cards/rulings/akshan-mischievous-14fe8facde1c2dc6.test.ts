/**
 * Ruling 14fe8facde1c2dc6 — Akshan, Mischievous (SFD-109 → sfd-109-221)
 *   "[Weaponmaster] You may pay [body][body] as an additional cost to play me. When you play me, if you paid
 *    the additional cost, move an enemy gear to your base. You control it until I leave the board. If it's an
 *    Equipment, attach it to me."
 *   × Guardian Angel (SFD-051 → sfd-051-221, Equipment +1) "If I would die, kill Guardian Angel instead. Heal
 *     me, exhaust me, and recall me."
 *
 * Q: Akshan stole the opponent's Guardian Angel and then dies — does the GA go back to the opponent's trash
 *    or their base?
 * A: The GA's replacement effect applies to the death: Guardian Angel is killed INSTEAD (→ trash, its owner's)
 *    and Akshan is healed, exhausted and recalled. Only if Akshan leaves the board WITHOUT dying (e.g. banished)
 *    is the GA not destroyed: the control effect ends, it detaches and is recalled to its original owner's base.
 * Rules: 369–373 (replacement effects; 370.1.a.1 the replaced death never happens), 428.2 (killed → owner's
 *        trash), 435.1 / 719.5 (detach + recall of loose gear when the bearer leaves), 455 ("until" control).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AKSHAN = "sfd-109-221";
const GUARDIAN_ANGEL = "sfd-051-221";
const PORTAL_RESCUE = "ogn-102-298"; // [Action] 3 + [mind]: Banish a friendly unit, then its owner plays it to their base.

/** Inline P2 Action spell: deal 6 to a unit — lethal for a 5-Might Akshan. */
const BIG_BOLT = {
  abilities: [{ effect: { amount: 6, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Big Bolt",
  timing: "action",
};

/**
 * P1's turn 2. P2's Unit U (3) at P2's bfB wears P2's Guardian Angel (→ 4); P2 also has a loose Trinket so
 * Akshan's pick is real. P1: Akshan + Portal Rescue in hand, 4 + 3 energy, [body][body] + [mind]. P2 holds Big Bolt.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { body: 2, mind: 1 } })
    .battlefield("bfB", { controller: P2 })
    .unit(P2, "bfB", { might: 3, name: "Unit U" }, "U", { equippedWith: ["ga"] } as Record<string, unknown>)
    .card("ga", { def: GUARDIAN_ANGEL, meta: { attachedTo: "U" } as Record<string, unknown>, owner: P2, zone: "bfB" })
    .gear(P2, { cardType: "gear", name: "Trinket" }, "trinket")
    .hand(P1, AKSHAN, "akshan")
    .hand(P1, PORTAL_RESCUE, "portal")
    .hand(P2, BIG_BOLT, "bolt");
}

/** P1 plays Akshan paying [body][body] and takes the Guardian Angel off U; it attaches to Akshan (4 + 1 = 5). */
async function gaStolen(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("akshan", { payOptional: true, to: "base" });
  expect(game.p1.resources()).toEqual({ energy: 3, power: { body: 0, mind: 1 } });
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick("ga");
  await game.settle();
  expect(game.state("ga")).toMatchObject({ attachedTo: "akshan", controller: P1, location: "base", owner: P2 });
  expect(game.state("akshan")).toMatchObject({ attachments: ["ga"], might: 5 });
  expect(game.state("U")).toMatchObject({ attachments: [], might: 3 });
  return game;
}

describe("Ruling 14fe8facde1c2dc6 — a stolen Guardian Angel still dies for Akshan; only a non-death exit sends it home", () => {
  test("setup: Akshan (paid) steals the worn Guardian Angel — controlled by P1, owned by P2, attached to Akshan who is now 5", async () => {
    const game = await gaStolen();
    expect(game.p1.gear()).toEqual(["ga"]);
    expect(game.p2.gear()).toEqual(["trinket"]);
  });

  // Expected: the GA replacement applies to Akshan's death — GA killed into its OWNER's (P2's) trash; Akshan
  // survives at 0 damage, exhausted, in P1's base (4 Might again, nothing attached).
  // Actual: Akshan dies into P1's trash and the GA is NOT killed — it detaches, reverts to P2 and is recalled
  // to P2's base (the engine skips the replacement for a stolen/"until I leave" equipment).
  test("ruling 14fe8facde1c2dc6 — lethal damage to Akshan wearing a stolen Guardian Angel kills Akshan instead of the GA", async () => {
    const game = await gaStolen();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("ga")).toMatchObject({ attachedTo: "akshan", controller: P1 });
    await game.p2.do("addResources", { energy: 1 });
    await game.p2.cast("bolt", { targets: "akshan" });
    await game.settle({ policy: "first" }); // accept any replacement-ordering prompt
    // Guardian Angel died instead → its owner's trash.
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.p2.trash()).toContain("ga");
    expect(game.p1.trash()).not.toContain("ga");
    expect(game.p2.base()).not.toContain("ga");
    // Akshan lives: healed, exhausted, (still) in P1's base, back to 4.
    expect(game.zoneOf("akshan")).toBe("base");
    expect(game.p1.trash()).not.toContain("akshan");
    expect(game.state("akshan")).toMatchObject({ attachments: [], controller: P1, damage: 0, isExhausted: true, location: "base", might: 4 });
    expect(game.violations()).toEqual([]);
  });

  test("ruling 14fe8facde1c2dc6 (nuance) — Akshan leaves WITHOUT dying (Portal Rescue banishes and replays him): the GA is NOT destroyed; the control effect ends, it detaches and is recalled to its ORIGINAL OWNER's (P2's) base, unattached; the replayed Akshan is a fresh 4 with nothing", async () => {
    const game = await gaStolen();
    expect(game.p1.can("cast", "portal")).toBe(true);
    await game.p1.cast("portal", { targets: "akshan" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, mind: 0 } });
    await game.settle({ policy: "first" }); // Akshan is replayed for free (no additional cost → no new steal)
    // Guardian Angel: not in any trash, back with P2 in P2's base, loose.
    expect(game.zoneOf("ga")).toBe("base");
    expect(game.p1.trash()).not.toContain("ga");
    expect(game.p2.trash()).not.toContain("ga");
    expect(game.state("ga")).toMatchObject({ attachedTo: undefined, controller: P2, location: "base", owner: P2 });
    expect(game.p2.gear().sort()).toEqual(["ga", "trinket"]);
    expect(game.p1.gear()).toEqual([]);
    // Akshan came back to P1's base as a new object.
    expect(game.state("akshan")).toMatchObject({ attachments: [], controller: P1, location: "base", might: 4 });
    expect(game.p1.banishment()).not.toContain("akshan");
    expect(game.zoneOf("portal")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
