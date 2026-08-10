/**
 * Ruling eeb7b89130e9c53a — Spirit's Refuge (OGN-063 → ogn-063-298) · Gear · Calm · [2]
 *     "When you play this, buff a friendly unit. Friendly buffed units have [Deflect] if they didn't already."
 *   × Hextech Ray (ogn-009-298) · Action [1][fury] "Deal 3 to a unit at a battlefield." — the opponent's targeting spell
 *
 * Q: With 2 Spirit's Refuge on board, do buffed units get Deflect 2?
 * A: No — multiple Refuges do not stack; a buffed unit has a single instance of [Deflect] (opponents pay [rainbow], not [rainbow][rainbow]).
 * Rules: 809 (Deflect N: pay N Power of any domain to choose), "if they didn't already" (a unit that already has Deflect gets nothing more).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SPIRITS_REFUGE = "ogn-063-298";
const HEXTECH_RAY = "ogn-009-298";

/** P2's turn. P1's buffed Veteran (3+1) holds bf1 under `refuges` Spirit's Refuges; P2 holds Hextech Ray with [1][fury] + 3 spare rainbow. */
function board(refuges: 1 | 2) {
  const b = scenario()
    .active(P2)
    .resources(P2, { energy: 1, power: { fury: 1, rainbow: 3 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Veteran" }, "vet", { buffed: true })
    .gear(P1, SPIRITS_REFUGE, "refuge1")
    .hand(P2, HEXTECH_RAY, "ray");
  return refuges === 2 ? b.gear(P1, SPIRITS_REFUGE, "refuge2") : b;
}

describe("Ruling eeb7b89130e9c53a — two Spirit's Refuges still give a buffed unit exactly ONE Deflect", () => {
  test("with TWO Refuges the buffed Veteran carries a single granted [Deflect] instance (no value 2, no duplicate)", async () => {
    const game = await board(2).build();
    expect(game.p1.gear().sort()).toEqual(["refuge1", "refuge2"]);
    const deflects = game.state("vet").grantedKeywords.filter((k) => k.keyword === "Deflect");
    expect(deflects).toHaveLength(1);
    expect(deflects[0]?.value ?? 1).toBe(1);
    expect(game.state("vet").keywords.filter((k) => k === "Deflect")).toHaveLength(1);
  });

  test("so P2 choosing it with Hextech Ray pays exactly ONE extra power (rainbow 3 → 2), same as with a single Refuge; the Ray then resolves for 3", async () => {
    const two = await board(2).build();
    await two.p2.cast("ray", { targets: "vet" });
    expect(two.p2.resources()).toEqual({ energy: 0, power: { fury: 0, rainbow: 2 } });
    await two.settle();
    expect(two.state("vet").damage).toBe(3);

    const one = await board(1).build();
    await one.p2.cast("ray", { targets: "vet" });
    expect(one.p2.resources()).toEqual({ energy: 0, power: { fury: 0, rainbow: 2 } });
  });

  test("control: an UNBUFFED friendly unit gets no Deflect from either Refuge — targeting it costs no extra power", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { fury: 1, rainbow: 3 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Plain" }, "plain")
      .gear(P1, SPIRITS_REFUGE, "refuge1")
      .gear(P1, SPIRITS_REFUGE, "refuge2")
      .hand(P2, HEXTECH_RAY, "ray")
      .build();
    expect(game.state("plain").keywords).not.toContain("Deflect");
    await game.p2.cast("ray", { targets: "plain" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0, rainbow: 3 } });
  });
});
