/**
 * Interaction: Jax, Unmatched (sfd-054-221) "Your Equipment everywhere have [Quick-Draw]."
 *   × Serrated Dirk (sfd-009-221) Equipment · 1 energy · +0 · [Equip][fury] · Effect: [Assault 2]
 *   × Cloth Armor   (sfd-064-221) Equipment · 1 energy · +0 · printed [Quick-Draw] · [Equip][mind] · Effect: [Shield 2]
 *
 * Rules: 819.1.b–d (Quick-Draw = [Reaction] on the card + "when you play it, attach it to a unit you
 * control"; the grant reaches Equipment in hand — "everywhere"), 819.3, 818.1 ([Equip] is a plain
 * activated ability: Open State, own turn, no showdown — 151.2), 718.3/718.4 (Effect Text and Might
 * bonus are appended to the bearer while attached), 807.1.c/807.1.d.1 (Assault X = "+X while I am an
 * attacker", live for as long as the unit holds the attacker designation — it need not have been there
 * when the attack was declared), 814 (Shield X = "+X while I am a defender"), 818.3 (equipped state).
 *
 * Question:
 *  (a) P1 attacks with 3-Might T; mid-showdown P1 plays Serrated Dirk from hand onto T. Legal without
 *      Jax? With Jax? Does T get +2 for THIS combat?  → no / yes / yes (T fights at 5).
 *  (b) Same showdown but Cloth Armor onto attacker T → no Might change (Shield is defender-only, +0 bonus).
 *  (c) P2 attacks P1's 3-Might defender D; P1 Quick-Draws Cloth Armor onto D (5), then with Jax the Dirk
 *      too → still 5 (Assault dormant on a defender, +0 bonus).
 *  (d) After combat both are plain 3-Might units again (still equipped).
 */
import { describe, expect, test } from "bun:test";
import type { Game, Seat } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const JAX = "sfd-054-221";
const DIRK = "sfd-009-221";
const CLOTH = "sfd-064-221";

/** P1's turn: 3-Might Striker in base, P2's 4-Might Guard holding bf1, Dirk + Cloth in P1's hand, 2 energy. */
function attackBoard(withJax: boolean) {
  const b = scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 3, name: "Striker" }, "striker")
    .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
    .hand(P1, DIRK, "dirk")
    .hand(P1, CLOTH, "cloth");
  return withJax ? b.unit(P1, "base", JAX, "jax") : b;
}

/** P2's turn: P1's 3-Might Warden holds bf1, P2's 4-Might Raider in base ready to attack, Dirk + Cloth in P1's hand. */
function defendBoard(withJax: boolean) {
  const b = scenario()
    .active(P2)
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Warden" }, "warden")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P1, DIRK, "dirk")
    .hand(P1, CLOTH, "cloth");
  return withJax ? b.unit(P1, "base", JAX, "jax") : b;
}

/** Have every OTHER seat pass (focus / priority) until `seat` holds an action decision in the showdown. */
async function focusTo(game: Game, seat: Seat): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.seat === seat) {
      return;
    }
    if (d.context !== "showdown" && d.context !== "chain") {
      return;
    }
    await game.seat(d.seat).pass();
  }
}

/** Play `equipment` from hand (Quick-Draw) and answer the attach prompt with `unit`; drain its own chain item. */
async function quickDraw(game: Game, equipment: string, unit: string): Promise<void> {
  await game.p1.play(equipment);
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (!d) {
      return;
    }
    if (d.kind === "pick" && d.seat === P1) {
      await game.p1.pick(unit);
    } else if (d.kind === "action" && d.context === "chain" && game.chain().length > 0 && game.chain().every((c) => c.cardId === equipment)) {
      await game.seat(d.seat).pass();
    } else {
      return;
    }
  }
}

const equipOffered = (game: Game) => game.p1.legal().some((o) => o.moveId === "equipCard");

