/**
 * Ruling 02226c73e317dd06 — Tideturner (OGN-199 → ogn-199-298) · Unit · Chaos · [2] · 2 Might
 *     "[Hidden] When you play me, you may choose a unit you control at another location. Move me to its location and it to my
 *      original location."
 *   × Yasuo, Remorseful (ogn-076-298) · 6 Might "When I attack, deal damage equal to my Might to an enemy unit here."
 *
 * Q: Does Tideturner work with cards in hand or only on the battlefield? If Yasuo is swapped into a showdown by Tideturner, does
 *    his "when I attack" trigger?
 * A: Only units already on the board can be chosen (not cards in hand). A unit swapped into a combat gets the designation that
 *    matches its controller's role; its Attack/Defend trigger fires only if that role matches — Yasuo swapped in while his
 *    controller is the DEFENDER does not get his attack trigger.
 * Rules: 355 (choose = a unit you control on the board), 464.2.c.3.a (late arrivals take their controller's designation),
 *        383.4.e/f (attack vs defend triggers), 811 (Hidden).
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TIDETURNER = "ogn-199-298";
const YASUO = "ogn-076-298";

/** P2's turn 3. P1 holds bfA (Guard 3 + Tideturner facedown) and bfB (Scout 1); Yasuo (6) sits in P1's base; a second Yasuo is in P1's HAND. P2: Raider (4). */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P1 })
    .unit(P1, "bfB", { might: 1, name: "Scout" }, "scout")
    .unit(P1, "bfA", { might: 3, name: "Guard" }, "guard")
    .facedown(P1, "bfA", TIDETURNER, "tide")
    .unit(P1, "base", YASUO, "yasuo")
    .hand(P1, YASUO, "yasuoInHand")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider");
}

/** Raider attacks bfA; P2 passes Focus; P1 flips Tideturner there and opts into the swap. Returns at the partner pick (or after auto-bind). */
async function flipTideturner(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bfA");
  expect(game.state("guard").combatRole).toBe("defender");
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("reveal", "tide")).toBe(true);
  await game.p1.reveal("tide");
  expect(game.zoneOf("tide")).toBe("battlefield-bfA");
  const d = game.decision();
  expect(d).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" }); // "you may choose …"
  await game.p1.yes();
  return game;
}

describe("Ruling 02226c73e317dd06 — Tideturner swaps with a unit on the BOARD; a swapped-in Yasuo on the defending side gets no attack trigger", () => {
  test("the partner choice (asked at finalization) offers only units P1 controls ON THE BOARD at another location (Yasuo in base, Scout at bfB) — never the Yasuo in hand, nor the Guard at Tideturner's own location", async () => {
    const game = await flipTideturner();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target", timing: "FIN" });
    const offered = (d as PickDecision).options.map((o) => o.card ?? o.key).toSorted();
    expect(offered).toEqual(["scout", "yasuo"]); // board units at other locations only — not the Yasuo in hand, not the Guard here
    await game.p1.pick("yasuo");
    expect(game.chain().find((c) => c.cardId === "tide")).toMatchObject({ controller: P1, targets: ["yasuo"], triggered: true });
    expect(game.zoneOf("yasuoInHand")).toBe("hand");
  });

  test("the swap resolves: Tideturner → base, Yasuo → bfA, where — his controller being the DEFENDER — he gains the Defender designation", async () => {
    const game = await flipTideturner();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("yasuo");
    }
    await game.p1.passPriority();
    await game.p2.passPriority(); // Tideturner's trigger resolves
    expect(game.locationOf("tide")).toBe("base");
    expect(game.locationOf("yasuo")).toBe("bfA");
    expect(game.state("yasuo").combatRole).toBe("defender");
    expect(game.state("raider").combatRole).toBe("attacker");
  });

  test("…so Yasuo's 'When I attack' does NOT trigger: no Yasuo item ever appears on the chain and the Raider takes no ability damage before combat", async () => {
    const game = await flipTideturner();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("yasuo");
    }
    let sawYasuoTrigger = false;
    for (let i = 0; i < 8; i++) {
      sawYasuoTrigger ||= game.chain().some((c) => c.cardId === "yasuo");
      const d = game.decision();
      if (d?.kind === "order" && d.defaultable) {
        await game.acceptTriggerOrder();
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    sawYasuoTrigger ||= game.chain().some((c) => c.cardId === "yasuo");
    expect(sawYasuoTrigger).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.state("raider").damage).toBe(0);
    // Combat then resolves normally with Yasuo defending: 4 into Guard(3)+Yasuo(6); 9 back kills the Raider.
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.locationOf("yasuo")).toBe("bfA");
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — Yasuo's trigger is an ATTACK trigger: on P1's own turn, moving Yasuo into an enemy battlefield does put it on the chain", async () => {
    const game = await scenario()
      .battlefield("bfA", { controller: P2 })
      .unit(P2, "bfA", { might: 3, name: "Guard" }, "guard")
      .unit(P1, "base", YASUO, "yasuo")
      .build();
    await game.p1.move("yasuo", "bfA");
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("guard");
    }
    expect(game.chain().some((c) => c.cardId === "yasuo" && c.triggered)).toBe(true);
  });
});
