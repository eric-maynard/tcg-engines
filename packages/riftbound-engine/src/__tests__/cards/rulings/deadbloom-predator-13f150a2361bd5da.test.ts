/**
 * Ruling 13f150a2361bd5da — Deadbloom Predator (OGN-161 → ogn-161-298) · 8+[body][body] · 8 Might
 *     "[Deflect] You may play me to an occupied enemy battlefield."
 *   × a friendly [Ganking] unit (inline) — "can it come along?"
 *
 * Q: Can I play Deadbloom Predator to an opponent's battlefield and simultaneously bring a friendly Ganking unit to attack together?
 * A: No. Playing a unit from hand puts only THAT unit there; you can't move other units with it. Several units move at the same time only
 *    via the Standard Move (exhausting them) — not as part of playing a card.
 * Rules: 141 / 609 (Standard Move: any number of your ready units, one destination), 355 (playing a card places that card only),
 *        464 (the combat that follows involves the units present), 813 (Ganking only widens Standard-Move destinations).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DEADBLOOM = "ogn-161-298";

/** P1's turn with 8 + [body][body]. P2 holds bf1 with a Holder (3). P1: Deadbloom in hand, a ready Ganker (2, [Ganking]) holding bf2, a Buddy (2) in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { body: 2 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 3, name: "Holder" }, "holder")
    .unit(P1, "bf2", { keywords: ["Ganking"], might: 2, name: "Ganker" }, "ganker")
    .unit(P1, "base", { might: 2, name: "Buddy" }, "buddy")
    .hand(P1, DEADBLOOM, "pred");
}

describe("Ruling 13f150a2361bd5da — playing Deadbloom to an enemy battlefield brings only Deadbloom; other units can't tag along", () => {
  test("the play offers WHERE to put the Predator (base / its own bf2 / the occupied enemy bf1) but has no way to name other units to bring", async () => {
    const game = await board().build();
    const opt = game.p1.option("play", "pred") ?? game.p1.option("playUnit", "pred");
    expect(opt).toBeDefined();
    const to = opt?.fields.find((f) => f.arg === "to");
    expect([...(to?.options ?? [])].map(String).sort()).toEqual(["base", "battlefield-bf1", "battlefield-bf2"]);
    expect(opt?.fields.some((f) => f.arg === "units" || f.name === "unitIds" || f.name === "cardIds")).toBe(false);
    const r = await game.p1.try((p) => p.play("pred", { to: "bf1", units: ["ganker"] } as never));
    // Either rejected outright or the extra arg is simply not part of the play — in no case does the Ganker move.
    expect(game.locationOf("ganker")).toBe("bf2");
    if (r.ok) {
      expect(game.locationOf("pred")).toBe("bf1");
    }
  });

  test("played to bf1: a combat showdown opens there with the Predator as the ONLY attacker; the Ganker (bf2) and Buddy (base) stay put with no combat role", async () => {
    const game = await board().build();
    await game.p1.play("pred", { to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.state("pred")).toMatchObject({ combatRole: "attacker", zone: "battlefield-bf1" });
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ attackingPlayer: P1, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.p1.units("bf1")).toEqual(["pred"]);
    expect(game.state("ganker")).toMatchObject({ combatRole: null, location: "bf2" });
    expect(game.state("buddy")).toMatchObject({ combatRole: null, location: "base" });
  });

  test("and during that showdown P1 (with Focus) has no Standard/Ganking move to throw the Ganker in — moves aren't showdown actions", async () => {
    const game = await board().build();
    await game.p1.play("pred", { to: "bf1" });
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.legal().some((o) => o.verb === "move" || o.verb === "gank")).toBe(false);
    expect((await game.p1.try((p) => p.move("ganker", "bf1"))).ok).toBe(false);
    expect((await game.p1.try((p) => p.gank("ganker", "bf1"))).ok).toBe(false);
    await game.settle();
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.locationOf("ganker")).toBe("bf2");
    expect(game.violations()).toEqual([]);
  });

  test("contrast: the STANDARD MOVE is how several units go together — two ready base units move to bf1 in ONE move (both exhausted) as joint attackers", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Holder" }, "holder")
      .unit(P1, "base", { might: 2, name: "Buddy" }, "buddy")
      .unit(P1, "base", { might: 2, name: "Pal" }, "pal")
      .build();
    await game.p1.move(["buddy", "pal"], "bf1");
    expect(game.state("buddy")).toMatchObject({ combatRole: "attacker", isExhausted: true, location: "bf1" });
    expect(game.state("pal")).toMatchObject({ combatRole: "attacker", isExhausted: true, location: "bf1" });
  });
});
