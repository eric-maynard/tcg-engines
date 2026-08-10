/**
 * Ruling 0bbe4c61dc0d4d04 — Bullet Time (OGN-268 → ogn-268-298) · Action [1] Body/Chaos
 *     "Pay any amount of [rainbow] to deal that much damage to all enemy units at a battlefield."
 *   × a [Deflect] unit (Deadbloom Predator, ogn-161-298 · 8 Might · "[Deflect] …"), Hextech Ray (ogn-009-298 · [1][fury] "Deal 3 to a
 *     unit at a battlefield."), Seal of Rage (ogn-040-298 · "[Exhaust]: [Reaction] — [Add] [fury].")
 *
 * Q: Can TAPPED (exhausted) runes be recycled to pay Power costs, e.g. for Deflect and Bullet Time?
 * A: Yes — an exhausted rune can still be recycled for its Power. Nuances: Bullet Time targets the BATTLEFIELD, not units (so no
 *    Deflect is owed); a seal's Power can pay a Deflect surcharge.
 * Rules: 159.3 / 416 (Recycle a rune → 1 Power; exhaustion is irrelevant), 204.3.b (X paid on resolution), 809 (Deflect: extra Power
 *        to CHOOSE the unit), 429 ([Add]).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BULLET_TIME = "ogn-268-298";
const DEADBLOOM = "ogn-161-298";
const HEXTECH_RAY = "ogn-009-298";
const SEAL_OF_RAGE = "ogn-040-298";

describe("Ruling 0bbe4c61dc0d4d04 — exhausted runes still recycle for Power (Bullet Time's X, Deflect); Bullet Time targets a battlefield", () => {
  test("Bullet Time: P1 TAPS the only rune for the [1] to cast it, then at resolution RECYCLES that same exhausted rune for [rainbow] and pays X = 1", async () => {
    const game = await scenario()
      .rune(P1, "body", { alias: "r" })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Grunt" }, "grunt")
      .hand(P1, BULLET_TIME, "bt")
      .build();
    await game.p1.tapRune("r");
    expect(game.state("r").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(1);
    await game.p1.cast("bt", { targets: "bf1" });
    await game.acting().passPriority();
    await game.acting().passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "integer", seat: P1, source: { cardId: "bt" } });
    // The exhausted rune is still recyclable while paying.
    expect((d?.kind === "integer" ? (d.actions ?? []) : []).some((a) => a.verb === "recycleRune" && a.card === "r")).toBe(true);
    await game.p1.recycleRune("r");
    expect(game.zoneOf("r")).toBe("runeDeck");
    expect(game.p1.power()).toBe(1);
    await game.p1.chooseX(1);
    await game.settle();
    expect(game.state("grunt").damage).toBe(1);
    expect(game.zoneOf("bt")).toBe("trash");
  });

  test("Bullet Time targets the BATTLEFIELD, not units: its only play-time choice is a battlefield, and a [Deflect] enemy there costs no surcharge yet is damaged", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { rainbow: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", DEADBLOOM, "predator")
      .hand(P1, BULLET_TIME, "bt")
      .build();
    expect(game.state("predator").keywords).toContain("Deflect");
    const targets = (game.p1.option("cast", "bt")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(targets).toEqual(["bf1"]);
    await game.p1.cast("bt", { targets: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 2 } }); // no Deflect power taken
    await game.acting().passPriority();
    await game.acting().passPriority();
    await game.p1.chooseX(2);
    await game.settle();
    expect(game.p1.power()).toBe(0);
    expect(game.state("predator").damage).toBe(2);
  });

  test("Deflect paid from an EXHAUSTED rune: Hextech Ray at the Predator needs [1][fury] + 1 more Power; P1 recycles a tapped fury rune for it and the cast goes through", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { fury: 1 } })
      .rune(P1, "fury", { alias: "tapped", exhausted: true })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", DEADBLOOM, "predator")
      .hand(P1, HEXTECH_RAY, "ray")
      .build();
    expect(game.p1.can("cast", "ray")).toBe(false); // 1 fury covers the cost but not the Deflect
    await game.p1.recycleRune("tapped");
    expect(game.zoneOf("tapped")).toBe("runeDeck");
    expect(game.p1.power()).toBe(2);
    expect(game.p1.can("cast", "ray")).toBe(true);
    await game.p1.cast("ray", { targets: "predator" });
    expect(game.p1.resources().energy).toBe(0);
    expect(game.p1.power()).toBe(0);
    await game.settle();
    expect(game.state("predator").damage).toBe(3);
  });

  test("…and a SEAL's Power pays Deflect too: exhaust Seal of Rage for [fury], then Hextech Ray the Predator", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { fury: 1 } })
      .gear(P1, SEAL_OF_RAGE, "seal")
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", DEADBLOOM, "predator")
      .hand(P1, HEXTECH_RAY, "ray")
      .build();
    expect(game.p1.can("cast", "ray")).toBe(false);
    await game.p1.activate("seal");
    expect(game.p1.power("fury")).toBe(2);
    await game.p1.cast("ray", { targets: "predator" });
    expect(game.p1.power()).toBe(0);
    await game.settle();
    expect(game.state("predator").damage).toBe(3);
  });
});
