/**
 * Ruling 245cb78c3abea9fa — Cleave (OGN-004 → ogn-004-298) [Action] · 1 "Give a unit [Assault 3] this turn."
 *   × Whiteflame Protector (OGN-082 → ogn-082-298) 8 + [calm][calm] "When you play me, give a unit +8 [Might] this turn."
 *   × Gust (OGN-169 → ogn-169-298) [Reaction] · 1 "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   (inverse case uses Discipline ogn-058-298 [Reaction] "+2 [Might] this turn. Draw 1.")
 *
 * Q: Opponent Cleaves / Whiteflame-buffs a 2-Might unit; I respond with Gust on it. Does Gust bounce it and blank the buff?
 * A: Yes. Gust resolves first (LIFO), the unit goes to hand, and Cleave / the Protector trigger then has no legal target and
 *    does nothing. Inverse: if Gust STARTS the chain and the unit is pumped above 3 Might in response, Gust whiffs instead —
 *    legality is re-checked at resolution.
 * Rules: 338/339 (LIFO), 359.3.f.2 (targets re-checked on resolution; illegal → instruction not performed).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CLEAVE = "ogn-004-298";
const WHITEFLAME_PROTECTOR = "ogn-082-298";
const GUST = "ogn-169-298";
const DISCIPLINE = "ogn-058-298";

/** P1's turn. P1's 2-Might Scout at bf1 (P1's). P1: Cleave + Protector in hand, 9 energy + 2 calm. P2: Gust + 1 energy. */
function board() {
  return scenario()
    .resources(P1, { energy: 9, power: { calm: 2 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Scout" }, "scout")
    .unit(P2, "base", { might: 3, name: "Onlooker" }, "onlooker")
    .hand(P1, CLEAVE, "cleave")
    .hand(P1, WHITEFLAME_PROTECTOR, "wfp")
    .hand(P2, GUST, "gust");
}

describe("Ruling 245cb78c3abea9fa — Gust in response bounces the unit; Cleave / Whiteflame Protector then whiff", () => {
  test("Cleave on the Scout, Gust in response: Gust resolves first (Scout → P1's hand), then Cleave resolves to no effect and goes to the trash", async () => {
    const game = await board().build();
    await game.p1.cast("cleave", { targets: "scout" });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.cast("gust", { targets: "scout" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "gust"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.p1.hand()).toContain("scout");
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave"]); // still to resolve
    await game.settle();
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.state("scout").grantedKeywords).toEqual([]); // no Assault landed anywhere
    expect(game.p1.resources()).toEqual({ energy: 8, power: { calm: 2 } }); // Cleave's 1 stays spent
    expect(game.violations()).toEqual([]);
  });

  test("Whiteflame Protector's 'when you play me' aimed at the Scout, Gust in response: Scout bounced, the +8 lands nowhere; the Protector itself still enters", async () => {
    const game = await board().build();
    await game.p1.play("wfp", { to: "base" });
    // Drive to the Protector's trigger asking for / holding its target, naming the Scout.
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick("scout");
        continue;
      }
      if (d?.kind === "action" && game.chain().some((c) => c.cardId === "wfp" && c.triggered)) {
        break;
      }
      if (d?.kind === "action" && d.context === "chain") {
        await game.acting().passPriority();
        continue;
      }
      break;
    }
    const trigger = game.chain().find((c) => c.cardId === "wfp" && c.triggered);
    expect(trigger).toBeDefined();
    // P2 responds to the trigger with Gust on the Scout.
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.actingSeat()).toBe(P2);
    await game.p2.cast("gust", { targets: "scout" });
    await game.settle();
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.state("scout").mightModifier).toBe(0);
    expect(game.zoneOf("wfp")).toBe("base");
    expect(game.state("wfp").might).toBe(8); // the +8 did not redirect onto itself or anyone else
    expect(game.state("onlooker").might).toBe(3);
    expect(game.chain()).toEqual([]);
  });

  test("inverse: Gust STARTS the chain on the 2-Might Scout; P1 answers with Discipline (+2 → 4). Discipline resolves first, so at resolution the Scout is out of Gust's range → Gust whiffs, Scout stays", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2 })
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Scout" }, "scout")
      .hand(P1, DISCIPLINE, "disc")
      .hand(P2, GUST, "gust")
      .build();
    await game.p2.cast("gust", { targets: "scout" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.cast("disc", { targets: "scout" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["gust", "disc"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Discipline resolves
    expect(game.state("scout").might).toBe(4);
    expect(game.chain().map((c) => c.cardId)).toEqual(["gust"]);
    await game.settle();
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("battlefield-bf1"); // not returned
    expect(game.p2.energy()).toBe(0); // Gust's cost stays spent
    expect(game.violations()).toEqual([]);
  });
});
