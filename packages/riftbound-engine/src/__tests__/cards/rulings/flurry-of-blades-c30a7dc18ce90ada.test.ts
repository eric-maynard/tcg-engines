/**
 * Ruling c30a7dc18ce90ada — Flurry of Blades (OGN-133 → ogn-133-298) · Reaction · 1 · "Deal 1 to all units at battlefields."
 *   × Elder Dragon (UNL-118 → unl-118-219) · 12 · 10 Might · "Any amount of your damage is enough to kill enemy units.
 *     When you play me, choose up to one enemy unit at each location. Deal 1 to them."
 *   × Dazzling Aurora (OGN-160 → ogn-160-298) · Gear · "At the end of your turn, reveal cards from the top of your Main
 *     Deck until you reveal a unit and banish it. Play it, ignoring its cost, and recycle the rest."
 *
 * Q: I Flurry of Blades, then at end of turn Dazzling Aurora plays Elder Dragon — do all damaged units at battlefields die?
 * A: Yes (the enemy ones). Flurry's 1 damage stays marked (damage heals only in the Ending Step, after end-of-turn
 *    triggers). When Elder Dragon enters, its passive is live at once; in the Cleanup that follows, every ENEMY unit
 *    carrying my damage is lethal and dies — before anyone can respond to Elder Dragon's play trigger.
 * Rules: 522 (passive applies immediately on entering), 520 / 140.3 (cleanup kills lethally-damaged units), 317
 *        (damage heals in the Ending Step, after end-of-turn triggers), 383 (the play trigger waits on the chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FLURRY_OF_BLADES = "ogn-133-298";
const ELDER_DRAGON = "unl-118-219";
const DAZZLING_AURORA = "ogn-160-298";
const CLEAVE = "ogn-004-298";

/**
 * P1's turn with [1]. Aurora in P1's base; deck top: Elder Dragon, then Cleave. P2: Big (5) + Mid (3) at P2's bf1, Home (2)
 * in base. P1: Mine (3) at P1's bf2. Flurry in hand.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .gear(P1, DAZZLING_AURORA, "aurora")
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 5, name: "Big" }, "big")
    .unit(P2, "bf1", { might: 3, name: "Mid" }, "mid")
    .unit(P2, "base", { might: 2, name: "Home" }, "home")
    .unit(P1, "bf2", { might: 3, name: "Mine" }, "mine")
    .deck(P1, [ELDER_DRAGON, CLEAVE], ["elder", "next"])
    .hand(P1, FLURRY_OF_BLADES, "flurry");
}

async function flurryThenEndTurn(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("flurry");
  await game.settle();
  expect(game.zoneOf("flurry")).toBe("trash");
  await game.p1.endTurn();
  expect(game.phase()).toBe("ending");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "aurora", controller: P1, triggered: true })]);
  return game;
}

/** Pass priority through Aurora's trigger and put Elder Dragon into P1's base; stop at the next prompt. */
async function elderLands(game: Game): Promise<void> {
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain" && game.chain().some((c) => c.cardId === "aurora")) {
      await game.seat(d.seat).passPriority();
    } else if (d?.kind === "pick" && d.seat === P1 && d.semantics === "destination") {
      await game.p1.pick("base");
    } else {
      break;
    }
  }
}

describe("Ruling c30a7dc18ce90ada — Flurry damage + an end-of-turn Elder Dragon: damaged enemy units die in the cleanup", () => {
  test("Flurry of Blades marks 1 damage on every unit AT A BATTLEFIELD (both sides), none on the unit in base; nobody dies (1 < Might)", async () => {
    const game = await board().build();
    await game.p1.cast("flurry");
    await game.settle();
    expect(game.state("big")).toMatchObject({ damage: 1, zone: "battlefield-bf1" });
    expect(game.state("mid")).toMatchObject({ damage: 1, zone: "battlefield-bf1" });
    expect(game.state("mine")).toMatchObject({ damage: 1, zone: "battlefield-bf2" });
    expect(game.state("home")).toMatchObject({ damage: 0, zone: "base" });
  });

  test("that damage is still marked when the turn ends and Dazzling Aurora's end-of-turn trigger goes on the chain (healing only happens later, in the Ending Step)", async () => {
    const game = await flurryThenEndTurn();
    expect(game.state("big").damage).toBe(1);
    expect(game.state("mid").damage).toBe(1);
    expect(game.state("mine").damage).toBe(1);
    expect(game.zoneOf("elder")).toBe("mainDeck");
  });

  test("Aurora reveals Elder Dragon and plays it free into base: the moment it is on the board, the cleanup kills BOTH damaged enemy units (Big 5, Mid 3 — 1 damage is now lethal) before anyone acts on Elder's play trigger; my own damaged unit and the undamaged Home survive", async () => {
    const game = await flurryThenEndTurn();
    await elderLands(game);
    expect(game.zoneOf("elder")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // "ignoring its cost"
    // Elder's "When you play me" is the pending item now (its choice / a priority window) — and the deaths already happened.
    const d = game.decision();
    expect(d?.seat).toBe(P1);
    expect(game.chain().some((c) => c.cardId === "elder" && c.triggered) || (d?.kind === "pick" && d.source?.cardId === "elder")).toBe(true);
    expect(game.zoneOf("big")).toBe("trash");
    expect(game.zoneOf("mid")).toBe("trash");
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.zoneOf("mine")).toBe("battlefield-bf2"); // "enemy units" only — my damage on MY unit is not lethal
    expect(game.zoneOf("home")).toBe("base"); // undamaged
  });

  test("after the turn fully wraps: Elder Dragon in base, Big and Mid in P2's trash (plus Home, hit for 1 by Elder's own play trigger — also lethal now), Cleave recycled, my unit healed on the Ending Step", async () => {
    const game = await flurryThenEndTurn();
    await elderLands(game);
    // Elder's own play trigger ("up to one enemy unit at each location"): take Home where offered, otherwise decline.
    for (let i = 0; i < 8; i++) {
      const r = await game.settle();
      if (r.reason !== "unanswered") {
        break;
      }
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        if (d.options.some((o) => o.key === "home")) {
          await game.p1.pick("home");
        } else if (d.allowDecline) {
          await game.p1.decline();
        } else {
          await game.p1.pick(d.options[0]?.key as string);
        }
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.zoneOf("elder")).toBe("base");
    expect(game.p2.trash().sort()).toEqual(["big", "home", "mid"]);
    expect(game.zoneOf("next")).toBe("mainDeck");
    expect(game.state("mine")).toMatchObject({ damage: 0, zone: "battlefield-bf2" });
    expect(game.turnPlayer()).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});
