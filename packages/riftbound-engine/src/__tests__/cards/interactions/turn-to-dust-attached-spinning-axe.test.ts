/**
 * Interaction: Turn to Dust (unl-070-219) · Spell · 2 — "Give a gear [Temporary]."
 *   × Spinning Axe (sfd-186-221) · Equipment +3 — printed Rules Text "[Quick-Draw] [Equip][rainbow] [Temporary]", no Effect Text
 *   × Vanguard Sergeant (ogn-219-298) · 4-Might vanilla unit wearing the Axe (4 + 3 = 7)
 *   (+ Vengeance ogn-229-298 "Kill a unit." to un-equip the Axe by killing its bearer for the contrast case)
 *
 * (a) NO side: attached and left alone, the Axe's PRINTED Temporary is Inactive (718.2, 434.1.e, 721.2 — 722.2 names
 *     Spinning Axe as the example) → nothing triggers at P1's Beginning Phase; Axe stays, Sergeant stays 7, scoring normal.
 *  (b) P2 casts Turn to Dust on the ATTACHED Axe: an attached card is still a gear on the board and choosable (718.5,
 *     718.5.a/b). The GRANTED Temporary is not printed Rules Text, so it is active while attached. At the start of P1's
 *     Beginning Phase exactly ONE Temporary trigger goes on the chain (816.1.b, 816.2.a — the printed copy is Inactive)
 *     and kills the Axe → P1's trash (428.2); the Sergeant drops to 4 (137.3.a / 435.1.e), is no longer Equipped
 *     (719.2, 818.3.b), still in base, ready state untouched (719.4) — all before scoring.
 * (c) YES side: the Sergeant died earlier (Vengeance) so the Axe detached and sits loose in P1's base (719.5): its Rules
 *     Text is active again (435.1.c, 723) → printed Temporary kills it at the start of P1's Beginning Phase, before
 *     scoring. [Equip] is a Main-Phase/Open-State gear ability (151.2) — not available in the Beginning Phase, so it
 *     cannot save the Axe.
 * (d) Turn to Dust on an UNATTACHED Axe: printed + granted Temporary are redundant — one trigger, dies once (816.2/816.2.a).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TURN_TO_DUST = "unl-070-219";
const SPINNING_AXE = "sfd-186-221";
const VANGUARD_SERGEANT = "ogn-219-298";
const VENGEANCE = "ogn-229-298";

/**
 * P2's turn (turn 2). P1: Vanguard Sergeant in base wearing Spinning Axe (7), a Holder on P1's bf1 (so P1 has a hold
 * point to score at its next Beginning Phase), power for [Equip]. P2: Turn to Dust + Vengeance in hand, resources for both.
 */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .resources(P1, { energy: 2, power: { fury: 2, rainbow: 2 } })
    .resources(P2, { energy: 8, power: { mind: 2, order: 2, rainbow: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "base", VANGUARD_SERGEANT, "sarge", { equippedWith: ["axe"] })
    .card("axe", { def: SPINNING_AXE, meta: { attachedTo: "sarge" }, owner: P1, zone: "base" })
    .hand(P2, TURN_TO_DUST, "dust")
    .hand(P2, VENGEANCE, "vengeance");
}

/** P2 ends the turn; stop at the first decision of P1's turn (Beginning-Phase trigger window or open main phase). */
async function toP1TurnStart(game: Game): Promise<void> {
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
}

describe("premise", () => {
  test("Sergeant 4 + attached Spinning Axe (+3) = 7; the Axe carries printed Temporary and is controlled/owned by P1", async () => {
    const game = await board().build();
    expect(game.state("axe")).toMatchObject({ attachedTo: "sarge", cardType: "equipment", controller: P1, owner: P1 });
    expect(game.state("axe").keywords).toEqual(expect.arrayContaining(["Quick-Draw", "Equip", "Temporary"]));
    expect(game.state("axe").grantedKeywords).toEqual([]);
    expect(game.state("sarge")).toMatchObject({ attachments: ["axe"], baseMight: 4, might: 7 });
  });
});

describe("(a) NO — attached and untouched: the PRINTED Temporary is Inactive (718.2 / 722.2)", () => {
  test("P1's next Beginning Phase puts nothing on the chain; the Axe stays attached, Sergeant stays 7, and P1 scores its hold normally (+1)", async () => {
    const game = await board().build();
    await toP1TurnStart(game);
    expect(game.chain()).toEqual([]); // no Temporary trigger at all
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("axe")).toBe("base");
    expect(game.state("axe").attachedTo).toBe("sarge");
    expect(game.state("sarge")).toMatchObject({ attachments: ["axe"], might: 7 });
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});

describe("(b) Turn to Dust on the ATTACHED Axe: legal target; the GRANTED Temporary is active and kills it at P1's next Beginning Phase", () => {
  test("an attached Equipment is still 'a gear' on the board — Turn to Dust offers (only) the Axe and resolves onto it: granted Temporary recorded, Axe still attached, Sergeant still 7 (718.5.a/b)", async () => {
    const game = await board().build();
    const offered = game.p2.option("cast", "dust")?.fields.find((f) => f.name === "targets")?.options;
    expect(offered).toEqual([["axe"]]);
    await game.p2.cast("dust", { targets: "axe" });
    await game.settle();
    expect(game.zoneOf("dust")).toBe("trash");
    expect(game.state("axe").grantedKeywords.map((k) => k.keyword)).toEqual(["Temporary"]);
    expect(game.state("axe").attachedTo).toBe("sarge");
    expect(game.state("sarge").might).toBe(7);
  });

  test("at the start of P1's Beginning Phase exactly ONE Temporary trigger (the granted instance; printed one Inactive) is on the chain, sourced by the Axe, before any point is scored (816.2.a)", async () => {
    const game = await board().build();
    await game.p2.cast("dust", { targets: "axe" });
    await game.settle();
    await toP1TurnStart(game);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "axe", controller: P1, triggered: true, type: "ability" })]);
    expect(game.p1.points()).toBe(0); // "before scoring"
    expect(game.zoneOf("axe")).toBe("base"); // not dead until it resolves
  });

  test("it resolves: Axe killed → P1's trash (428.2); Sergeant immediately 4 Might, no attachments / not Equipped, still in base and ready (137.3.a, 435.1.e, 719.2, 719.4); THEN P1 scores its hold", async () => {
    const game = await board().build();
    await game.p2.cast("dust", { targets: "axe" });
    await game.settle();
    await toP1TurnStart(game);
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("axe")).toBe("trash");
    expect(game.p1.trash()).toEqual(["axe"]);
    expect(game.state("axe").attachedTo).toBeUndefined();
    expect(game.state("sarge")).toMatchObject({ attachments: [], baseMight: 4, damage: 0, isReady: true, location: "base", might: 4, zone: "base" });
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1); // scoring happened after the kill
    expect(game.violations()).toEqual([]);
  });

  test("timing contrast: the grant does nothing during the rest of P2's turn — the Axe only dies at ITS CONTROLLER's (P1's) Beginning Phase", async () => {
    const game = await board().build();
    await game.p2.cast("dust", { targets: "axe" });
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("axe")).toBe("base");
    expect(game.state("sarge").might).toBe(7);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });
});

