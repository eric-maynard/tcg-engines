/**
 * Card Ability Override Tests
 *
 * Verifies that cards with manually specified abilities
 * have correctly structured ability definitions.
 */

import type { ActivatedAbility, TriggeredAbility } from "@tcg/riftbound-types";
import type {
  AddResourceEffect,
  SequenceEffect,
} from "@tcg/riftbound-types/abilities/effect-types";
import { describe, expect, test } from "bun:test";
import { getCardRegistry } from "../data";

describe("Tideturner (ogn-199-298)", () => {
  const registry = getCardRegistry();
  const card = registry.get("ogn-199-298");

  test("card exists in registry", () => {
    expect(card).toBeDefined();
    expect(card!.name).toBe("Tideturner");
  });

  test("has Hidden keyword and triggered ability", () => {
    expect(card!.abilities).toBeDefined();
    expect(card!.abilities!.length).toBe(2);
    expect(card!.abilities![0].type).toBe("keyword");
    expect((card!.abilities![0] as { keyword: string }).keyword).toBe("Hidden");
  });

  test("triggered ability swaps locations via sequence of two moves", () => {
    const triggered = card!.abilities![1] as TriggeredAbility;
    expect(triggered.type).toBe("triggered");
    expect(triggered.trigger.event).toBe("play-self");
    expect(triggered.optional).toBe(true);

    const effect = triggered.effect as SequenceEffect;
    expect(effect.type).toBe("sequence");
    expect(effect.effects.length).toBe(2);

    // First move: self to target's location
    expect(effect.effects[0].type).toBe("move");
    expect((effect.effects[0] as { target: unknown }).target).toBe("self");

    // Second move: chosen unit to self's original location
    expect(effect.effects[1].type).toBe("move");
  });
});

describe("Blade Dancer (sfd-195-221)", () => {
  const registry = getCardRegistry();
  const card = registry.get("sfd-195-221");

  test("card exists in registry", () => {
    expect(card).toBeDefined();
    expect(card!.name).toBe("Blade Dancer");
  });

  test("has two triggered abilities", () => {
    expect(card!.abilities).toBeDefined();
    expect(card!.abilities!.length).toBe(2);
    expect(card!.abilities![0].type).toBe("triggered");
    expect(card!.abilities![1].type).toBe("triggered");
  });

  test("ability 1: triggers when a friendly unit is chosen", () => {
    const ability = card!.abilities![0] as TriggeredAbility;
    expect(ability.trigger.event).toBe("choose");
    // Should trigger on friendly units, not self
    expect(ability.trigger.on).toEqual({
      cardType: "unit",
      controller: "friendly",
    });
    expect(ability.optional).toBe(true);
  });

  test("ability 1: costs exhaust self + rainbow, readies chosen unit", () => {
    const ability = card!.abilities![0] as TriggeredAbility;

    // Condition is pay-cost with exhaust + rainbow
    expect(ability.condition).toBeDefined();
    expect(ability.condition!.type).toBe("pay-cost");
    const payCost = ability.condition as {
      type: "pay-cost";
      cost: { exhaust?: boolean; power?: string[] };
    };
    expect(payCost.cost.exhaust).toBe(true);
    expect(payCost.cost.power).toEqual(["rainbow"]);

    // Effect readies the triggering unit (the chosen friendly unit)
    expect(ability.effect.type).toBe("ready");
    expect((ability.effect as { target: unknown }).target).toEqual({ type: "trigger-source" });
  });

  test("ability 2: triggers on conquer, pays 1 to ready self", () => {
    const ability = card!.abilities![1] as TriggeredAbility;
    expect(ability.trigger.event).toBe("conquer");
    expect(ability.trigger.on).toBe("controller");
    expect(ability.optional).toBe(true);

    // Condition is pay-cost with energy 1
    expect(ability.condition).toBeDefined();
    expect(ability.condition!.type).toBe("pay-cost");
    const payCost = ability.condition as { type: "pay-cost"; cost: { energy?: number } };
    expect(payCost.cost.energy).toBe(1);

    // Effect readies self
    expect(ability.effect.type).toBe("ready");
    expect((ability.effect as { target: unknown }).target).toBe("self");
  });
});

// ---------------------------------------------------------------------------
// Wave 3 Agent 4 overrides
// ---------------------------------------------------------------------------

