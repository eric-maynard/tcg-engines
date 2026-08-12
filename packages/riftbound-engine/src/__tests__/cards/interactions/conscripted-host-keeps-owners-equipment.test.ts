/**
 * Interaction: Conscription (unl-140-219) · Spell · Chaos · 5 + [chaos][chaos]
 *     "You may spend 5 XP as an additional cost to play this. Choose an enemy unit at a battlefield
 *      with 3 [Might] or less. If you paid the additional cost, choose any enemy unit at a battlefield
 *      instead. Take control of it, exhaust it, and recall it."
 *   × B.F. Sword (sfd-161-221) · Equipment · +3 Might Bonus
 *   × Recurve Bow (sfd-016-221) · Equipment · +0 · "When I attack or defend, deal 2 to an enemy unit here."
 *
 * Rules: 718.3 / 477.2.c (an attached card's Effect Text is APPENDED to the top-most card's rules text —
 * so the granted ability belongs to the top-most card and its controller), 718.4 / 477.3.d (Might Bonuses
 * apply to the top-most card in layer 3), 718.5.c / 434.4 (an attached card's location follows the
 * top-most card and cannot be moved separately), 718.5.e / 718.5.f (attached cards may have a different
 * controller, and control changes of either do not propagate), 455 / 456 / 456.1 (a Recall is not a Move
 * and fires no move triggers), 458.1 (a Recall leaves damage and statuses alone), 056.2 (a card entering
 * the trash goes to its OWNER's), 124 / 124.1 (a non-board zone change makes a new object),
 * 435.1 / 435.4.a / 435.4.b (detach on the host leaving the board; unattached gear goes home in a Cleanup).
 *
 * Q: P1 has a 3-Might unit at bf1 wearing P1's B.F. Sword and P1's Recurve Bow. P2 plays Conscription.
 *   (a) is the host a legal choice without the 5 XP — is its Might read as 3 or 6?
 *   (b) do the Equipment change controller, do they move with the host, is that a Move?
 *   (c) whose "enemy" is the Bow's appended trigger, and who picks its target?
 *   (d) the host dies under P2's control: whose trash, where do the Equipment land, who controls them?
 *   (e) "no" leg: strip only the Sword — is the host a legal ≤3-Might Conscription target again?
 */
import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CONSCRIPTION = "unl-140-219";
const BF_SWORD = "sfd-161-221";
const RECURVE_BOW = "sfd-016-221";

/** Bounce-a-gear at Action speed — a mechanism, not a card under test. */
const DISARM = {
  abilities: [{ effect: { target: { type: "gear" }, type: "return-to-hand" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 1,
  name: "Disarm",
  timing: "action",
} as const;

/** Kill-a-unit at Action speed — a mechanism, not a card under test. */
const SNIPE = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Snipe",
  timing: "action",
} as const;

/** A 3-Might host that draws when it MOVES — used to prove the Conscription recall is not a Move. */
const MOVE_TRIGGER_HOST = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "move", on: "self" }, type: "triggered" }],
  might: 3,
  name: "Host",
};

/**
 * P2's turn, P2 holding Conscription with the [chaos][chaos] + 5 energy for it. P1 holds bf1 with a
 * 3-Might Host (2 damage already marked) wearing P1's Sword and Bow, plus a 2-Might Runt as the
 * control case for "3 Might or less"; bf2 is P1's with a Guard and a Squire.
 */
function board({ host = { might: 3, name: "Host" } as object, xp = 5 } = {}) {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 6, power: { chaos: 2 } })
    .xp(P2, xp)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", host, "host", { damage: 2, equippedWith: ["sword", "bow"] })
    .card("sword", { def: BF_SWORD, meta: { attachedTo: "host" }, owner: P1, zone: "bf1" })
    .card("bow", { def: RECURVE_BOW, meta: { attachedTo: "host" }, owner: P1, zone: "bf1" })
    .unit(P1, "bf1", { might: 2, name: "Runt" }, "runt")
    .unit(P1, "bf2", { might: 4, name: "Guard" }, "guard")
    .unit(P1, "bf2", { might: 2, name: "Squire" }, "squire")
    .unit(P2, "base", { might: 2, name: "Buddy" }, "buddy")
    .hand(P2, CONSCRIPTION, "conscription");
}

const targetsOf = (game: Awaited<ReturnType<ReturnType<typeof board>["build"]>>): string[] => {
  const field = game.p2.option("cast", "conscription")?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
};

