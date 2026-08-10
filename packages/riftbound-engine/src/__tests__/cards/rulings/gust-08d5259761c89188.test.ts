/**
 * Ruling 08d5259761c89188 — Gust (OGN-169 → ogn-169-298) · Reaction · [1]
 *     "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   × Blastcone Fae (OGN-097 → ogn-097-298) · Hidden unit · 2 Might · "When you play me, give a unit -2 [Might] this turn (min 1)."
 *   × Block (OGN-057 → ogn-057-298) · Hidden Action spell · "Give a unit [Shield 3] and [Tank] this turn."
 *   × a Hidden gear (Zhonya's Hourglass ogn-077-298 stands in; unl-133-219 Blast Cone is listed but has no Hidden).
 *
 * Q: What happens to a hidden card when the unit it sits with is Gusted away from that battlefield?
 * A: If you don't react, Gust resolves, your unit leaves, and the hidden card is put into trash at the cleanup.
 *    You MAY react with the hidden card first: a hidden unit (Blastcone Fae) is played at that battlefield and
 *    stays; a hidden spell (Block) can be played but may do nothing useful; a hidden gear is played there and is
 *    recalled to base once the unit is gone.
 * Rules: 811 (Hidden; facedown card removed at cleanup once you lose the battlefield; 811.1.d.1.a hidden gear is
 *        played TO that battlefield), 518 (cleanup recalls loose gear), 340 (react before Gust resolves).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const BLASTCONE_FAE = "ogn-097-298";
const BLOCK = "ogn-057-298";
const ZHONYAS = "ogn-077-298";

/** P1's turn with exactly [1]. P2's 3-Might Scout alone holds bf1 with one facedown card `hidden` beside it. */
function board(hidden: string) {
  return scenario()
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Scout" }, "scout")
    .facedown(P2, "bf1", hidden, "hid")
    .hand(P1, GUST, "gust");
}

/** P1 Gusts the Scout and passes → P2's reaction window with Gust on the chain. */
async function gustPending(hidden: string): Promise<Game> {
  const game = await board(hidden).build();
  await game.p1.cast("gust", { targets: "scout" });
  expect(game.p1.energy()).toBe(0);
  await game.p1.passPriority();
  expect(game.chain().map((c) => c.cardId)).toEqual(["gust"]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 08d5259761c89188 — a hidden card when its unit is Gusted away", () => {
  test("no reaction: Gust resolves, Scout returns to P2's hand, P2 loses bf1 and the still-facedown card is put into TRASH at cleanup", async () => {
    const game = await board(BLASTCONE_FAE).build();
    await game.p1.cast("gust", { targets: "scout" });
    await game.settle();
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.p2.hand()).toContain("scout");
    expect(game.zoneOf("hid")).toBe("trash");
    expect(game.p2.facedown("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.violations()).toEqual([]);
  });

  test("P2 CAN react with the hidden card while still holding the battlefield — the reveal is on P2's menu before Gust resolves", async () => {
    const game = await gustPending(BLASTCONE_FAE);
    expect(game.p2.can("reveal", "hid")).toBe(true);
    expect(game.zoneOf("scout")).toBe("battlefield-bf1"); // Gust has not resolved yet
  });

  test("hidden UNIT (Blastcone Fae): played from facedown AT bf1 in response (its -2 aimed at the Scout); Gust then bounces the Scout but the Fae stays and P2 keeps bf1", async () => {
    const game = await gustPending(BLASTCONE_FAE);
    await game.p2.reveal("hid", { answers: ["scout"] });
    expect(game.zoneOf("hid")).toBe("battlefield-bf1");
    let stop = await game.settle();
    if (stop.reason === "unanswered" && game.decision()?.seat === P2) {
      await game.p2.pick("scout");
      stop = await game.settle();
    }
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.zoneOf("hid")).toBe("battlefield-bf1");
    expect(game.state("hid")).toMatchObject({ cardType: "unit", might: 2 });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("hidden SPELL (Block): can be played on the Scout in response and resolves (Shield 3 + Tank), but it does nothing about Gust — the Scout is still returned to hand", async () => {
    const game = await gustPending(BLOCK);
    expect(game.p2.can("reveal", "hid")).toBe(true);
    await game.p2.reveal("hid", { answers: ["scout"] });
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      await game.p2.pick("scout");
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["gust", "hid"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Block resolves first
    expect(game.zoneOf("hid")).toBe("trash");
    expect(game.state("scout").grantedKeywords.map((k) => k.keyword).sort()).toEqual(["Shield", "Tank"]);
    await game.settle(); // Gust resolves
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
  });

  test("hidden GEAR (Zhonya's): revealed in response it is played, and once the Scout is Gusted away the gear ends up in P2's BASE (recalled), not trashed", async () => {
    const game = await gustPending(ZHONYAS);
    expect(game.p2.can("reveal", "hid")).toBe(true);
    await game.p2.reveal("hid");
    expect(game.state("hid").isHidden).toBe(false);
    await game.settle();
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.zoneOf("hid")).toBe("base");
    expect(game.p2.gear()).toEqual(["hid"]);
  });

  // RULING-CONFLICT: riftjudge 08d5259761c89188 says a revealed hidden gear lingers AT bf1 while the Scout is
  // still there and is recalled only once the unit is gusted away; CR 457.1/149.3 make an unattached non-unit
  // gear at a battlefield a recall candidate, rule 323.7 step 5 recalls it to base during a cleanup, and rule
  // 319.6 forces a cleanup as soon as the revealed gear enters — so it is in base before Gust ever resolves.
  // Engine follows CR.
  test("revealed hidden gear (CR): the cleanup that follows it entering recalls it to base, and it stays there once the Scout is gusted", async () => {
    const game = await gustPending(ZHONYAS);
    await game.p2.reveal("hid");
    expect(game.zoneOf("scout")).toBe("battlefield-bf1"); // Gust still pending
    expect(game.zoneOf("hid")).toBe("base"); // rule 323.7: recalled by the cleanup rule 319.6 triggers
    await game.settle();
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.zoneOf("hid")).toBe("base");
    expect(game.p2.gear()).toEqual(["hid"]);
  });
});
