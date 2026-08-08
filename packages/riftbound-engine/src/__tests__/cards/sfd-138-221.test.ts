/**
 * Windsinger — sfd-138-221 · Unit · Chaos · 2 energy · 1 Might
 *
 *   [Hidden] (Hide now for [rainbow] to react with later for [energy_0].)
 *   When you play me, you may return another unit at a battlefield with 3 [Might] or less to its
 *   owner's hand.
 *
 * Head-judge notes — the tricky spots for this card:
 *  - Target set: ANOTHER unit (never herself, even when she is played to a battlefield), AT A
 *    BATTLEFIELD (either side's; base units are safe), with CURRENT Might ≤ 3 (359.3.f.2): a printed-3
 *    that is buffed to 4 is out of reach, a printed-4 shrunk to 3 is in reach. Exactly 3 qualifies.
 *  - "you may": the controller must be able to say no (opt-in prompt or a declinable pick); saying no
 *    bounces nothing. With no legal unit anywhere nothing may be left dangling.
 *  - "its OWNER's hand" (108): a unit P2 controls but P1 owns goes back to P1's hand.
 *  - Hidden (811): hide for one power of any domain at a battlefield you control, no chain; from the
 *    next turn play her from facedown for 0 — she must enter AT that battlefield (811.1.d.1) and the
 *    bounce target must be there too (811.1.d.2). Facedown she has Reaction (811.6): on the opponent's
 *    turn she can answer an attack into her battlefield by bouncing the ≤3-Might attacker before combat.
 *  - The trigger uses the chain: the opponent gets priority before the bounce lands.
 *  - Cost 2 (no power); enters exhausted.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-138-221";

function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 3, name: "Three" }, "three", { damage: 1 })
    .unit(P2, "bf1", { might: 4, name: "Four" }, "four")
    .unit(P2, "base", { might: 1, name: "Home Foe" }, "homeFoe")
    .unit(P1, "bf2", { might: 2, name: "Ally" }, "ally")
    .unit(P1, "base", { might: 1, name: "Home Ally" }, "homeAlly")
    .hand(P1, CARD, "ws");
}

interface Trace {
  offered: string[];
  askedOptIn: number;
  declinablePick: boolean;
}

/**
 * Drive Windsinger's play trigger to completion whatever order the engine asks in (opt-in yes/no,
 * target pick at chain-add or at resolution, priority windows). `target` = the unit to bounce, or
 * `null` to say no. Returns what P1 was offered.
 */
async function drive(game: Game, target: string | null): Promise<Trace> {
  const t: Trace = { askedOptIn: 0, declinablePick: false, offered: [] };
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && (d.context === "main" || d.context === "showdown"))) {
      break;
    }
    if (d.kind === "action") {
      await game.seat(d.seat).pass();
    } else if (d.kind === "yes-no" && d.seat === P1) {
      t.askedOptIn += 1;
      await (target === null ? game.p1.no() : game.p1.yes());
    } else if (d.kind === "pick" && d.seat === P1) {
      t.offered = d.options.map((o) => o.card ?? o.key).sort();
      t.declinablePick = d.allowDecline;
      await (target === null ? game.p1.decline() : game.p1.pick(target));
    } else {
      throw new Error(`unexpected ${d.kind} prompt for ${d.seat}: ${d.prompt}`);
    }
  }
  return t;
}

