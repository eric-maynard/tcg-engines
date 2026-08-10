/**
 * Ruling cf699a6e4accff85 — Baited Hook (OGN-242 → ogn-242-298) · Gear · [1][order], [Exhaust]:
 *   "Kill a friendly unit. Look at the top 5 cards of your Main Deck. You may banish a unit from among them that has
 *    Might up to 1 more than the killed unit and play it, ignoring its cost. Then recycle the rest."
 *   × Star Spring (UNL-215 → unl-215-219) · Battlefield — "The first time a player plays a non-token unit here each turn,
 *     they may move another unit they control here to its base."
 *   × Harnessed Dragon (OGN-234 → ogn-234-298) · Unit · 6 — "When you play me, kill an enemy unit."
 *   (Deathknell unit: Ruined Rex unl-067-219 · 6 · "[Deathknell] — Deal 4 to an enemy unit.")
 *
 * Q: Baited Hook kills a Deathknell unit and plays Harnessed Dragon onto Star Spring — what is the sequence, when are
 *    targets announced, and when do I decide on Star Spring?
 * A: Hook resolves: the unit dies → its Deathknell trigger goes on the chain; you look at 5 and play the Dragon; the
 *    Dragon's play trigger and Star Spring's trigger fire simultaneously — you (controlling both) ORDER them; targets
 *    for both are chosen as they go on the chain, and Star Spring's "may" is decided when it triggers. The chain then
 *    resolves LIFO: top trigger, next trigger, then the Deathknell.
 * Rules: 808.1.d.2 (Deathknell trigger), 383.3.d (order simultaneous triggers), 383.3.a (optional trigger decided when
 *        it triggers), 355.8 (targets on finalize), LIFO.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BAITED_HOOK = "ogn-242-298";
const STAR_SPRING = "unl-215-219";
const HARNESSED_DRAGON = "ogn-234-298";
const RUINED_REX = "unl-067-219";
const SKULKER = "ogn-175-298";

/**
 * P1's turn. bf1 IS Star Spring (live), held by P1 with Ruined Rex (6, Deathknell) and Buddy (2). Baited Hook ready in
 * base, exactly [1][order]. Deck top: Harnessed Dragon (6 ≤ 6+1) then four Skulkers. P2: E1 (3) and E2 (5) in base.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { order: 1 } })
    .battlefield("bf1", { controller: P1, def: STAR_SPRING, inert: false })
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, "bf1", RUINED_REX, "rex")
    .unit(P1, "bf1", { might: 2, name: "Buddy" }, "buddy")
    .unit(P2, "base", { might: 3, name: "E1" }, "e1")
    .unit(P2, "base", { might: 5, name: "E2" }, "e2")
    .deck(P1, [HARNESSED_DRAGON, SKULKER, SKULKER, SKULKER, SKULKER], ["dragon", "f1", "f2", "f3", "f4"]);
}

interface Seen {
  lookOptions?: (string | undefined)[];
  rexTargetAsked: boolean;
  dragonDestinations?: string[];
  dragonTargetAsked: boolean;
  starSpringOptIn: boolean;
  order?: Extract<Decision, { kind: "order" }>;
}

/**
 * Activate the Hook on Rex, let it resolve, and answer every prompt of the sequence: play the Dragon to bf1, Rex's
 * Deathknell → E2, Dragon → E1, accept Star Spring (Buddy). Stops at the trigger-order offer (or the first priority
 * window) and reports what was asked along the way.
 */
async function hookRexIntoDragon(game: Game): Promise<Seen> {
  const seen: Seen = { dragonTargetAsked: false, rexTargetAsked: false, starSpringOptIn: false };
  const targetsField = game.p1.option("activate", "hook")?.fields.find((f) => f.name === "targets");
  if (targetsField) {
    await game.p1.activate("hook", 0, { targets: "rex" });
  } else {
    await game.p1.activate("hook", 0, { answers: ["rex"] });
  }
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  expect(game.state("hook").isExhausted).toBe(true);
  await game.p1.passPriority();
  await game.p2.passPriority(); // Hook resolves
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1 && d.semantics === "from-revealed") {
      seen.lookOptions = d.options.map((o) => o.card);
      await game.p1.pick("dragon");
    } else if (d?.kind === "pick" && d.seat === P1 && d.source?.cardId === "rex") {
      seen.rexTargetAsked = true;
      await game.p1.pick("e2");
    } else if (d?.kind === "pick" && d.seat === P1 && d.semantics === "destination") {
      seen.dragonDestinations = d.options.map((o) => o.zone ?? o.key);
      await game.p1.pick(d.options.find((o) => (o.zone ?? o.key) === "battlefield-bf1")?.key ?? "battlefield-bf1");
    } else if (d?.kind === "pick" && d.seat === P1 && d.source?.cardId === "dragon") {
      seen.dragonTargetAsked = true;
      await game.p1.pick("e1");
    } else if (d?.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "bf1") {
      seen.starSpringOptIn = true;
      await game.p1.yes();
    } else if (d?.kind === "pick" && d.seat === P1 && d.source?.cardId === "bf1") {
      await game.p1.pick("buddy");
    } else if (d?.kind === "order") {
      seen.order = d;
      break;
    } else {
      break;
    }
  }
  return seen;
}