describe("Wave 3 Agent 4 manual overrides", () => {
  const registry = getCardRegistry();

  test("Magma Wurm (ogn-011-298): static grants EntersReady to other friendlies", () => {
    const card = registry.get("ogn-011-298")!;
    expect(card.abilities).toBeDefined();
    expect(card.abilities!.length).toBe(1);
    const ab = card.abilities![0] as { type: string; effect: { type: string; keyword: string } };
    expect(ab.type).toBe("static");
    expect(ab.effect.type).toBe("grant-keyword");
    expect(ab.effect.keyword).toBe("EntersReady");
  });

  test("Draven, Showboat (ogn-028-298): self-might scales with score", () => {
    const card = registry.get("ogn-028-298")!;
    const ab = card.abilities![0] as {
      type: string;
      effect: { type: string; amount: { score: string }; target: string };
    };
    expect(ab.type).toBe("static");
    expect(ab.effect.type).toBe("modify-might");
    expect(ab.effect.amount).toEqual({ score: "self" });
    expect(ab.effect.target).toBe("self");
  });

  test("Carnivorous Snapvine (ogn-149-298): play-self triggers fight", () => {
    const card = registry.get("ogn-149-298")!;
    const ab = card.abilities![0] as TriggeredAbility;
    expect(ab.type).toBe("triggered");
    expect(ab.trigger.event).toBe("play-self");
    expect((ab.effect as { type: string }).type).toBe("fight");
  });

  test("Fiora, Peerless (sfd-110-221): double-might when attacking alone", () => {
    const card = registry.get("sfd-110-221")!;
    expect(card.abilities!.length).toBe(2);
    const attackAb = card.abilities![0] as TriggeredAbility;
    expect(attackAb.trigger.event).toBe("attack");
    expect(attackAb.condition).toBeDefined();
    expect((attackAb.effect as { type: string }).type).toBe("double-might");
  });

  test("Relentless Storm (ogn-249-298): triggers on play-card with Mighty filter", () => {
    const card = registry.get("ogn-249-298")!;
    const ab = card.abilities![0] as TriggeredAbility;
    expect(ab.trigger.event).toBe("play-card");
    const on = ab.trigger.on as { filter?: string };
    expect(on.filter).toBe("mighty");
  });

  test("Fiora, Worthy (sfd-180-221): become-mighty trigger on friendly-units", () => {
    const card = registry.get("sfd-180-221")!;
    const ab = card.abilities![0] as TriggeredAbility;
    expect(ab.trigger.event).toBe("become-mighty");
    expect(ab.trigger.on).toBe("friendly-units");
  });

  test("Grand Duelist (sfd-205-221): become-mighty trigger on friendly-units", () => {
    const card = registry.get("sfd-205-221")!;
    const ab = card.abilities![0] as TriggeredAbility;
    expect(ab.trigger.event).toBe("become-mighty");
    expect(ab.trigger.on).toBe("friendly-units");
  });

  test("Square Up (unl-017-219): spell has repeat cost", () => {
    const card = registry.get("unl-017-219")!;
    const ab = card.abilities![0] as {
      type: string;
      repeat?: { discard?: number };
      effect: unknown;
    };
    expect(ab.type).toBe("spell");
    expect(ab.repeat).toEqual({ discard: 1 });
  });

  test("Rengar, Trophy Hunter (unl-120-219): has Ambush keyword-grant", () => {
    const card = registry.get("unl-120-219")!;
    const keywords = (card.abilities ?? []).flatMap((a) => {
      const obj = a as { type: string; effect?: { type?: string; keyword?: string } };
      return obj.type === "static" && obj.effect?.type === "grant-keyword"
        ? [obj.effect.keyword]
        : [];
    });
    expect(keywords).toContain("Ambush");
  });

  test("Noxus Saboteur (ogn-018-298): grants PreventReveal", () => {
    const card = registry.get("ogn-018-298")!;
    const ab = card.abilities![0] as { type: string; effect: { keyword: string } };
    expect(ab.type).toBe("static");
    expect(ab.effect.keyword).toBe("PreventReveal");
  });

  test("Zhonya's Hourglass (ogn-077-298): has replacement ability for die", () => {
    const card = registry.get("ogn-077-298")!;
    const abs = card.abilities!;
    const replacementAb = abs.find((a) => (a as { type: string }).type === "replacement") as {
      type: string;
      replaces: string;
    };
    expect(replacementAb).toBeDefined();
    expect(replacementAb.replaces).toBe("die");
  });

  test("Viktor, Innovator (ogn-117-298): triggered token creation on opponent turn", () => {
    const card = registry.get("ogn-117-298")!;
    const ab = card.abilities![0] as TriggeredAbility;
    expect(ab.trigger.event).toBe("play-card");
    const { restrictions } = ab.trigger as { restrictions?: unknown[] };
    expect(restrictions).toBeDefined();
  });
});

describe("Daughter of the Void (ogn-247-298)", () => {
  const registry = getCardRegistry();
  const card = registry.get("ogn-247-298");

  test("card exists in registry", () => {
    expect(card).toBeDefined();
    expect(card!.name).toBe("Daughter of the Void");
    expect(card!.cardType).toBe("legend");
  });

  test("has one activated ability", () => {
    expect(card!.abilities).toBeDefined();
    expect(card!.abilities!.length).toBe(1);
    expect(card!.abilities![0].type).toBe("activated");
  });

  test("activated ability: exhaust cost, reaction timing, adds rainbow power", () => {
    const ability = card!.abilities![0] as ActivatedAbility;
    expect(ability.type).toBe("activated");

    // Cost: exhaust self
    expect(ability.cost.exhaust).toBe(true);

    // Timing: reaction
    expect(ability.timing).toBe("reaction");

    // Effect: add rainbow power to rune pool
    const effect = ability.effect as AddResourceEffect;
    expect(effect.type).toBe("add-resource");
    expect(effect.power).toEqual(["rainbow"]);
  });
});
