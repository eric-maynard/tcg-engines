/**
 * Interaction: Sacred Shears (sfd-172-221) Equipment · +1 · Effect Text "[Deathknell] — Draw 1."
 *            × Detonate      (sfd-005-221) Spell "Kill a gear. Its controller draws 2."
 *            (× Vengeance ogn-229-298 "Kill a unit." as the neutral unit-killer)
 *
 * Question: P1's 3-Might unit H at a battlefield wears Sacred Shears.
 *   (a) H is killed (spell or combat). Who draws, and where do the Shears go?
 *   (b) P2 Detonates the ATTACHED Shears. Does the Deathknell "Draw 1" happen? What is H after?
 *   (c) P2 Detonates an UNATTACHED Shears in P1's base. Any Deathknell draw?
 *
 * Rules: 136.2.b/724 (Effect Text is Inactive unless attached), 136.2.c/718.3 (while attached the
 * Effect Text abilities are appended to the TOP-MOST card's rules text — "I" is H, so H has the
 * Deathknell), 718.2/721.2 (the attached card's own rules text is Inactive: no trigger from the
 * Shears themselves), 428.1.a.1.b + 808.2 (Deathknell goes on the chain when the UNIT is killed,
 * noting its attributes before it leaves), 719.5 + 435.4.b (top-most card leaves the board → the
 * Shears detach at H's last location), 435.4.a/457.1 (unattached gear at a battlefield is recalled
 * to base at the next Cleanup — it is NOT killed), 435.1.d (on detach H stops having the appended
 * text and the Might bonus).
 *
 * Expected: (a) P1 draws exactly 1; Shears end in P1's BASE unattached (not trash). (b) No Deathknell
 * draw — only Detonate's "its controller draws 2" (P1 +2); Shears → P1 trash; H back to a plain
 * 3-Might unit with no attachments, still on the battlefield. (c) No Deathknell draw; P1 +2 only.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SACRED_SHEARS = "sfd-172-221";
const DETONATE = "sfd-005-221";
const VENGEANCE = "ogn-229-298"; // 4 energy + [order][order] · "Kill a unit."

/** H (3 Might) at bf1 wearing the Shears; P2 to act with Detonate + Vengeance affordable. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 5, power: { fury: 1, order: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Hoplite" }, "H", { equippedWith: ["shears"] })
    .card("shears", { def: SACRED_SHEARS, meta: { attachedTo: "H" }, owner: P1, zone: "bf1" })
    .gear(P1, SACRED_SHEARS, "spare") // a second, UNATTACHED Shears in P1's base for (c)
    .unit(P2, "base", { might: 2, name: "Bystander" }, "foe")
    .hand(P2, DETONATE, "det")
    .hand(P2, VENGEANCE, "veng");
}

describe("Sacred Shears Deathknell — the wearer dying vs the gear dying", () => {
  test("setup sanity: attached Shears give H +1 (3 → 4) and H lists the attachment", async () => {
    const game = await board().build();
    expect(game.state("shears").attachedTo).toBe("H");
    expect(game.state("H")).toMatchObject({ attachments: ["shears"], baseMight: 3, might: 4 });
    expect(game.zoneOf("shears")).toBe("battlefield-bf1");
    expect(game.state("spare").attachedTo).toBeUndefined();
  });

  // ---------------------------------------------------------------- (a) H dies

  test("(a) H killed by a spell (Vengeance): H's conferred Deathknell resolves — P1 draws exactly 1 (718.3 / 428.1.a.1.b)", async () => {
    const game = await board().build();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.p2.cast("veng", { targets: "H" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Vengeance resolves → H killed → its Deathknell is a chain item controlled by P1 (808.2)
    expect(game.zoneOf("H")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ controller: P1, triggered: true })]);
    expect(game.p1.hand()).toHaveLength(p1Hand); // not drawn yet — it is on the chain
    await game.settle();
    expect(game.p1.hand()).toHaveLength(p1Hand + 1);
    expect(game.p2.hand()).toHaveLength(p2Hand - 1); // only spent Vengeance
  });

  test("(a) H killed by a spell: the Shears are NOT killed — they detach at bf1 and are recalled to P1's base, unattached (719.5 / 435.4.b / 457.1)", async () => {
    const game = await board().build();
    await game.p2.cast("veng", { targets: "H" });
    await game.settle();
    expect(game.zoneOf("H")).toBe("trash");
    expect(game.zoneOf("shears")).toBe("base");
    expect(game.p1.trash()).not.toContain("shears");
    expect(game.state("shears")).toMatchObject({ attachedTo: undefined, owner: P1 });
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(a) H killed in COMBAT (3+1 into a 4-Might wall trades): P1 still draws exactly 1 from the Deathknell; Shears recalled to base", async () => {
    const game = await scenario()
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 4, name: "Wall" }, "wall")
      .unit(P1, "base", { might: 3, name: "Hoplite" }, "H", { equippedWith: ["shears"] })
      .card("shears", { def: SACRED_SHEARS, meta: { attachedTo: "H" }, owner: P1, zone: "base" })
      .build();
    expect(game.state("H").might).toBe(4);
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.p1.move("H", "bf2");
    expect(game.zoneOf("shears")).toBe("battlefield-bf2"); // rides along (719.3.a)
    await game.settle();
    expect(game.zoneOf("H")).toBe("trash"); // took 4 ≥ 4
    expect(game.zoneOf("wall")).toBe("trash"); // took 4 ≥ 4
    expect(game.p1.hand()).toHaveLength(p1Hand + 1);
    expect(game.p2.hand()).toHaveLength(p2Hand); // the vanilla wall has no Deathknell
    expect(game.zoneOf("shears")).toBe("base");
    expect(game.state("shears").attachedTo).toBeUndefined();
  });

  // ---------------------------------------------------------------- (b) attached Shears die

  test("(b) Detonate offers the ATTACHED Shears (and the spare) as 'a gear' — units are not offered", async () => {
    const game = await board().build();
    const offered = (game.p2.option("cast", "det")?.fields.find((f) => f.name === "targets")?.options ?? []).flat() as string[];
    expect(offered).toContain("shears");
    expect(offered).toContain("spare");
    expect(offered).not.toContain("H");
    expect(offered).not.toContain("foe");
  });

  test("(b) Detonate on the ATTACHED Shears: NO Deathknell draw — P1 draws exactly 2 (Detonate's 'its controller draws 2'), P2 only spends the spell", async () => {
    const game = await board().build();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.p2.cast("det", { targets: "shears" });
    await game.settle();
    expect(game.zoneOf("shears")).toBe("trash");
    expect(game.state("shears").owner).toBe(P1);
    expect(game.p1.hand()).toHaveLength(p1Hand + 2); // 2, not 3: the Deathknell was H's, and H did not die
    expect(game.p2.hand()).toHaveLength(p2Hand - 1);
    expect(game.chain()).toEqual([]);
  });

  test("(b) after the attached Shears die H is a plain 3-Might unit again: no attachments, bonus gone, still at bf1 (435.1.d/e)", async () => {
    const game = await board().build();
    await game.p2.cast("det", { targets: "shears" });
    await game.settle();
    expect(game.zoneOf("H")).toBe("battlefield-bf1");
    expect(game.state("H")).toMatchObject({ attachments: [], baseMight: 3, damage: 0, might: 3 });
    expect(game.violations()).toEqual([]);
  });

  test("(b→a control) once the Shears are gone, killing H draws P1 nothing — the Deathknell left with the Effect Text (435.1.d)", async () => {
    const game = await board().resources(P2, { energy: 5, power: { fury: 1, order: 2 } }).build();
    await game.p2.cast("det", { targets: "shears" });
    await game.settle();
    const p1Hand = game.p1.hand().length;
    await game.p2.cast("veng", { targets: "H" });
    await game.settle();
    expect(game.zoneOf("H")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(p1Hand); // no Deathknell any more
  });

  // ---------------------------------------------------------------- (c) unattached Shears die

  test("(c) Detonate on an UNATTACHED Shears in P1's base: Effect Text is Inactive (724 / 136.2.b) — P1 draws exactly 2, H untouched", async () => {
    const game = await board().build();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.p2.cast("det", { targets: "spare" });
    await game.settle();
    expect(game.zoneOf("spare")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(p1Hand + 2);
    expect(game.p2.hand()).toHaveLength(p2Hand - 1);
    expect(game.state("H")).toMatchObject({ attachments: ["shears"], might: 4 }); // the worn copy is unaffected
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
