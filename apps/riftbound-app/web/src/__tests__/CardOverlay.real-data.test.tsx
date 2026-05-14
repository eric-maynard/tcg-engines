/**
 * CardOverlay real-data vitest — Phase B batch 21 SS.
 *
 * Companion to `CardOverlay.test.tsx`. That suite proves the popover renders
 * SOMETHING for every input shape (including the degenerate stub case);
 * THIS suite verifies the "rich" code path — passing a HandCard whose
 * fields mirror exactly what `EngineSession.buildHandView()` now emits
 * (name, cardType, might, energyCost, powerCost, rulesText, abilities).
 *
 * The assertion of interest: when the new API fields ARE present, the
 * popover shows the real name + rulesText (NOT the "rules text not
 * available" stub batch 20 had to display).
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { type CardInfo, CardOverlay } from "../components/CardOverlay";
import type { HandCard } from "../lib/api";

// Sample HandCard shaped exactly like what `/api/v2/state` will return once
// `server.ts` wires `EngineSession.buildHandView()` through (batch 22 / TT).
// Field names mirror engine-session.ts `HandCardView` + `CardDefinitionView`.
const SAMPLE_HAND_CARD: HandCard = {
  abilities: [
    "[Trigger: attack (self)] damage 1",
    "[Keyword] Hunt 1",
  ],
  cardType: "unit",
  definitionId: "aggressive-warrior",
  energyCost: 2,
  id: "player-1-main-3-aggressive-warrior",
  legalLocations: ["base", "player-1-bf-1"],
  might: 3,
  name: "Aggressive Warrior",
  powerCost: ["fury"],
  rulesText: "When this unit attacks, deal 1 damage to enemy unit.",
};

/**
 * Adapter that pulls the CardOverlay-shaped `cardInfo` out of an
 * api-shaped HandCard. The SPA's hand-chip renderer (PlayPage.tsx)
 * will do the same conversion when batch 22 wires this up.
 */
function handCardToCardInfo(card: HandCard): CardInfo {
  return {
    abilities: card.abilities,
    cardId: card.id,
    cardType: card.cardType,
    definitionId: card.definitionId,
    energyCost: card.energyCost,
    might: card.might,
    name: card.name,
    powerCost: card.powerCost,
    rulesText: card.rulesText,
  };
}

describe("CardOverlay (real card data from buildHandView)", () => {
  it("renders the real name and rulesText (no stub) when API-enriched", () => {
    const info = handCardToCardInfo(SAMPLE_HAND_CARD);
    render(
      <CardOverlay cardInfo={info} testIdPrefix="rd">
        <button data-testid="trigger">{info.name}</button>
      </CardOverlay>,
    );

    const wrapper = screen.getByTestId(`rd-overlay-wrapper-${info.cardId}`);
    fireEvent.mouseEnter(wrapper);

    // Real name surfaces.
    expect(screen.getByTestId("rd-overlay-name")).toHaveTextContent(
      "Aggressive Warrior",
    );
    // Real rulesText is shown — NOT the stub.
    expect(screen.getByTestId("rd-overlay-rules")).toHaveTextContent(
      "When this unit attacks, deal 1 damage to enemy unit.",
    );
    expect(screen.queryByTestId("rd-overlay-stub")).not.toBeInTheDocument();
  });

  it("shows ability summaries formatted by summariseAbilities", () => {
    const info = handCardToCardInfo(SAMPLE_HAND_CARD);
    render(
      <CardOverlay cardInfo={info} testIdPrefix="rd">
        <button data-testid="trigger">{info.name}</button>
      </CardOverlay>,
    );
    fireEvent.mouseEnter(
      screen.getByTestId(`rd-overlay-wrapper-${info.cardId}`),
    );
    const abilities = screen.getByTestId("rd-overlay-abilities");
    expect(abilities).toHaveTextContent("[Trigger: attack (self)] damage 1");
    expect(abilities).toHaveTextContent("[Keyword] Hunt 1");
  });

  it("formats cost as '<energy> <powers>' when both are present", () => {
    const info = handCardToCardInfo(SAMPLE_HAND_CARD);
    render(
      <CardOverlay cardInfo={info} testIdPrefix="rd">
        <button data-testid="trigger">{info.name}</button>
      </CardOverlay>,
    );
    fireEvent.mouseEnter(
      screen.getByTestId(`rd-overlay-wrapper-${info.cardId}`),
    );
    // Header is the strong[data-testid='rd-overlay-name']; cost shows as a
    // Stat row with label "Cost".
    const popover = screen.getByTestId(`rd-overlay-${info.cardId}`);
    expect(popover.textContent).toMatch(/Cost:\s*2 fury/);
    expect(popover.textContent).toMatch(/Might:\s*3/);
  });

  it("HandCard type from api.ts accepts the new fields without cast", () => {
    // Compile-time-only assertion: this object must satisfy `HandCard`.
    const card: HandCard = {
      abilities: ["[Static] modify-might 1"],
      cardType: "unit",
      definitionId: "y",
      energyCost: 0,
      id: "x",
      legalLocations: [],
      might: 1,
      name: "Y",
      powerCost: [],
      rulesText: "rt",
    };
    // Runtime sanity: shape is JSON-safe.
    const round = JSON.parse(JSON.stringify(card)) as HandCard;
    expect(round.name).toBe("Y");
    expect(round.abilities).toEqual(["[Static] modify-might 1"]);
  });
});
