/**
 * Ruling 11676d63dbda6e52 — Challenge (OGN-128 → ogn-128-298) · Body Action spell · [2][body]
 *   "Choose a friendly unit and an enemy unit. They deal damage equal to their Mights to each other."
 *   × Back Off (UNL-042 → unl-042-219) · Calm Action spell · [3] — "[Hidden] [Stun] a unit. (It doesn't deal
 *     combat damage this turn.) If you played this from your hand, draw 1."
 *
 * Q: Challenge compares units at DIFFERENT battlefields. Can a hidden Back Off be flipped to stun the
 *    "attacking" unit, and would the stun prevent Challenge's damage?
 * A: No and no. A hidden card may only affect the battlefield it is hidden at, so a Back Off facedown at
 *    battlefield 2 cannot choose Fiora at battlefield 1 (it cannot be played for that at all). And even a
 *    stunned unit still deals Challenge's damage — Stun only stops COMBAT damage, not spell/ability damage.
 * Rules: 811 (Hidden: play from facedown only "here"), 423.1.b (Stunned: no might contributed in the combat
 *        damage step only), 811.6 (facedown card has Reaction timing — the location limit still applies).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CHALLENGE = "ogn-128-298";
const BACK_OFF = "unl-042-219";

/**
 * P1's turn. P1's "Fiora" (vanilla 4-Might stand-in) at P1's bf1. P2's 3-Might Target at P2's bf2, where P2
 * also has Back Off facedown. P1 holds Challenge with exactly [2][body].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { body: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 4, name: "Fiora" }, "fiora")
    .unit(P2, "bf2", { might: 3, name: "Target" }, "target")
    .facedown(P2, "bf2", BACK_OFF, "backoff")
    .hand(P1, CHALLENGE, "challenge");
}

describe("Ruling 11676d63dbda6e52 — a hidden Back Off elsewhere cannot stun Challenge's unit, and Stun would not stop Challenge's damage anyway", () => {
  test("Challenge may pair units at different battlefields: Fiora (bf1) vs Target (bf2) goes on the chain and P2 gets priority", async () => {
    const game = await board().build();
    await game.p1.cast("challenge", { targets: ["fiora", "target"] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "challenge", targets: ["fiora", "target"] })]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("ruling: the facedown Back Off at bf2 can never choose Fiora at bf1 — flipping it in response only ever reaches a unit AT bf2 (P2's own Target); Fiora is never stunned", async () => {
    const game = await board().build();
    await game.p1.cast("challenge", { targets: ["fiora", "target"] });
    await game.p1.passPriority();
    // It is flippable (Reaction timing while facedown) only because a unit exists at ITS battlefield.
    expect(game.p2.can("reveal", "backoff")).toBe(true);
    await game.p2.reveal("backoff");
    // No prompt ever offers Fiora; the lone legal choice "here" (Target) is bound.
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (!d || d.kind === "action") {
        break;
      }
      expect(d.kind).toBe("pick");
      if (d.kind === "pick") {
        expect(d.options.map((o) => o.card ?? o.key)).not.toContain("fiora");
        await game.p2.pick(d.options[0]!.key);
      }
    }
    const item = game.chain().find((c) => c.cardId === "backoff");
    expect(item).toBeDefined();
    expect(item?.targets ?? []).not.toContain("fiora");
    await game.p2.passPriority();
    await game.p1.passPriority(); // Back Off resolves
    expect(game.state("fiora").isStunned).toBe(false);
    expect(game.state("target").isStunned).toBe(true); // it could only land at bf2
  });

  test("ruling: with NO unit at bf2 (Target sits at bf3 instead) the hidden Back Off cannot be played at all in response — Fiora at bf1 is out of reach", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { body: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .battlefield("bf3", { controller: P2 })
      .unit(P1, "bf1", { might: 4, name: "Fiora" }, "fiora")
      .unit(P2, "bf3", { might: 3, name: "Target" }, "target")
      .facedown(P2, "bf2", BACK_OFF, "backoff")
      .hand(P1, CHALLENGE, "challenge")
      .build();
    await game.p1.cast("challenge", { targets: ["fiora", "target"] });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("reveal", "backoff")).toBe(false);
    const r = await game.p2.try((p) => p.reveal("backoff"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("backoff")).toBe("facedown-bf2");
    await game.settle();
    expect(game.zoneOf("target")).toBe("trash"); // 4 ≥ 3
    expect(game.state("fiora").damage).toBe(3);
  });

  test("ruling: Stun does not prevent Challenge's damage — an already-STUNNED Fiora still deals her 4 (Target dies) and takes 3", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { body: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 4, name: "Fiora" }, "fiora", { stunned: true })
      .unit(P2, "bf2", { might: 3, name: "Target" }, "target")
      .hand(P1, CHALLENGE, "challenge")
      .build();
    expect(game.state("fiora").isStunned).toBe(true);
    await game.p1.cast("challenge", { targets: ["fiora", "target"] });
    await game.settle();
    expect(game.zoneOf("target")).toBe("trash");
    expect(game.state("fiora").damage).toBe(3);
    expect(game.zoneOf("fiora")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });

  test("after the (mis-aimed) Back Off and Challenge both resolve: Target — stunned or not — took Fiora's 4 and died; Fiora took 3 and is unstunned", async () => {
    const game = await board().build();
    await game.p1.cast("challenge", { targets: ["fiora", "target"] });
    await game.p1.passPriority();
    await game.p2.reveal("backoff");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("backoff")).toBe("trash");
    expect(game.zoneOf("challenge")).toBe("trash");
    expect(game.zoneOf("target")).toBe("trash");
    expect(game.state("fiora")).toMatchObject({ damage: 3, isStunned: false, zone: "battlefield-bf1" });
  });
});