describe("(c) YES — bearer killed first: the loose Axe's printed Temporary is active again and kills it at P1's Beginning Phase; [Equip] cannot pre-empt it", () => {
  test("Vengeance kills the Sergeant on P2's turn: the Axe detaches and stays in P1's base, unattached (719.5)", async () => {
    const game = await board().build();
    await game.p2.cast("vengeance", { targets: "sarge" });
    await game.settle();
    expect(game.zoneOf("sarge")).toBe("trash");
    expect(game.zoneOf("axe")).toBe("base");
    expect(game.state("axe")).toMatchObject({ controller: P1, location: "base" });
    expect(game.state("axe").attachedTo).toBeUndefined();
    expect(game.state("axe").grantedKeywords).toEqual([]); // only its printed Temporary
  });

  test("at P1's Beginning Phase the printed Temporary triggers (one chain item); P1's only options are pass/concede — no [Equip] (151.2: Main Phase, Open State only) — and the Axe is in the trash before P1's Main Phase opens", async () => {
    const game = await board().build();
    await game.p2.cast("vengeance", { targets: "sarge" });
    await game.settle();
    await toP1TurnStart(game);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "axe", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("equipCard")).toBe(false);
    expect(game.p1.can("activate", "axe")).toBe(false);
    expect(game.p1.legal().map((o) => o.moveId).toSorted()).toEqual(["concede", "passChainPriority"]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("axe")).toBe("trash");
    expect(game.p1.points()).toBe(1); // hold scored after the kill
    expect(game.p1.can("equipCard")).toBe(false); // nothing left to equip
    expect(game.violations()).toEqual([]);
  });

  test("control: [Equip] IS a legal action for a loose Axe during P1's own Main Phase in an Open State (151.2) — the Beginning Phase simply comes first", async () => {
    const game = await scenario()
      .resources(P1, { power: { fury: 1 } })
      .unit(P1, "base", VANGUARD_SERGEANT, "sarge")
      .gear(P1, SPINNING_AXE, "axe")
      .build();
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.can("equipCard")).toBe(true);
  });
});

describe("(d) Turn to Dust on an UNATTACHED Axe: printed + granted Temporary are redundant — one trigger, one death (816.2 / 816.2.a)", () => {
  test("both instances present, yet P1's Beginning Phase puts exactly one Axe trigger on the chain and the Axe dies once, cleanly", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .resources(P2, { energy: 2, power: { mind: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .gear(P1, SPINNING_AXE, "axe")
      .hand(P2, TURN_TO_DUST, "dust")
      .build();
    await game.p2.cast("dust", { targets: "axe" });
    await game.settle();
    expect(game.state("axe").keywords).toContain("Temporary");
    expect(game.state("axe").grantedKeywords.map((k) => k.keyword)).toEqual(["Temporary"]);
    await toP1TurnStart(game);
    expect(game.phase()).toBe("beginning");
    expect(game.chain().filter((c) => c.cardId === "axe")).toHaveLength(1);
    expect(game.chain()).toHaveLength(1);
    await game.settle();
    expect(game.zoneOf("axe")).toBe("trash");
    expect(game.p1.trash()).toEqual(["axe"]);
    expect(game.chain()).toEqual([]);
    expect(game.phase()).toBe("main");
    expect(game.violations()).toEqual([]);
  });
});
