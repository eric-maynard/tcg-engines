/**
 * Ruling f221c2ec4e7fa635 — Ava Achiever (OGN-107 → ogn-107-298) · Unit · Mind · 5 · 4 Might
 *   "When I attack, you may pay [mind] to play a card with [Hidden] from your hand, ignoring its cost. If it's a unit, play it here."
 *   × Hostile Takeover (SFD-202 → sfd-202-221) · Spell · Mind/Order · 5 · [Hidden] (no Action/Reaction)
 *   "Take control of an enemy unit at a battlefield. Ready it. Lose control of that unit and recall it at end of turn."
 *
 * Q: Attacking with Ava, can I use her trigger to play Hostile Takeover (a plain-speed spell that has [Hidden]) for one power?
 * A: Yes. Hostile Takeover has [Hidden], so it qualifies; you pay only Ava's [mind], not the spell's 5; it is played from
 *    HAND (not "from hidden"), so no from-hidden targeting lock. It goes on the chain via Ava's ability despite being a
 *    normal-speed spell, resolves (steal + ready an enemy unit at that battlefield), and the stolen unit gains the Attacker
 *    designation and joins Ava's attack.
 * Rules: 419.1 / 354 (plays instructed by an ability ignore timing), 811 (Hidden keyword vs playing from facedown),
 *        464.2.c.3.a (a unit arriving on the attacker's side mid-combat becomes an attacker), 455 (control change).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AVA = "ogn-107-298";
const HOSTILE_TAKEOVER = "sfd-202-221";

/**
 * P1's turn. P1: Ava ready in base, Hostile Takeover in hand, exactly 1 mind and NO energy (the spell's [5] must be ignored).
 * P2 holds bf1 with X (3 Might) and Y (2 Might).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 0, power: { mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", AVA, "ava")
    .unit(P2, "bf1", { might: 3, name: "Unit X" }, "x")
    .unit(P2, "bf1", { might: 2, name: "Unit Y" }, "y")
    .hand(P1, HOSTILE_TAKEOVER, "ht");
}

/** Ava attacks bf1; P1 accepts the [mind] opt-in; answer the card pick (Hostile Takeover) and its target (X) as they come. */
async function avaPlaysTakeoverOnX(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("ava", "bf1");
  expect(game.state("ava").combatRole).toBe("attacker");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "ava" } });
  await game.p1.yes();
  // Resolve Ava's trigger: pass priority; pick Hostile Takeover when asked; choose X as its target when asked.
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      const keys = d.options.map((o) => o.card ?? o.key);
      await game.p1.pick(keys.includes("ht") ? "ht" : keys.includes("x") ? "x" : (keys[0] as string));
    } else if (d?.kind === "action" && d.context === "chain" && game.chain().some((c) => c.cardId === "ava")) {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  return game;
}

describe("Ruling f221c2ec4e7fa635 — Ava Achiever may play Hostile Takeover (a [Hidden] normal-speed spell) off her attack trigger", () => {
  test("Ava attacks → 'pay [mind] to play a [Hidden] card from hand': Hostile Takeover qualifies and is put ON THE CHAIN mid-showdown for just the [mind] — its [5] energy is ignored", async () => {
    const game = await avaPlaysTakeoverOnX();
    expect(game.p1.power("mind")).toBe(0);
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("ht")).toBe("chain");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ht", controller: P1, triggered: false })]);
    // Played from HAND: any enemy unit at the battlefield was choosable (no from-hidden lock) — X was accepted.
    expect(game.chain()[0]?.targets).toEqual(["x"]);
  });

  test("it resolves: P1 takes control of X and readies it; X gains the Attacker designation alongside Ava", async () => {
    const game = await avaPlaysTakeoverOnX();
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (d?.kind !== "action" || d.context !== "chain") {
        break;
      }
      await game.seat(d.seat).passPriority();
    }
    expect(game.zoneOf("ht")).not.toBe("chain");
    expect(game.state("x")).toMatchObject({ combatRole: "attacker", controller: P1, isReady: true, location: "bf1", owner: P2 });
    expect(game.state("y")).toMatchObject({ combatRole: "defender", controller: P2 });
  });

  test("the combat is then Ava 4 + X 3 against Y 2: Y dies, P1 conquers bf1; at end of turn X reverts to P2 and is recalled to P2's base", async () => {
    const game = await avaPlaysTakeoverOnX();
    await game.settle();
    expect(game.zoneOf("y")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("x")).toMatchObject({ controller: P1, location: "bf1" });
    expect(game.violations()).toEqual([]);
    await game.advanceTurn();
    expect(game.state("x")).toMatchObject({ controller: P2, location: "base" });
  });

  test("control: declining Ava's opt-in keeps the [mind] and Hostile Takeover in hand — and P1 could never have cast it normally here (no energy, and a plain spell has no showdown timing)", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "ht")).toBe(false); // 0 energy for a [5] spell
    await game.p1.move("ava", "bf1");
    await game.p1.no();
    expect(game.p1.can("cast", "ht")).toBe(false); // in a showdown a normal-speed spell is not playable anyway
    expect(game.zoneOf("ht")).toBe("hand");
    expect(game.p1.power("mind")).toBe(1);
  });
});