describe("Conscription takes the host but not its owner's Equipment", () => {
  // ------------------------------------------------------------------ (a) whose Might is read

  test("(a) 'with 3 [Might] or less' reads CURRENT Might: the worn Sword makes the host a 6 (718.4 / 477.3.d), so without the 5 XP only the 2-Might units are offered", async () => {
    const game = await board({ xp: 0 }).build();
    expect(game.state("host")).toMatchObject({ baseMight: 3, might: 6 });
    expect(targetsOf(game).sort()).toEqual(["runt", "squire"]); // the 3-Might host reads as a 6
    await expect(game.p2.cast("conscription", { targets: "host" })).rejects.toThrow();
  });

  test("(a) paying the 5 XP additional cost opens 'any enemy unit at a battlefield' — the host becomes choosable and the XP is actually spent", async () => {
    const game = await board().build();
    expect(targetsOf(game).sort()).toEqual(["guard", "host", "runt", "squire"]);
    await game.p2.cast("conscription", { targets: "host", payOptional: true });
    await game.settle();
    expect(game.p2.xp()).toBe(0);
    expect(game.state("host").controller).toBe(P2);
  });

  // ------------------------------------------------------------------ (b) what travels, what does not

  test("(b) 718.5.f: control of the top-most card changing does NOT change control of the attached cards — the Sword and Bow stay P1's while their host becomes P2's, still attached and still worth +3", async () => {
    const game = await board().build();
    await game.p2.cast("conscription", { targets: "host", payOptional: true });
    await game.settle();
    expect(game.state("host")).toMatchObject({ controller: P2, owner: P1, isExhausted: true, might: 6 });
    for (const eq of ["sword", "bow"]) {
      expect(game.state(eq)).toMatchObject({ attachedTo: "host", controller: P1, owner: P1, zone: "base" });
    }
    expect(game.state("host").attachments.sort()).toEqual(["bow", "sword"]);
    expect(game.violations()).toEqual([]);
  });

  test("(b) 458.1: the recall leaves the host's marked damage alone and its freshly-applied exhausted status stands", async () => {
    const game = await board().build();
    await game.p2.cast("conscription", { targets: "host", payOptional: true });
    await game.settle();
    expect(game.state("host")).toMatchObject({ damage: 2, isExhausted: true });
    expect(game.locationOf("host")).toBe("base");
    // 434.4 / 718.5.c — the worn Sword and Bow are located with their host.
    expect(game.p2.base().sort()).toEqual(["bow", "buddy", "host", "sword"]);
  });

  test("(b) 455 / 456.1: the recall is expressly not a Move — a host whose own trigger is 'when I move, draw 1' draws for nobody", async () => {
    const game = await board({ host: MOVE_TRIGGER_HOST }).build();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.p2.cast("conscription", { targets: "host", payOptional: true });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(p1Hand);
    expect(game.p2.hand()).toHaveLength(p2Hand - 1); // only Conscription left the hand
  });

  // Expected (rules): 434.4 / 718.5.c tie an attached card's location to the top-most card and forbid
  // moving it separately, so the Sword and Bow are relocated into P2's base along with their host.
  // Actual: the engine relocates only the unit — both Equipment stay behind in P1's base zone while
  // reporting `attachedTo: "host"`, i.e. an attached card at a different location than its host.
  test("attached Equipment travel with a conscripted host — they are located wherever the top-most card is, i.e. in P2's base (434.4 / 718.5.c)", async () => {
    const game = await board().build();
    await game.p2.cast("conscription", { targets: "host", payOptional: true });
    await game.settle();
    expect(game.p2.base().sort()).toEqual(["bow", "buddy", "host", "sword"]);
    expect(game.p1.base()).toEqual([]);
  });

  // ------------------------------------------------------------------ (c) whose ability is it

  test("(c) the Bow's appended trigger is an ability of the TOP-MOST card (718.3 / 477.2.c): P2 controls it — P2 is asked, and 'an enemy unit here' is read from P2's seat, so P1's units are offered and P2's own Buddy is not", async () => {
    const game = await board().build();
    await game.p2.cast("conscription", { targets: "host", payOptional: true });
    await game.settle();
    await game.p2.do("readyCard", { cardId: "host" });
    await game.p2.move(["host", "buddy"], "bf2"); // the host attacks → "When I attack … deal 2"
    const ask = game.decision() as PickDecision;
    expect(ask).toMatchObject({ kind: "pick", seat: P2 });
    expect(ask.options.map((o) => o.key).sort()).toEqual(["guard", "squire"]);
    expect(ask.options.map((o) => o.key)).not.toContain("buddy");
    await game.p2.pick("guard");
    while (game.chain().length > 0) {
      await game.acting().passPriority();
    }
    expect(game.state("guard").damage).toBe(2);
    expect(game.state("squire").damage).toBe(0);
  });

  // ------------------------------------------------------------------ (d) the host dies under P2

  test("(d) 056.2: the host dies under P2's control but goes to its OWNER P1's trash; the Equipment do not die — they detach, stay controlled by P1 and end up in P1's base", async () => {
    const game = await board().hand(P1, SNIPE, "snipe").build();
    await game.p2.cast("conscription", { targets: "host", payOptional: true });
    await game.settle();
    await game.advanceTurn(); // P1's turn
    await game.p1.do("addResources", { energy: 1 });
    await game.p1.cast("snipe", { targets: "host" });
    await game.settle();
    expect(game.zoneOf("host")).toBe("trash");
    expect(game.p1.trash()).toContain("host");
    expect(game.p2.trash()).not.toContain("host");
    for (const eq of ["sword", "bow"]) {
      expect(game.zoneOf(eq)).toBe("base");
      expect(game.state(eq)).toMatchObject({ attachedTo: undefined, controller: P1, owner: P1 });
    }
    expect(game.p1.base().sort()).toEqual(["bow", "sword"]);
    expect(game.p2.base()).toEqual(["buddy"]);
  });

  // ------------------------------------------------------------------ (e) strip the Sword instead

  test("(e) removing ONLY the B.F. Sword drops the host back to 3 in layer 3 at once, and Conscription — which re-reads Might as it is chosen — accepts it with no XP spent", async () => {
    const game = await board({ xp: 0 }).hand(P2, DISARM, "disarm").build();
    expect(targetsOf(game).sort()).toEqual(["runt", "squire"]);
    await game.p2.cast("disarm", { targets: "sword" });
    await game.settle();
    expect(game.zoneOf("sword")).toBe("hand");
    expect(game.p1.hand()).toEqual(["sword"]);
    expect(game.state("host")).toMatchObject({ attachments: ["bow"], might: 3 });
    expect(targetsOf(game).sort()).toEqual(["host", "runt", "squire"]);
    await game.p2.cast("conscription", { targets: "host" });
    await game.settle();
    expect(game.state("host").controller).toBe(P2);
    expect(game.p2.xp()).toBe(0);
    expect(game.state("bow")).toMatchObject({ attachedTo: "host", controller: P1 });
  });
});
