/**
 * Ruling 6ad5ac03412cc119 — Hextech Ray (OGN-009 → ogn-009-298, Action [1][fury] "Deal 3 to a unit at a battlefield.")
 *   × Ride the Wind (OGN-173 → ogn-173-298, Action [2][chaos] "Move a friendly unit and ready it.")
 *   Witnesses: Yasuo, Remorseful (ogn-076-298, 6 Might) "When I attack, deal damage equal to my Might to an enemy unit here." · Treasure Hunter
 *   (sfd-130-221, 1 Might) "When I move, play a Gold gear token exhausted." · Fortified Position (ogn-279-298) "When you defend here, choose a
 *   unit. It gains [Shield 2] this combat."
 *
 * Q: When do "When I move / attack / defend" triggers resolve, and what if Yasuo is killed (Hextech Ray) after triggering but before combat damage?
 * A: Move triggers resolve on their own chain BEFORE the showdown starts. Then the showdown opens and attack + defend triggers go on ONE new chain
 *    together. Non-Reaction cards can't be played until that chain is empty, so Yasuo's attack damage lands first; a Hextech Ray played afterwards
 *    can still kill him before combat damage, so he contributes nothing to it. A unit Ridden into an ongoing combat still fires its attack trigger.
 * Rules: 447/450 (move → cleanup → showdown), 464.2 (initial combat chain: attacker's triggers then defender's), 343.1.a (Closed state),
 *        383.4.e (attack trigger on gaining the designation), 465.2 (combat damage uses units still present).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HEXTECH_RAY = "ogn-009-298";
const RIDE_THE_WIND = "ogn-173-298";
const YASUO = "ogn-076-298";
const TREASURE_HUNTER = "sfd-130-221";
const FORTIFIED_POSITION = "ogn-279-298";

/**
 * P1's turn. P2 controls the live Fortified Position with Bruiser (5) and Wall (8), and holds Hextech Ray + [1][fury]. P1: Yasuo (6, already
 * carrying 3 damage this turn) and Treasure Hunter (1) in base; Ride the Wind + [2][chaos].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .resources(P2, { energy: 1, power: { fury: 1 } })
    .battlefield("fp", { controller: P2, def: FORTIFIED_POSITION, inert: false, owner: P2 })
    .unit(P1, "base", YASUO, "yasuo", { damage: 3 })
    .unit(P1, "base", TREASURE_HUNTER, "hunter")
    .unit(P2, "fp", { might: 5, name: "Bruiser" }, "bruiser")
    .unit(P2, "fp", { might: 8, name: "Wall" }, "wall")
    .hand(P2, HEXTECH_RAY, "ray")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);
const chainTags = (game: Game) => game.chain().map((c) => `${c.cardId}${c.triggered ? "*" : ""}`);

/** Yasuo + Hunter attack fp; resolve the move chain; answer the combat chain (Yasuo → Bruiser, P2 shields the Wall) and resolve it. */
async function attackAndResolveTriggers(): Promise<Game> {
  const game = await board().build();
  await game.p1.move(["yasuo", "hunter"], "fp");
  // Move chain: Treasure Hunter only.
  expect(chainTags(game)).toEqual(["hunter*"]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  // Combat chain: Yasuo (attacker's) under Fortified Position (defender's).
  expect(chainTags(game)).toEqual(["yasuo*", "fp*"]);
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "yasuo" } });
  await game.p1.pick("bruiser");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P2, source: { cardId: "fp" } });
  await game.p2.pick("wall");
  for (let i = 0; i < 6 && game.chain().length > 0; i++) {
    expect(game.p2.can("cast", "ray")).toBe(false); // Closed state: an Action cannot interrupt the triggers
    await game.acting().passPriority();
  }
  expect(game.chain()).toEqual([]);
  return game;
}

