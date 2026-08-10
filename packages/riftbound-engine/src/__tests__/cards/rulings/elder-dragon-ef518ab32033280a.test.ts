/**
 * Ruling ef518ab32033280a — Elder Dragon (UNL-118 → unl-118-219) · Unit · Body · 12+[body]×4 · 10 Might
 *     "Any amount of your damage is enough to kill enemy units. When you play me, choose up to one enemy unit at each
 *      location. Deal 1 to them."
 *   × Tideturner (OGN-199 → ogn-199-298) 2 Might "[Hidden] … When you play me, you may choose a unit you control at another
 *     location. Move me to its location and it to my original location." — P2's, facedown at bf1
 *
 * Q: Opponent plays Elder Dragon while I hold both battlefields with one unit each. Can I flip a hidden Tideturner in
 *    response? Who declares first, and how does it resolve?
 * A: The Dragon's play effect is a trigger on the chain: its controller names the targets (up to one enemy unit per location)
 *    as it goes on the chain; THEN you get priority and may play the hidden Tideturner as a Reaction. LIFO: Tideturner's swap
 *    resolves first; when the Dragon's ability resolves, a target that is no longer at the location it was chosen for no
 *    longer meets the requirement and is unaffected.
 * Rules: 383.4.a (play effect on the chain), 402.2 (targets at finalization), 811 (play from facedown as a Reaction),
 *        340.1 (LIFO), 359.3.e.5/359.3.e.9 (changed/missing target requirement ⇒ unaffected).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ELDER_DRAGON = "unl-118-219";
const TIDETURNER = "ogn-199-298";

/** P1's turn with exactly 12 + 4 body. P2 holds bf1 with U1 (3) and bf2 with U2 (3), Tideturner facedown at bf1 (hidden earlier). */
function board() {
  return scenario()
    .resources(P1, { energy: 12, power: { body: 4 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "U1" }, "u1")
    .unit(P2, "bf2", { might: 3, name: "U2" }, "u2")
    .facedown(P2, "bf1", TIDETURNER, "tt")
    .hand(P1, ELDER_DRAGON, "elder");
}

type PickD = Extract<Decision, { kind: "pick" }>;

/** P1 plays Elder Dragon to base and names U1 + U2 for its play effect. Stops with the finalized item and P1 on priority. */
async function dragonTargetsBoth(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("elder", { to: "base" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
  expect((d as PickD).options.map((o) => o.card ?? o.key).sort()).toEqual(["u1", "u2"]);
  await game.p1.pick("u1", "u2");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "elder", controller: P1, targets: ["u1", "u2"], triggered: true })]);
  return game;
}

/** …P1 passes; P2 flips Tideturner at bf1, accepts its swap and partners U2 (the unit at another location). */
async function tideturnerInResponse(game: Game): Promise<void> {
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("reveal", "tt")).toBe(true);
  await game.p2.reveal("tt");
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P2) {
      await game.p2.yes();
    } else if (d?.kind === "pick" && d.seat === P2) {
      expect(d.options.map((o) => o.card ?? o.key)).toEqual(["u2"]); // "at another location": U1 (here) is not offered
      await game.p2.pick("u2");
    } else {
      break;
    }
  }
  expect(game.locationOf("tt")).toBe("bf1");
  expect(game.chain().map((c) => c.cardId)).toEqual(["elder", "tt"]);
  expect(game.chain()[1]).toMatchObject({ cardId: "tt", controller: P2, targets: ["u2"], triggered: true });
}

describe("Ruling ef518ab32033280a — hidden Tideturner in response to Elder Dragon's play effect", () => {
  test("declarations first: the moment Elder Dragon is played P1 must name its targets (U1 at bf1, U2 at bf2) — a FIN-time pick — and only then does anyone get priority; the item carries both targets", async () => {
    const game = await dragonTargetsBoth();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.state("u1").damage).toBe(0);
    expect(game.state("u2").damage).toBe(0);
  });

  test("with the ability on the chain P2 gets priority and MAY play the facedown Tideturner at bf1 as a Reaction; its own play effect (partner: U2) lands on top of the Dragon's", async () => {
    const game = await dragonTargetsBoth();
    await tideturnerInResponse(game);
  });

  test("LIFO — Tideturner resolves first: Tideturner goes to bf2 and U2 comes to bf1 (Tideturner's original location); the Dragon's item still waits with its ORIGINAL targets", async () => {
    const game = await dragonTargetsBoth();
    await tideturnerInResponse(game);
    for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "tt"); i++) {
      await game.seat(game.decision()!.seat).passPriority();
    }
    expect(game.locationOf("tt")).toBe("bf2");
    expect(game.locationOf("u2")).toBe("bf1");
    expect(game.locationOf("u1")).toBe("bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "elder", targets: ["u1", "u2"] })]);
  });

  test("then the Dragon's ability resolves and re-checks: U2 is no longer at the location it was chosen for ⇒ UNAFFECTED (0 damage, alive); U1 never moved ⇒ takes the 1, which Elder Dragon's passive makes lethal; nothing is re-aimed at Tideturner", async () => {
    const game = await dragonTargetsBoth();
    await tideturnerInResponse(game);
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      await game.seat(game.decision()!.seat).passPriority();
    }
    expect(game.chain()).toEqual([]);
    const hits = game.gameState.damageLog ?? [];
    expect(hits).toEqual([expect.objectContaining({ amount: 1, target: "u1" })]);
    expect(hits.some((r) => r.target === "u2" || r.target === "tt")).toBe(false);
    expect(game.state("u2")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.state("tt")).toMatchObject({ damage: 0, zone: "battlefield-bf2" });
    expect(game.zoneOf("u1")).toBe("trash"); // "any amount of your damage is enough to kill"
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — no response: both chosen units take 1 and both die to the Dragon's passive", async () => {
    const game = await dragonTargetsBoth();
    await game.settle();
    expect(game.zoneOf("u1")).toBe("trash");
    expect(game.zoneOf("u2")).toBe("trash");
  });
});
