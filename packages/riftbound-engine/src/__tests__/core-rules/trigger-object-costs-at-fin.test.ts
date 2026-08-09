/**
 * Core rules — the OBJECT costs of a triggered ability's base cost are chosen and paid at FINALIZATION.
 *
 *   383.3.b / 403.1.b.1 / 204.3.a / 740.4.a.2
 *             a cost within instructions at the start of a trigger's effect (or right after its leading
 *             "you may") — "kill a unit you control here TO …", "recycle another friendly unit TO …",
 *             "pay [1] and return a unit you control here …", "kill 3 other friendly units and/or gear
 *             TO …" — is the trigger's BASE COST
 *   402.1     the leading "you may" is answered while the item is finalized (opt-in prompt, timing FIN)
 *   402.2     every choice — incl. WHICH objects pay — is made while finalizing (402.4.b: not declinable)
 *   402.4 / 404.2  no object to name ⇒ the Pending item is removed silently (no prompt, no chain item)
 *   404.1     the whole cost (resources AND objects) is paid to finalize the item; the paid object leaves
 *             the board NOW through the ordinary kill / recycle / bounce path (Deathknell, tokens 186.1)
 *   337.3 / 340.1  a trigger the payment sets off (Deathknell) is a NEWER pending item: finalized in the
 *             same sweep, above this one, and resolves first (LIFO)
 *   406.4     opponents receive Priority only after all of that
 *   359.3.e.13  an instruction that reads the paid object ("… by the Might of the unit you recycled")
 *             looks back at it as it last was on the board (buffs / modifiers included) — `paidObjects`
 *   DESIGN (DESIGN.md §Paying costs)  a cost whose OBJECTS exist but whose RESOURCES are short keeps its
 *             yes/no with `canAccept:false` (manual pay); declining removes the item, nothing paid
 *   Activated abilities pay their object costs at activation already (402.3 / 404.1) — parity check.
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const DUSK_ROSE_LAB = "unl-209-219"; // "At the start of your Beginning Phase, you may kill a unit you control here to draw 1."
const WATCHFUL_SENTRY = "ogn-096-298"; // [Deathknell] — Draw 1.
const EMPERORS_DAIS = "sfd-207-221"; // "When you conquer here, you may pay [1] and return a unit you control here … If you do, play a 2-Might Sand Soldier here."
const RUMBLE = "sfd-026-221"; // "When I conquer, you may recycle another friendly unit to play a Mech from your trash. Reduce its Energy cost by the Might of the unit you recycled."
const MEGA_MECH = "ogn-088-298"; // 7-cost 8-Might Mech
const BOTTLED_CONSTELLATION = "ven-067-166"; // "At the start of your Main Phase, you may kill 3 other friendly units and/or gear to score 1 point."
const ESCAPED_GRAYBACK = "ven-124-166"; // "[Empower] — Kill a friendly unit"

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

const isChainPriorityFor = (seat: string) => (d: Decision | null) => d?.kind === "action" && d.context === "chain" && d.seat === seat;

/** Both players pass once → the newest chain item resolves. */
async function resolveTop(game: Game): Promise<void> {
  await game.acting().passPriority();
  await game.acting().passPriority();
}

/** A unit alone walks onto an empty enemy battlefield; both pass focus → conquer. */
async function conquer(game: Game, unit: string, bf: string): Promise<void> {
  await game.p1.move(unit, bf);
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "showdown") {
      break;
    }
    await game.acting().passFocus();
  }
  expect(game.gameState.battlefields[bf]?.controller).toBe(P1);
}