describe("Ruling 6ad5ac03412cc119 — move triggers first (own chain), then attack+defend together; Yasuo's trigger lands before any Hextech Ray", () => {
  test("'When I move' resolves on its OWN chain before the showdown exists: only the Hunter's item is on the chain, no showdown is open yet, no attacker designation, and no attack/defend trigger is queued with it", async () => {
    const game = await board().build();
    await game.p1.move(["yasuo", "hunter"], "fp");
    expect(chainTags(game)).toEqual(["hunter*"]);
    expect(showdown(game)?.active ?? false).toBe(false);
    expect(game.state("yasuo").combatRole).toBeNull();
    expect(game.p2.can("cast", "ray")).toBe(false); // Reactions only while the move chain is open
    await game.p1.passPriority();
    await game.p2.passPriority(); // Gold token played
    expect(game.p1.gear().some((g) => game.state(g).isToken)).toBe(true);
    // NOW the showdown begins and the attack + defend triggers share one NEW chain (attacker's first, defender's on top).
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "fp", defendingPlayer: P2, isCombatShowdown: true });
    expect(game.state("yasuo").combatRole).toBe("attacker");
    expect(chainTags(game)).toEqual(["yasuo*", "fp*"]);
  });

  test("that chain resolves in reverse order (Fortified Position's Shield first, then Yasuo's 6 to the Bruiser, who dies) — and P2 could not play Hextech Ray at any point before it emptied", async () => {
    const game = await attackAndResolveTriggers();
    expect(game.state("wall").grantedKeywords).toEqual([{ duration: "combat", keyword: "Shield", value: 2 }]);
    expect(game.zoneOf("bruiser")).toBe("trash"); // Yasuo's damage was dealt before he could be answered
    expect(game.zoneOf("yasuo")).toBe("battlefield-fp");
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "fp" });
  });

  test("only now, with the chain empty and Focus passed to P2, is Hextech Ray legal: it kills the pre-damaged Yasuo (3 + 3 ≥ 6) BEFORE combat damage — the Wall then takes only the Hunter's 1, and the Hunter dies to it", async () => {
    const game = await attackAndResolveTriggers();
    for (let i = 0; i < 2 && game.actingSeat() !== P2; i++) {
      await game.acting().passFocus();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "ray")).toBe(true);
    await game.p2.cast("ray", { targets: "yasuo" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("yasuo")).toBe("trash"); // dead before the combat damage step
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "fp" }); // combat continues without him
    await game.settle();
    expect(showdown(game)).toBeUndefined();
    expect(game.zoneOf("hunter")).toBe("trash");
    expect(game.state("wall")).toMatchObject({ damage: 0, zone: "battlefield-fp" }); // took 1 (not 7), healed after combat
    expect(game.gameState.battlefields.fp?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("nuance — a unit Ridden into an ONGOING combat still gets its attack trigger: Hunter attacks alone, then Ride the Wind brings Yasuo in → he becomes an attacker and 'When I attack' fires (6 to the Bruiser)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .battlefield("fp", { controller: P2 })
      .unit(P1, "base", YASUO, "yasuo")
      .unit(P1, "base", TREASURE_HUNTER, "hunter")
      .unit(P2, "fp", { might: 5, name: "Bruiser" }, "bruiser")
      .unit(P2, "fp", { might: 8, name: "Wall" }, "wall")
      .hand(P1, RIDE_THE_WIND, "rtw")
      .build();
    await game.p1.move("hunter", "fp");
    await game.p1.passPriority();
    await game.p2.passPriority(); // Hunter's move trigger
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "fp" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.cast("rtw", { targets: "yasuo" });
    // The destination may be asked at play time or on resolution (or forced: fp is the only place he can go).
    for (let i = 0; i < 6 && game.zoneOf("rtw") !== "trash"; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick(d.options.find((o) => /fp/.test(o.key))?.key as string);
      } else if (d?.kind === "action") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    if (game.decision()?.kind === "pick" && game.zoneOf("yasuo") !== "battlefield-fp") {
      await game.p1.pick("battlefield-fp");
    }
    expect(game.state("yasuo")).toMatchObject({ combatRole: "attacker", isReady: true, location: "fp" });
    expect(chainTags(game)).toEqual(["yasuo*"]);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "yasuo" } });
    await game.p1.pick("bruiser");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("bruiser")).toBe("trash");
    expect(game.chain()).toEqual([]);
  });
});
