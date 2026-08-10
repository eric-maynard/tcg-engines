/**
 * Ruling 26c4adb8fbe2c18a — Ride the Wind (OGN-173 → ogn-173-298) · Action · Chaos · [2]+[chaos]
 *     "Move a friendly unit and ready it."
 *   × Charm (OGN-043 → ogn-043-298) · Spell · Calm · [1]+[calm] · "Move an enemy unit."
 *   Assault witness: Daring Poro (ogn-210-298) · 2 Might · "[Assault] (+1 [Might] while I'm an attacker.)"
 *
 * Q: A unit with Assault is Ride-the-Wind'ed into an ongoing showdown — attacker or defender?
 * A: It inherits its controller's side. If you are the defender, the unit arrives as a defender and Assault does
 *    nothing; if you initiated the combat it arrives as an attacker. Nuance: if the opponent Charms your unit onto a
 *    battlefield THEY control, you are the attacker of that showdown.
 * Rules: 464.2.c (attacker = units of the player contesting; defender = units of the controller; late arrivals take
 *        their controller's designation), 803 (Assault applies only while an attacker), 340 (Action timing in showdowns).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const CHARM = "ogn-043-298";
const DARING_PORO = "ogn-210-298";

describe("Ruling 26c4adb8fbe2c18a — a unit Ride-the-Wind'ed into combat takes its controller's attacker/defender role", () => {
  test("as DEFENDER (P2 attacked P1's bf1): after the attacker passes focus, P1 casts Ride the Wind on the Daring Poro in base → it lands at bf1 READY as a DEFENDER at 2 Might — Assault does not apply", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .unit(P1, "base", DARING_PORO, "poro", { exhausted: true })
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .hand(P1, RIDE_THE_WIND, "rtw")
      .build();
    expect(game.state("poro")).toMatchObject({ isExhausted: true, might: 2 });
    await game.p2.move("raider", "bf1");
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.state("holder").combatRole).toBe("defender");
    // The attacker holds focus first; once P2 passes, the defender may start a chain with an Action.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.cast("rtw", { targets: "poro" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.state("poro")).toMatchObject({ combatRole: "defender", isReady: true, zone: "battlefield-bf1" });
    expect(game.state("poro").might).toBe(2); // Assault is attacker-only
    // Combat: defenders 3 + 2 = 5 vs Raider 4 → Raider dies, P1 keeps bf1.
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("as ATTACKER (P1 attacked P2's bf1): P1, holding focus, Rides the Poro in → it arrives as an ATTACKER at 3 Might (2 + Assault)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Wall" }, "wall")
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .unit(P1, "base", DARING_PORO, "poro", { exhausted: true })
      .hand(P1, RIDE_THE_WIND, "rtw")
      .build();
    await game.p1.move("scout", "bf1");
    expect(game.state("scout").combatRole).toBe("attacker");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.cast("rtw", { targets: "poro" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("poro")).toMatchObject({ combatRole: "attacker", isReady: true, zone: "battlefield-bf1" });
    expect(game.state("poro").might).toBe(3);
    // Combat: attackers 2 + 3 = 5 vs Wall 4 → Wall dies, P1 conquers.
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("nuance — Charm: P1 (holding bf1) Charms P2's Daring Poro onto bf1 → a showdown where P2 is the ATTACKER (Poro 2 + Assault = 3, P2 gets focus first) and P1's Holder defends", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { calm: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 4, name: "Holder" }, "holder")
      .unit(P2, "base", DARING_PORO, "poro")
      .hand(P1, CHARM, "charm")
      .build();
    await game.p1.cast("charm", { targets: "poro" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Charm resolves; bf1 is the only destination
    if (game.decision()?.kind === "pick") {
      const d = game.decision() as Extract<ReturnType<typeof game.decision>, { kind: "pick" }>;
      const bf1 = d.options.find((o) => /bf1/.test(`${o.key} ${o.zone ?? ""} ${o.label}`));
      await game.seat(d.seat).answer({ keys: [bf1!.key], kind: "pick" });
    }
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("battlefield-bf1");
    expect(game.state("poro")).toMatchObject({ combatRole: "attacker", controller: P2 });
    expect(game.state("poro").might).toBe(3);
    expect(game.state("holder").combatRole).toBe("defender");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P1 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 }); // the attacker gets focus first
    await game.settle(); // 3 into 4: the Poro dies, P1 holds
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