describe("kill-cost at finalization (Dusk Rose Lab × Watchful Sentry)", () => {
  function board() {
    return scenario()
      .turn(2)
      .active(P2)
      .battlefield("lab", { controller: P1, def: DUSK_ROSE_LAB, inert: false, owner: P1 })
      .unit(P1, "lab", WATCHFUL_SENTRY, "sentry")
      .unit(P1, "base", { might: 2, name: "Homebody" }, "home");
  }

  test("opt-in (FIN) → the lone unit here pays at once: it is in the trash, its Deathknell is finalized ABOVE the trigger, and only then does P1 (then P2) hold priority (404.1, 337.3, 406.4)", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "lab" }, timing: "FIN" });
    expect(game.zoneOf("sentry")).toBe("battlefield-lab"); // nothing paid before the answer
    await game.p1.yes();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.zoneOf("home")).toBe("base"); // never a candidate — not "here"
    expect(game.chain().map((c) => [c.cardId, c.controller, c.triggered])).toEqual([
      ["lab", P1, true],
      ["sentry", P1, true],
    ]);
    const paid = (game.gameState.interaction?.chain?.items[0] as { paidObjects?: { id: string; lki: { zone?: string } }[] }).paidObjects;
    expect(paid?.map((p) => [p.id, p.lki.zone])).toEqual([["sentry", "battlefield-lab"]]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(isChainPriorityFor(P2)(game.decision())).toBe(true);
    expect(game.p1.hand()).toHaveLength(0); // nothing resolved yet
  });

  test("LIFO: the Deathknell 'Draw 1' resolves first while the Lab trigger still waits; nothing is asked or paid again at resolution", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.p1.yes();
    await resolveTop(game);
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["lab"]);
    await resolveTop(game);
    expect(game.decision()?.kind).not.toBe("yes-no");
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(3); // Deathknell + Lab, then the turn's own draw step
    expect(game.zoneOf("sentry")).toBe("trash");
  });

  test("empty object set (only the opponent's unit here): the trigger is removed silently — no prompt, no chain item, no priority window (402.4 / 404.2)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("lab", { controller: P1, def: DUSK_ROSE_LAB, inert: false, owner: P1 })
      .unit(P2, "lab", { might: 2, name: "Squatter" }, "squatter")
      .unit(P1, "base", { might: 2, name: "Homebody" }, "home")
      .build();
    await game.p2.endTurn();
    expect(game.chain()).toEqual([]);
    expect(game.decision()?.kind).not.toBe("yes-no");
    expect(game.decision()?.kind).not.toBe("pick");
    await game.settle();
    expect(game.zoneOf("squatter")).toBe("battlefield-lab");
    expect(game.zoneOf("home")).toBe("base");
  });
});

describe("return-cost + resource at finalization (Emperor's Dais)", () => {
  function board(energy: number) {
    return scenario()
      .resources(P1, { energy })
      .battlefield("dais", { controller: null, def: EMPERORS_DAIS, inert: false, owner: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .unit(P1, "base", { might: 1, name: "Homebody" }, "home");
  }

  test("accepting pays [1] AND bounces the unit here before the first priority window; the bounced unit rides on the item as a paid object (404.1, 406.4)", async () => {
    const game = await board(1).build();
    await conquer(game, "scout", "dais");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "dais" }, timing: "FIN" });
    await game.p1.yes();
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.zoneOf("home")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    const item = game.gameState.interaction?.chain?.items[0] as { cardId: string; paidObjects?: { id: string }[]; optional?: boolean };
    expect(item).toMatchObject({ cardId: "dais", optional: false, paidObjects: [expect.objectContaining({ id: "scout" })] });
    await game.settle();
    expect(game.cardsAt("dais").map((id) => game.state(id).name)).toEqual(["Sand Soldier"]);
  });

  test("DESIGN: objects exist but the [1] is short → the yes/no is still shown with canAccept:false; 'no' removes the item, nothing bounced or paid, no priority window", async () => {
    const game = await board(0).build();
    await conquer(game, "scout", "dais");
    const d = game.decision();
    expect(d).toMatchObject({ canAccept: false, kind: "yes-no", seat: P1, timing: "FIN" });
    expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
    await game.p1.no();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("scout")).toBe("battlefield-dais");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});