describe("Windsinger (sfd-138-221)", () => {
  test("cost: 2 energy, no power; enters the base exhausted as a 1-Might unit with printed Hidden; unaffordable at 1", async () => {
    const game = await board().build();
    await game.p1.play("ws", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("ws")).toBe("base");
    expect(game.state("ws")).toMatchObject({ isExhausted: true, might: 1 });
    expect(game.state("ws").keywords).toEqual(["Hidden"]);
    await drive(game, null);
    expect((await board().resources(P1, { energy: 1, power: { chaos: 2 } }).build()).p1.can("play", "ws")).toBe(false);
  });

  test("play trigger offers only OTHER units AT A BATTLEFIELD with ≤3 Might, both sides: three + ally — not four, not base units, not herself (played to bf2)", async () => {
    const game = await board().build();
    await game.p1.play("ws", { to: "bf2" });
    expect(game.chain().some((c) => c.cardId === "ws" && c.triggered)).toBe(true);
    const t = await drive(game, "three");
    expect(t.offered).toEqual(["ally", "three"]);
    expect(game.locationOf("ws")).toBe("bf2");
  });

  test("bouncing the enemy 3-Might unit: it goes to its owner's (P2's) hand with its damage gone; Windsinger stays", async () => {
    const game = await board().build();
    await game.p1.play("ws", { to: "base" });
    await drive(game, "three");
    expect(game.zoneOf("three")).toBe("hand");
    expect(game.p2.hand()).toContain("three");
    expect(game.state("three").damage).toBe(0);
    expect(game.p2.units("bf1")).toEqual(["four"]);
    expect(game.zoneOf("ws")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("a FRIENDLY battlefield unit is a legal choice too — it returns to P1's hand", async () => {
    const game = await board().build();
    await game.p1.play("ws", { to: "base" });
    await drive(game, "ally");
    expect(game.zoneOf("ally")).toBe("hand");
    expect(game.p1.hand()).toEqual(["ally"]);
  });

  test("'you may': P1 can say no (opt-in or declinable pick); saying no bounces nothing and leaves no prompt behind", async () => {
    const game = await board().build();
    await game.p1.play("ws", { to: "base" });
    const t = await drive(game, null);
    expect(t.askedOptIn > 0 || t.declinablePick).toBe(true);
    expect(game.zoneOf("three")).toBe("battlefield-bf1");
    expect(game.zoneOf("ally")).toBe("battlefield-bf2");
    expect(game.p2.hand()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("CURRENT Might decides (359.3.f.2): a printed-3 buffed to 4 is NOT offered; a printed-4 at -1 (=3) IS", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Pumped" }, "pumped", { buffed: true })
      .unit(P2, "bf1", { might: 4, name: "Shrunk" }, "shrunk", { mightModifier: -1 })
      .unit(P2, "bf1", { might: 2, name: "Plain" }, "plain")
      .hand(P1, CARD, "ws")
      .build();
    expect(game.state("pumped").might).toBe(4);
    expect(game.state("shrunk").might).toBe(3);
    await game.p1.play("ws");
    const t = await drive(game, "shrunk");
    expect(t.offered).toEqual(["plain", "shrunk"]);
    expect(game.zoneOf("shrunk")).toBe("hand");
    expect(game.zoneOf("pumped")).toBe("battlefield-bf1");
  });

  test("'its OWNER's hand': a unit P2 controls but P1 owns returns to P1's hand, not P2's", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .card("stolen", { controller: P2, def: { cardType: "unit", might: 2, name: "Stolen" }, owner: P1, zone: "bf1" })
      .unit(P2, "bf1", { might: 2, name: "Plain" }, "plain")
      .hand(P1, CARD, "ws")
      .build();
    expect(game.state("stolen")).toMatchObject({ controller: P2, owner: P1 });
    await game.p1.play("ws");
    await drive(game, "stolen");
    expect(game.zoneOf("stolen")).toBe("hand");
    expect(game.p1.hand()).toContain("stolen");
    expect(game.p2.hand()).not.toContain("stolen");
  });

  test("no other unit with ≤3 Might at any battlefield: nothing is bounced and no prompt is left dangling", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4 }, "four")
      .unit(P2, "base", { might: 1 }, "homeFoe")
      .hand(P1, CARD, "ws")
      .build();
    await game.p1.play("ws");
    const t = await drive(game, "four"); // would throw if "four"/"homeFoe" were ever offered? no — assert instead:
    expect(t.offered.filter((c) => c === "four" || c === "homeFoe")).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("ws")).toBe("base");
    expect(game.zoneOf("four")).toBe("battlefield-bf1");
    expect(game.zoneOf("homeFoe")).toBe("base");
  });

  test("the trigger uses the chain: while it is pending P2 gets a priority window and nothing has been bounced yet", async () => {
    const game = await board().build();
    await game.p1.play("ws", { to: "base" });
    let p2HadPriority = false;
    for (let i = 0; i < 16; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "action" && d.context === "chain" && d.seat === P2) {
        p2HadPriority = true;
        expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ws", controller: P1, triggered: true })]);
        expect(game.zoneOf("three")).toBe("battlefield-bf1"); // not bounced before P2 could react
      }
      if (d.kind === "action") {
        await game.seat(d.seat).pass();
      } else if (d.kind === "yes-no") {
        await game.p1.yes();
      } else if (d.kind === "pick") {
        await game.p1.pick("three");
      }
    }
    expect(p2HadPriority).toBe(true);
    expect(game.zoneOf("three")).toBe("hand");
  });

  test("Hidden: hide for one power (any domain) at a battlefield you control — energy untouched, no chain, not at the enemy's field, not revealable this turn; no power ⇒ cannot hide", async () => {
    const game = await board().resources(P1, { energy: 2, power: { fury: 1 } }).build();
    expect(game.p1.option("hide", "ws")?.fields.find((f) => f.arg === "to")?.options).toEqual(["bf2"]);
    await game.p1.hide("ws", "bf2");
    expect(game.zoneOf("ws")).toBe("facedown-bf2");
    expect(game.state("ws").isHidden).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 0 } });
    expect(game.chain()).toEqual([]);
    expect(game.p1.can("reveal", "ws")).toBe(false);
    expect((await board().build()).p1.can("hide", "ws")).toBe(false);
  });

  test("Hidden → played from facedown on a later turn for 0: she enters AT that battlefield (811.1.d.1) and only ≤3-Might units THERE are offered (811.1.d.2)", async () => {
    const game = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard")
      .unit(P1, "bf1", { might: 3, name: "Sentry" }, "sentry")
      .unit(P2, "bf2", { might: 1, name: "Far" }, "far")
      .hand(P1, CARD, "ws")
      .build();
    await game.p1.hide("ws", "bf1");
    await game.advanceToTurnOf(P2);
    await game.advanceToTurnOf(P1);
    expect(game.p1.can("reveal", "ws")).toBe(true);
    await game.p1.reveal("ws");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // played for [0]
    const t = await drive(game, "guard");
    expect(game.zoneOf("ws")).toBe("battlefield-bf1");
    expect(t.offered).toEqual(["guard", "sentry"]); // not "far" (bf2), not herself
    expect(game.zoneOf("guard")).toBe("hand");
    expect(game.zoneOf("far")).toBe("battlefield-bf2");
  });

  test("Hidden ⇒ Reaction (811.6): on P2's turn a 3-Might raider attacks her battlefield; with Focus P1 plays her from facedown and bounces the raider — no combat, bf1 stays P1's", async () => {
    const game = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Guard" }, "guard")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .hand(P1, CARD, "ws")
      .build();
    await game.p1.hide("ws", "bf1");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.move("raider", "bf1");
    expect(game.p1.can("reveal", "ws")).toBe(false); // the attacker holds Focus first
    await game.p2.passFocus();
    expect(game.p1.can("reveal", "ws")).toBe(true);
    await game.p1.reveal("ws");
    expect(game.chain()).toEqual(expect.arrayContaining([expect.objectContaining({ cardId: "ws", controller: P1 })]));
    const t = await drive(game, "raider");
    expect(t.offered).toEqual(["guard", "raider"]); // restricted to bf1 — which is where the fight is
    await game.settle();
    expect(game.zoneOf("raider")).toBe("hand");
    expect(game.p2.hand()).toContain("raider");
    expect(game.zoneOf("guard")).toBe("battlefield-bf1"); // the 1-Might guard never fought the 3
    expect(game.zoneOf("ws")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("parsed abilities match the printed text: Hidden keyword + optional play-self trigger returning another ≤3-Might battlefield unit to hand", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", energyCost: 2, might: 1, name: "Windsinger" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([
      { keyword: "Hidden", type: "keyword" },
      {
        effect: {
          target: { excludeSelf: true, filter: { might: { lte: 3 } }, location: "battlefield", type: "unit" },
          type: "return-to-hand",
        },
        optional: true,
        trigger: { event: "play-self" },
        type: "triggered",
      },
    ]);
  });
});
