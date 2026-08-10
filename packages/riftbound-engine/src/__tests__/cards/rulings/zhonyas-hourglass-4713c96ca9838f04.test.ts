/**
 * Ruling 4713c96ca9838f04 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear "If a friendly unit would die, kill this instead.
 *     Heal that unit, exhaust it, and recall it." (the ruling's example of a REPLACEMENT effect)
 *   × Bounty Hunter (ogn-267-298) legend "[Exhaust]: Give a unit [Ganking] this turn." — an ACTIVATED ability
 *   × Sett, Brawler (ogn-164-298) "When I'm played …, buff me." — a TRIGGERED ability off a permanent entering play
 *   × Crackshot Corsair (ogn-130-298) "When I attack, deal 1 to an enemy unit here." — a targeted trigger
 *   × Stupefy (ogn-095-298) Reaction / Rune Prison (ogn-050-298) Action — the opponent's would-be responses
 *
 * Q: Can card abilities be reacted to like spells, and which kinds cannot be disrupted?
 * A: Activated and triggered abilities go on the chain and opponents may respond (Reactions only) before they resolve;
 *    the target is announced up front; if the target has left that battlefield by resolution the ability does nothing.
 *    Passives and replacement effects (Zhonya's) never use the chain and cannot be responded to; nor can the act of a
 *    permanent entering play itself (only its triggered "play"/"here" abilities can).
 * Rules: 377.3 / 383.3 (activated & triggered abilities use the chain), 309.1.a (Closed state ⇒ Reactions only),
 *        355.5–355.7 (targets chosen at finalization), 359.3.e.5 (illegal-by-resolution target ⇒ instruction skipped),
 *        366–371 (replacement effects apply as the event happens, no chain), 359.2 (a permanent leaves the chain on
 *        finalization — no response window to the play itself).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const BOUNTY_HUNTER = "ogn-267-298";
const SETT_BRAWLER = "ogn-164-298";
const CRACKSHOT_CORSAIR = "ogn-130-298";
const STUPEFY = "ogn-095-298"; // [1] mind Reaction
const RUNE_PRISON = "ogn-050-298"; // Action: "Stun a unit."
const SKULKER = "ogn-175-298"; // vanilla [3] unit
/** P1's Reaction: recall a friendly unit (moves the trigger's target off the battlefield). */
const RETREAT = {
  abilities: [{ effect: { target: { controller: "friendly", type: "unit" }, type: "recall" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "calm",
  energyCost: 0,
  name: "Retreat (inline Reaction: recall a friendly unit)",
  timing: "reaction",
} as const;
/** P2's removal: deal 5 to a unit. */
const BOLT = {
  abilities: [{ effect: { amount: 5, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Bolt (inline: deal 5 to a unit)",
  timing: "action",
} as const;

/** P1's turn. P1: MF legend, Sett + Skulker in hand with [8]+[body]; Ally (2) in base. P2: Stupefy + Rune Prison, plenty of resources. */
function p1Board() {
  return scenario()
    .resources(P1, { energy: 8, power: { body: 1 } })
    .resources(P2, { energy: 5, power: { calm: 2, mind: 2 } })
    .legend(P1, BOUNTY_HUNTER, "mfLegend")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Watcher" }, "watcher")
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .hand(P1, SETT_BRAWLER, "sett")
    .hand(P1, SKULKER, "sk")
    .hand(P2, STUPEFY, "stupefy")
    .hand(P2, RUNE_PRISON, "prison");
}

async function toP2Window(game: Game): Promise<void> {
  if (game.decision()?.kind === "action" && game.decision()?.seat === P1) {
    await game.p1.passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
}

describe("Ruling 4713c96ca9838f04 — activated and triggered abilities use the chain and can be responded to (Reactions only)", () => {
  test("ACTIVATED (Bounty Hunter): the ability is a chain item with its target announced; P2 gets a window where Stupefy (Reaction) is legal and Rune Prison (Action) is not; nothing is granted until it resolves", async () => {
    const game = await p1Board().build();
    await game.p1.activate("mfLegend", undefined, { targets: "ally" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mfLegend", controller: P1, targets: ["ally"], triggered: false })]);
    expect(game.state("ally").keywords).not.toContain("Ganking");
    await toP2Window(game);
    expect(game.p2.can("cast", "stupefy")).toBe(true);
    expect(game.p2.can("cast", "prison")).toBe(false);
    await game.p2.cast("stupefy", { targets: "ally" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["mfLegend", "stupefy"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("ally").keywords).toContain("Ganking");
    expect(game.state("ally").might).toBe(1); // Stupefy resolved first (LIFO)
  });

  test("TRIGGERED off a permanent entering play (Sett's 'When I'm played, buff me'): Sett himself is on the board at once, but his trigger is a chain item P2 may react to before the buff lands", async () => {
    const game = await p1Board().build();
    await game.p1.play("sett");
    expect(game.zoneOf("sett")).toBe("base"); // the permanent is already in play…
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sett", controller: P1, triggered: true })]); // …its trigger is pending
    expect(game.state("sett").isBuffed).toBe(false);
    await toP2Window(game);
    expect(game.p2.can("cast", "stupefy")).toBe(true);
    expect(game.p2.can("cast", "prison")).toBe(false);
    await game.settle();
    expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 5 });
  });

  test("…whereas the PLAY of a permanent itself cannot be responded to: a vanilla unit resolves with no chain and no window for P2 at all", async () => {
    const game = await p1Board().build();
    await game.p1.play("sk");
    expect(game.zoneOf("sk")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.can("cast", "stupefy")).toBe(false);
  });
});

describe("Ruling 4713c96ca9838f04 — a REPLACEMENT effect (Zhonya's) never touches the chain and cannot be responded to", () => {
  test("P2's Bolt kills P1's Ally: at the moment it would die Zhonya's simply applies — no new chain item, no priority window between the lethal damage and the save; Zhonya's is killed instead and Ally sits in base exhausted", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 1, power: { mind: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Ally" }, "ally")
      .gear(P1, ZHONYAS, "zhonyas")
      .hand(P1, STUPEFY, "stupefy")
      .hand(P2, BOLT, "bolt")
      .build();
    await game.p2.cast("bolt", { targets: "ally" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority(); // Bolt resolves → the death is replaced on the spot
    expect(game.chain()).toEqual([]); // Zhonya's added nothing to respond to
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.state("ally")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});

describe("Ruling 4713c96ca9838f04 — target announced up front; moved off the battlefield before resolution ⇒ the ability does nothing", () => {
  /** P2's turn. P1 holds bf1 with D1 (2) and D2 (4) and has the Retreat reaction; P2's Corsair (3) attacks. */
  function corsairBoard() {
    return scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "D1" }, "d1")
      .unit(P1, "bf1", { might: 4, name: "D2" }, "d2")
      .hand(P1, RETREAT, "retreat")
      .unit(P2, "base", CRACKSHOT_CORSAIR, "corsair");
  }

  test("the Corsair's 'deal 1 to an enemy unit here' names its target (D1) as it goes on the chain — a FIN-timing pick for P2 before anyone can respond", async () => {
    const game = await corsairBoard().build();
    await game.p2.move("corsair", "bf1");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2, source: { cardId: "corsair" }, timing: "FIN" });
    await game.p2.pick("d1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "corsair", targets: ["d1"], triggered: true })]);
  });

  test("P1 responds by recalling D1 to base (Reaction); the trigger then resolves and does NOTHING — D1 undamaged in base, D2 (still 'here') is not hit instead", async () => {
    const game = await corsairBoard().build();
    await game.p2.move("corsair", "bf1");
    await game.p2.pick("d1");
    if (game.decision()?.seat === P2) {
      await game.p2.passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.cast("retreat", { targets: "d1" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["corsair", "retreat"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Retreat resolves: D1 → base
    expect(game.locationOf("d1")).toBe("base");
    await game.p2.passPriority();
    await game.p1.passPriority(); // the Corsair's trigger resolves with an illegal target
    expect(game.chain()).toEqual([]);
    expect(game.state("d1")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.state("d2")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    await game.settle(); // combat: Corsair 3 into D2 4 → Corsair dies
    expect(game.zoneOf("corsair")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