describe("recycle-cost with look-back Might (Rumble, Hotheaded)", () => {
  test("the recycled unit's LAST board Might (6 printed +1 buff = 7) is snapshotted onto the item and discounts the Mech to [0]; the unit is already in the deck when P2 first has priority (359.3.e.13, 406.4)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 0 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", RUMBLE, "rumble")
      .unit(P1, "base", { might: 6, name: "Big Friend" }, "big", { buffed: true })
      .trash(P1, MEGA_MECH, "mega")
      .build();
    expect(game.state("big").might).toBe(7);
    await conquer(game, "rumble", "bf1");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, timing: "FIN" });
    await game.p1.yes(); // lone "another friendly unit" → bound without a pick
    expect(game.zoneOf("big")).toBe("mainDeck");
    const item = game.gameState.interaction?.chain?.items.find((it) => it.cardId === "rumble") as { paidObjects?: { id: string; lki: { might: number } }[] };
    expect(item.paidObjects?.map((p) => [p.id, p.lki.might])).toEqual([["big", 7]]);
    await game.p1.passPriority();
    expect(isChainPriorityFor(P2)(game.decision())).toBe(true);
    expect(game.zoneOf("mega")).toBe("trash"); // played on resolution
    // Resolve: pick the Mech (public trash pick) and a destination; it costs 7 − 7 = 0.
    for (let i = 0; i < 12 && game.zoneOf("mega") !== "base"; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        const want = d.options.find((o) => (o.card ?? o.key) === "mega" || o.key === "base");
        await game.p1.pick((want?.card ?? want?.key) as string);
      } else {
        await game.settle({ maxSteps: 1 });
      }
    }
    expect(game.zoneOf("mega")).toBe("base");
    expect(game.p1.energy()).toBe(0);
  });

  test("no other friendly unit → nothing can pay: no prompt, no chain item (402.4 / 404.2)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", RUMBLE, "rumble")
      .trash(P1, MEGA_MECH, "mega")
      .build();
    await conquer(game, "rumble", "bf1");
    expect(game.decision()?.kind).not.toBe("yes-no");
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("mega")).toBe("trash");
  });
});

describe("multi-object cost is all-or-nothing (Bottled Constellation)", () => {
  test("'kill 3 other friendly units and/or gear': one forced FIN pick of EXACTLY three (min 3 / max 3, not declinable) among the OTHER friendly permanents; all three die before anyone has priority and the point waits for resolution", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .gear(P1, BOTTLED_CONSTELLATION, "bottle")
      .unit(P1, "base", { might: 1, name: "A" }, "a")
      .unit(P1, "base", { might: 1, name: "B" }, "b")
      .unit(P1, "base", { might: 1, name: "C" }, "c")
      .gear(P1, { name: "Trinket" }, "trinket")
      .unit(P2, "base", { might: 2, name: "Theirs" }, "theirs")
      .build();
    await game.p2.endTurn();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
    await game.p1.yes();
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", max: 3, min: 3, seat: P1, timing: "FIN" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["a", "b", "c", "trinket"]);
    expect((await game.p1.try((p) => p.pick("a"))).ok).toBe(false); // fewer than three is not a payment
    await game.p1.pick("a", "b", "trinket");
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.zoneOf("trinket")).toBe("trash");
    expect(game.zoneOf("c")).toBe("base");
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.settle();
    expect(game.p1.points()).toBe(1);
  });
});

describe("parity: an ACTIVATED ability's object cost is likewise paid before anyone can respond (402.3 / 404.1)", () => {
  test("Escaped Grayback '[Empower] — Kill a friendly unit': the sacrificed unit is in the trash while the ability still waits on the chain for P2's response", async () => {
    const game = await scenario()
      .unit(P1, "base", ESCAPED_GRAYBACK, "grayback")
      .unit(P1, "base", { might: 1, name: "Fodder" }, "fodder")
      .build();
    await game.p1.activate("grayback", 0, { sacrifice: "fodder" });
    expect(game.zoneOf("fodder")).toBe("trash");
    expect(game.state("grayback").isEmpowered).toBeFalsy(); // the effect waits
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "grayback", controller: P1 })]);
    await game.p1.passPriority();
    expect(isChainPriorityFor(P2)(game.decision())).toBe(true);
    await game.p2.passPriority();
    expect(game.state("grayback").isEmpowered).toBe(true);
  });
});
