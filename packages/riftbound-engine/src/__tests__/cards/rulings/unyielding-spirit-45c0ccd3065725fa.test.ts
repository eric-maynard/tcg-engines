/**
 * Ruling 45c0ccd3065725fa — Unyielding Spirit (OGN-145 → ogn-145-298) · Reaction · [1][body]
 *     "Prevent all spell and ability damage this turn."
 *   × Flurry of Blades (OGN-133 → ogn-133-298) · Reaction · [1] · "Deal 1 to all units at battlefields."
 *   × Elder Dragon (UNL-118 → unl-118-219) · 10 Might · "Any amount of your damage is enough to kill enemy units. …"
 *   × Ruined Rex (UNL-067 → unl-067-219) · 6 Might · "[Deathknell] Deal 4 to an enemy unit."
 *
 * Q: I play Unyielding Spirit, then Flurry of Blades, with Elder Dragon in my base and two enemy Ruined Rex at a
 *    battlefield — how does it resolve?
 * A: Chain (LIFO): Flurry on top of Spirit. Flurry resolves: 1 to every unit at battlefields; with Elder Dragon that
 *    1 is lethal to the enemy Rexes → both die → both Deathknells go on the chain (opponent picks targets/order) and
 *    resolve, dealing their 4s BEFORE Unyielding Spirit resolves. Spirit resolves last; its prevention only covers
 *    the rest of the turn — damage already dealt by the Deathknells stands.
 * Rules: 336–340 (LIFO, triggers added above pending items), 808 (Deathknell), Elder Dragon passive (your damage).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const UNYIELDING_SPIRIT = "ogn-145-298";
const FLURRY_OF_BLADES = "ogn-133-298";
const ELDER_DRAGON = "unl-118-219";
const RUINED_REX = "unl-067-219";
const HEXTECH_RAY = "ogn-009-298"; // [1][fury] — Deal 3 to a unit at a battlefield (post-Spirit probe)

/**
 * P1's turn. P1: Elder Dragon (10) in base, Squire (3) at P1's bf1; hand Unyielding Spirit, Flurry of Blades, Hextech
 * Ray; [3] + [body] + [fury]. P2: two Ruined Rex (6) at P2's bf2.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { body: 1, fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", ELDER_DRAGON, "elder")
    .unit(P1, "bf1", { might: 3, name: "Squire" }, "squire")
    .unit(P2, "bf2", RUINED_REX, "rex1")
    .unit(P2, "bf2", RUINED_REX, "rex2")
    .hand(P1, UNYIELDING_SPIRIT, "us")
    .hand(P1, FLURRY_OF_BLADES, "fob")
    .hand(P1, HEXTECH_RAY, "ray");
}

/** P1 casts Spirit, then (holding priority) Flurry; both pass so Flurry resolves. */
async function spiritThenFlurryResolvesFlurry(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("us");
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  await game.p1.cast("fob");
  expect(game.chain().map((c) => c.cardId)).toEqual(["us", "fob"]); // bottom → top
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

/** P2 answers the two Deathknell target prompts: rex1 → Squire, rex2 → Elder Dragon (asserting P2 is the chooser). */
async function p2AimsDeathknells(game: Game): Promise<void> {
  const wanted = ["squire", "elder"];
  for (let i = 0; i < 6 && wanted.length > 0; i++) {
    const d = game.decision();
    if (d?.kind === "order") {
      expect(d.seat).toBe(P2); // "in the order of your opponent's choosing"
      await game.acceptTriggerOrder();
      continue;
    }
    if (d?.kind !== "pick") {
      break;
    }
    expect(d).toMatchObject({ kind: "pick", seat: P2, semantics: "target" });
    expect(d.options.map((o) => o.key)).toContain("elder"); // "an enemy unit" — P1's units only
    expect(d.options.map((o) => o.key)).toContain("squire");
    expect(d.options.some((o) => /rex/.test(o.key))).toBe(false);
    await game.p2.pick(wanted.shift()!);
  }
}

async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 10 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || !d.passKey) {
      break;
    }
    await game.seat(d.seat).passPriority();
  }
}

describe("Ruling 45c0ccd3065725fa — Spirit under Flurry: Elder Dragon makes Flurry lethal, Rex Deathknells hit before Spirit resolves", () => {
  test("the chain is Spirit (bottom) / Flurry (top); Flurry resolves first: 1 to every unit at battlefields — lethal to BOTH enemy Rexes via Elder Dragon, but only 1 damage to my own Squire", async () => {
    const game = await spiritThenFlurryResolvesFlurry();
    expect(game.zoneOf("fob")).toBe("trash");
    expect(game.zoneOf("rex1")).toBe("trash");
    expect(game.zoneOf("rex2")).toBe("trash");
    expect(game.state("squire")).toMatchObject({ damage: 1, zone: "battlefield-bf1" }); // Elder Dragon: ENEMY units only
    expect(game.state("elder").damage).toBe(0); // in base — not "at a battlefield"
    // Spirit has NOT resolved yet; the two Deathknell items now sit above it.
    expect(game.zoneOf("us")).toBe("chain");
    expect(game.chain().map((c) => c.cardId)).toEqual(["us", "rex1", "rex2"]);
    expect(game.chain().slice(1)).toEqual([
      expect.objectContaining({ cardId: "rex1", controller: P2, triggered: true }),
      expect.objectContaining({ cardId: "rex2", controller: P2, triggered: true }),
    ]);
  });

  test("the opponent aims the Deathknells (P2's picks among MY units); they resolve before Spirit: Squire takes 4 and dies, Elder Dragon takes 4 — Spirit is still on the chain the whole time", async () => {
    const game = await spiritThenFlurryResolvesFlurry();
    await p2AimsDeathknells(game);
    expect(game.chain().find((c) => c.cardId === "rex1")?.targets).toEqual(["squire"]);
    expect(game.chain().find((c) => c.cardId === "rex2")?.targets).toEqual(["elder"]);
    // Resolve just the two Deathknells (LIFO: rex2 then rex1), leaving Spirit.
    for (let i = 0; i < 8 && game.chain().length > 1; i++) {
      const d = game.decision();
      if (d?.kind !== "action" || !d.passKey) {
        break;
      }
      await game.seat(d.seat).passPriority();
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["us"]);
    expect(game.state("elder").damage).toBe(4);
    expect(game.zoneOf("squire")).toBe("trash"); // not protected: Spirit had not resolved
  });

  test("Spirit resolves LAST; from then on spell damage this turn is prevented (a later Hextech Ray deals nothing) — but the Deathknell damage already dealt stays", async () => {
    const game = await board().unit(P1, "bf1", { might: 5, name: "Latecomer" }, "late").build();
    await game.p1.cast("us");
    await game.p1.cast("fob");
    await game.p1.passPriority();
    await game.p2.passPriority();
    await p2AimsDeathknells(game);
    await drainChain(game);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("us")).toBe("trash");
    expect(game.state("elder").damage).toBe(4); // dealt before Spirit resolved — not undone
    expect(game.zoneOf("squire")).toBe("trash");
    expect(game.state("late").damage).toBe(1); // Flurry's 1 (before Spirit)
    // Now, after Spirit: spell damage is prevented for the rest of the turn.
    await game.p1.cast("ray", { targets: "late" });
    await game.settle();
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.state("late").damage).toBe(1); // +0: prevented
    expect(game.violations()).toEqual([]);
  });
});