describe("Ruling cf699a6e4accff85 — Baited Hook → Deathknell trigger, then Dragon + Star Spring triggers ordered by P1, resolved LIFO", () => {
  test("Hook resolves: Rex is killed and its Deathknell trigger is the FIRST item on the chain; the look-at-5 offers the Dragon (6 ≤ 6+1) and it can be played to Star Spring (bf1)", async () => {
    const game = await board().build();
    const seen = await hookRexIntoDragon(game);
    expect(game.zoneOf("rex")).toBe("trash");
    expect(seen.lookOptions).toContain("dragon");
    expect(seen.dragonDestinations).toEqual(expect.arrayContaining(["base", "battlefield-bf1"]));
    expect(game.zoneOf("dragon")).toBe("battlefield-bf1");
    expect(game.chain()[0]).toMatchObject({ cardId: "rex", controller: P1, targets: ["e2"], triggered: true });
    expect(game.p1.deck().slice(-4).toSorted()).toEqual(["f1", "f2", "f3", "f4"]); // the rest recycled
  });

  test("targets are announced as each trigger goes on the chain (Rex → E2, Dragon → E1) and Star Spring's 'may' is decided when it triggers — all BEFORE anything resolves; then P1 is offered the ORDER of its two simultaneous triggers", async () => {
    const game = await board().build();
    const seen = await hookRexIntoDragon(game);
    expect(seen.rexTargetAsked).toBe(true);
    expect(seen.dragonTargetAsked).toBe(true);
    expect(seen.starSpringOptIn).toBe(true);
    expect(seen.order).toMatchObject({ kind: "order", seat: P1 });
    expect(seen.order?.items.map((i) => i.card).toSorted()).toEqual(["bf1", "dragon"]);
    // Nothing has resolved yet: both enemies untouched, Buddy still at bf1.
    expect(game.state("e1").damage).toBe(0);
    expect(game.zoneOf("e1")).toBe("base");
    expect(game.state("e2").damage).toBe(0);
    expect(game.locationOf("buddy")).toBe("bf1");
    const chain = game.chain();
    expect(chain).toHaveLength(3);
    expect(chain[0]).toMatchObject({ cardId: "rex", targets: ["e2"] });
    expect(chain.slice(1).map((c) => c.cardId).toSorted()).toEqual(["bf1", "dragon"]);
    expect(chain.find((c) => c.cardId === "dragon")).toMatchObject({ targets: ["e1"], triggered: true });
    expect(chain.find((c) => c.cardId === "bf1")).toMatchObject({ targets: ["buddy"], triggered: true });
  });

  test("P1 orders Star Spring on top: LIFO — Buddy goes to base first, then the Dragon kills E1, and the Deathknell (4 to E2) resolves LAST", async () => {
    const game = await board().build();
    const seen = await hookRexIntoDragon(game);
    expect(seen.order).toBeDefined();
    const dragonKey = seen.order!.items.find((i) => i.card === "dragon")!.key;
    const springKey = seen.order!.items.find((i) => i.card === "bf1")!.key;
    await game.p1.order([dragonKey, springKey]); // first = bottom … last = top
    expect(game.chain().map((c) => c.cardId)).toEqual(["rex", "dragon", "bf1"]);
    // Top: Star Spring.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.locationOf("buddy")).toBe("base");
    expect(game.zoneOf("e1")).toBe("base");
    expect(game.chain().map((c) => c.cardId)).toEqual(["rex", "dragon"]);
    // Next: Dragon.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("e1")).toBe("trash");
    expect(game.state("e2").damage).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["rex"]);
    // Last: Deathknell.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("e2")).toMatchObject({ damage: 4, zone: "base" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("…or the Dragon on top: then E1 dies before Buddy is sent home — either way the Deathknell is last", async () => {
    const game = await board().build();
    const seen = await hookRexIntoDragon(game);
    const dragonKey = seen.order!.items.find((i) => i.card === "dragon")!.key;
    const springKey = seen.order!.items.find((i) => i.card === "bf1")!.key;
    await game.p1.order([springKey, dragonKey]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["rex", "bf1", "dragon"]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("e1")).toBe("trash");
    expect(game.locationOf("buddy")).toBe("bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.locationOf("buddy")).toBe("base");
    expect(game.state("e2").damage).toBe(0);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("e2").damage).toBe(4);
    expect(game.chain()).toEqual([]);
  });
});
