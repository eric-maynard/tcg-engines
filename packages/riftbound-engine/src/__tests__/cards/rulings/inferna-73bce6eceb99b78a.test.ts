/**
 * Ruling 73bce6eceb99b78a — Inferna (UNL-002 → unl-002-219) · 2 · 1 Might "[Ambush] [Assault 2]"
 *   × Here to Help (SFD-111 → sfd-111-221) · Action · [2][body] "[Hidden] You may play a unit from hand to a battlefield you
 *     control, reducing its cost by [3]."
 *   × Hextech Ray (OGN-009 → ogn-009-298) · Action · [1][fury] "Deal 3 to a unit at a battlefield."
 *   × Brynhir Thundersong (OGN-026 → ogn-026-298) · 6 · 5 Might "When you play me, opponents can't play cards this turn."
 *
 * Q: My Inferna sits at a battlefield with a hidden Here to Help. Opponent Hextech Rays Inferna; I react (via Here to Help)
 *    by playing Brynhir Thundersong. Does that make the Hextech Ray fizzle?
 * A: No. Brynhir's play trigger lands on top and resolves first (opponents can't play cards for the rest of the turn),
 *    but that only restricts FUTURE plays; the already-finalized Hextech Ray then resolves and deals 3 to Inferna.
 * Rules: 327/340 (LIFO), 811 (Hidden → Reaction for [0]), 359.3.e (fizzle only if the target became illegal).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const INFERNA = "unl-002-219";
const HERE_TO_HELP = "sfd-111-221";
const HEXTECH_RAY = "ogn-009-298";
const BRYNHIR = "ogn-026-298";
const DISCIPLINE = "ogn-058-298"; // a P2 Reaction to prove "can't play cards" afterwards

const chainIds = (game: Game) => game.chain().map((c) => `${c.cardId}${c.triggered ? "*" : ""}`);

/** P2's turn. P1 controls bf1 with Inferna + a facedown Here to Help; Brynhir in hand with [3] (6 − 3). P2: Hextech Ray + [1][fury], Discipline + [2]. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 3 })
    .resources(P2, { energy: 3, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", INFERNA, "inferna")
    .facedown(P1, "bf1", HERE_TO_HELP, "help")
    .hand(P1, BRYNHIR, "brynhir")
    .hand(P2, HEXTECH_RAY, "ray")
    .hand(P2, DISCIPLINE, "disc");
}

/** P2 Rays Inferna; P1 flips Here to Help in response; it resolves and P1 plays Brynhir to bf1 for [3]. Leaves [ray, brynhir*] on the chain. */
async function rayThenBrynhir(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("ray", { targets: "inferna" });
  expect(chainIds(game)).toEqual(["ray"]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.p1.can("reveal", "help")).toBe(true);
  await game.p1.reveal("help");
  expect(chainIds(game)).toEqual(["ray", "help"]);
  await game.p1.passPriority();
  await game.p2.passPriority(); // Here to Help resolves
  for (let i = 0; i < 4; i++) {
    const d: Decision | null = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      await game.p1.yes();
    } else if (d?.kind === "pick" && d.seat === P1) {
      const unit = d.options.find((o) => o.card === "brynhir" || o.key === "brynhir");
      const dest = d.options.find((o) => o.key === "battlefield-bf1");
      await game.p1.pick((unit ?? dest ?? d.options[0])!.key);
    } else {
      break;
    }
  }
  expect(game.zoneOf("brynhir")).toBe("battlefield-bf1");
  expect(game.p1.energy()).toBe(0); // 6 − 3
  expect(chainIds(game)).toEqual(["ray", "brynhir*"]);
  return game;
}

describe("Ruling 73bce6eceb99b78a — Brynhir played in response does not fizzle an already-cast Hextech Ray", () => {
  test("Brynhir's play trigger goes on TOP of the Hextech Ray; the Ray is still there, uncountered, still targeting Inferna", async () => {
    const game = await rayThenBrynhir();
    expect(game.chain()[0]).toMatchObject({ cardId: "ray", controller: P2, countered: false, targets: ["inferna"] });
    expect(game.chain()[1]).toMatchObject({ cardId: "brynhir", controller: P1, triggered: true });
    expect(game.state("inferna").damage).toBe(0);
  });

  test("LIFO: Brynhir's trigger resolves first — from then on P2 cannot play cards (its affordable Discipline is illegal) — while the Ray still waits", async () => {
    const game = await rayThenBrynhir();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "disc")).toBe(true); // before Brynhir's trigger resolves P2 could still react
    await game.p2.passPriority(); // Brynhir's trigger resolves
    expect(chainIds(game)).toEqual(["ray"]);
    expect(game.chain()[0]?.countered).toBe(false);
    expect(game.state("inferna")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    // P2 gets priority on its own Ray but may not add the Discipline any more.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "disc")).toBe(false);
  });

  test("then the Hextech Ray resolves normally: Inferna (1 Might) takes 3 and dies — nothing 'fizzled'", async () => {
    const game = await rayThenBrynhir();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.zoneOf("inferna")).toBe("trash");
    expect(game.zoneOf("brynhir")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    // And the restriction really is in force for the rest of P2's turn.
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "disc")).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