describe("(a) Serrated Dirk onto an ATTACKER mid-showdown", () => {
  test("without Jax: the Dirk has no Quick-Draw/Reaction — it cannot be played during the showdown, and [Equip] (a default-speed activated ability) is not offered either", async () => {
    const game = await attackBoard(false).build();
    expect(game.state("dirk").keywords).not.toContain("Quick-Draw");
    await game.p1.move("striker", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("striker").combatRole).toBe("attacker");
    expect(game.p1.can("play", "dirk")).toBe(false);
    expect(equipOffered(game)).toBe(false);
    expect((await game.p1.try((p) => p.play("dirk"))).ok).toBe(false);
    expect(game.zoneOf("dirk")).toBe("hand");
    // …whereas the printed-Quick-Draw Cloth Armor IS playable in the very same spot.
    expect(game.p1.can("play", "cloth")).toBe(true);
    // Without the Dirk the 3-Might Striker loses to the 4-Might Guard.
    await game.settle();
    expect(game.zoneOf("striker")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
  });

  test("with Jax: the Dirk in HAND has Quick-Draw ('everywhere', 819.3) and is playable while P1 holds Focus as the attacker", async () => {
    const game = await attackBoard(true).build();
    expect(game.state("dirk").keywords).toContain("Quick-Draw");
    await game.p1.move("striker", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("play", "dirk")).toBe(true);
    expect(equipOffered(game)).toBe(false); // it is the CARD that gained Reaction, not its [Equip] ability
  });

  test("with Jax: playing the Dirk costs 1 energy (no [fury] Equip cost), attaches to the Striker, and Assault 2 applies to THIS combat — Striker is 5 while it is the attacker", async () => {
    const game = await attackBoard(true).build();
    await game.p1.move("striker", "bf1");
    expect(game.state("striker")).toMatchObject({ combatRole: "attacker", might: 3 });
    await quickDraw(game, "dirk", "striker");
    expect(game.p1.resources()).toEqual({ energy: 1, power: {} });
    expect(game.state("dirk").attachedTo).toBe("striker");
    expect(game.state("striker").attachments).toEqual(["dirk"]);
    expect(game.state("striker").grantedKeywords).toContainEqual({ duration: "static", keyword: "Assault", value: 2 });
    expect(game.state("striker")).toMatchObject({ combatRole: "attacker", might: 5 });
    expect(game.state("guard").might).toBe(4);
  });

  test("with Jax: the +2 is real in the damage step — Striker (5) kills the 4-Might Guard, survives (4 < 5) and conquers bf1", async () => {
    const game = await attackBoard(true).build();
    await game.p1.move("striker", "bf1");
    await quickDraw(game, "dirk", "striker");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("striker")).toBe("battlefield-bf1");
    expect(game.locationOf("dirk")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});

describe("(b) Cloth Armor onto an ATTACKER mid-showdown", () => {
  test("Quick-Drawn onto the attacking Striker: Shield 2 is on the unit but dormant (attacker, not defender) and the bonus is +0 — Striker stays 3", async () => {
    const game = await attackBoard(true).build();
    await game.p1.move("striker", "bf1");
    await quickDraw(game, "cloth", "striker");
    expect(game.p1.resources()).toEqual({ energy: 1, power: {} });
    expect(game.state("cloth").attachedTo).toBe("striker");
    expect(game.state("striker").grantedKeywords).toContainEqual({ duration: "static", keyword: "Shield", value: 2 });
    expect(game.state("striker")).toMatchObject({ combatRole: "attacker", might: 3 });
    // …so the fight is still 3 into 4: the Striker dies, the Armor is recalled to base loose.
    await game.settle();
    expect(game.zoneOf("striker")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.zoneOf("cloth")).toBe("base");
    expect(game.state("cloth").attachedTo).toBeUndefined();
  });
});

describe("(c) P2 attacks P1's defender; P1 Quick-Draws onto the DEFENDER", () => {
  test("Cloth Armor onto the defending Warden (no Jax needed — printed Quick-Draw): 3 + Shield 2 = 5 while defending", async () => {
    const game = await defendBoard(false).build();
    await game.p2.move("raider", "bf1");
    expect(game.state("warden")).toMatchObject({ combatRole: "defender", might: 3 });
    await focusTo(game, P1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("play", "dirk")).toBe(false); // no Jax: the Dirk stays a default-speed card
    await quickDraw(game, "cloth", "warden");
    expect(game.state("cloth").attachedTo).toBe("warden");
    expect(game.state("warden")).toMatchObject({ combatRole: "defender", might: 5 });
  });

  test("with Jax: Cloth Armor (Shield 2 → 5) and then Serrated Dirk onto the same defender — Assault 2 does nothing for a defender, +0 bonus → still 5", async () => {
    const game = await defendBoard(true).build();
    await game.p2.move("raider", "bf1");
    await focusTo(game, P1);
    await quickDraw(game, "cloth", "warden");
    expect(game.state("warden")).toMatchObject({ combatRole: "defender", might: 5 });
    await focusTo(game, P1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("play", "dirk")).toBe(true);
    await quickDraw(game, "dirk", "warden");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.state("dirk").attachedTo).toBe("warden");
    expect([...game.state("warden").attachments].sort()).toEqual(["cloth", "dirk"]);
    const granted = game.state("warden").grantedKeywords;
    expect(granted).toContainEqual({ duration: "static", keyword: "Shield", value: 2 });
    expect(granted).toContainEqual({ duration: "static", keyword: "Assault", value: 2 });
    expect(game.state("warden")).toMatchObject({ combatRole: "defender", might: 5 });
    expect(game.state("raider")).toMatchObject({ combatRole: "attacker", might: 4 });
  });

  test("the defending 5 holds: the 4-Might Raider dies, the Warden survives (4 < 5) and P1 keeps bf1", async () => {
    const game = await defendBoard(true).build();
    await game.p2.move("raider", "bf1");
    await focusTo(game, P1);
    await quickDraw(game, "cloth", "warden");
    await focusTo(game, P1);
    await quickDraw(game, "dirk", "warden");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("warden")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});

describe("(d) outside combat neither Assault nor Shield applies and both bonuses are +0", () => {
  test("attacker T after its combat: still equipped with the Dirk (818.3), no combat role, Might back to 3", async () => {
    const game = await attackBoard(true).build();
    await game.p1.move("striker", "bf1");
    await quickDraw(game, "dirk", "striker");
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("striker")).toMatchObject({ attachments: ["dirk"], baseMight: 3, combatRole: null, damage: 0, might: 3 });
    expect(game.state("striker").grantedKeywords).toContainEqual({ duration: "static", keyword: "Assault", value: 2 });
  });

  test("Jax's grant addresses the EQUIPMENT (819.3) — the equipped unit itself must not pick up Quick-Draw; only the Dirk's Effect Text (Assault 2) is appended to the bearer (718.2/718.3)", async () => {
    // Expected: Striker's granted keywords are exactly [Assault 2] — Quick-Draw is a characteristic of the Gear
    // (819.3) and the Dirk's own rules text is Inactive while attached (718.2). Actual: once the Jax-granted
    // Dirk is attached, the bearer also lists a static "Quick-Draw" grant.
    const game = await attackBoard(true).build();
    await game.p1.move("striker", "bf1");
    await quickDraw(game, "dirk", "striker");
    await game.settle();
    expect(game.state("dirk").keywords).toContain("Quick-Draw");
    expect(game.state("striker").keywords).not.toContain("Quick-Draw");
    expect(game.state("striker").grantedKeywords).toEqual([{ duration: "static", keyword: "Assault", value: 2 }]);
  });

  test("defender D after its combat: wearing Cloth Armor + Dirk, no combat role, Might back to 3", async () => {
    const game = await defendBoard(true).build();
    await game.p2.move("raider", "bf1");
    await focusTo(game, P1);
    await quickDraw(game, "cloth", "warden");
    await focusTo(game, P1);
    await quickDraw(game, "dirk", "warden");
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect([...game.state("warden").attachments].sort()).toEqual(["cloth", "dirk"]);
    expect(game.state("warden")).toMatchObject({ baseMight: 3, combatRole: null, damage: 0, might: 3 });
  });
});
