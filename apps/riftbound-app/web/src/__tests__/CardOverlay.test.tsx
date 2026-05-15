/**
 * CardOverlay vitest — Phase B batch 20 QQ.
 *
 * Verifies that the popover:
 *   1. is NOT in the DOM until the trigger is hovered,
 *   2. appears with full card info (name, cost, might, rules text,
 *      ability summaries) when fully-populated `cardInfo` is supplied,
 *   3. degrades gracefully — shows a "rules text not available" stub
 *      when only `cardId` + `definitionId` are present (today's API
 *      shape), AND
 *   4. shows the "card info unavailable" panel when no `cardInfo` is
 *      passed at all.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CardOverlay } from "../components/CardOverlay";

describe("CardOverlay", () => {
  it("renders no popover until hovered", () => {
    render(
      <CardOverlay
        cardInfo={{ cardId: "c1", definitionId: "swift-scout", name: "Swift Scout" }}
        testIdPrefix="t"
      >
        <button data-testid="trigger">Swift Scout</button>
      </CardOverlay>,
    );
    expect(screen.getByTestId("trigger")).toBeInTheDocument();
    expect(screen.queryByTestId("t-overlay-c1")).not.toBeInTheDocument();
  });

  it("shows full card info on hover when rulesText + abilities are present", () => {
    render(
      <CardOverlay
        cardInfo={{
          abilities: ["[Trigger: on attack] draw a card"],
          cardId: "c1",
          cardType: "unit",
          definitionId: "swift-scout",
          energyCost: 1,
          might: 2,
          name: "Swift Scout",
          powerCost: ["fury"],
          rulesText: "When this unit attacks, draw a card.",
        }}
        testIdPrefix="t"
      >
        <button data-testid="trigger">Swift Scout</button>
      </CardOverlay>,
    );

    const wrapper = screen.getByTestId("t-overlay-wrapper-c1");
    fireEvent.mouseOver(wrapper);
    fireEvent.mouseEnter(wrapper);

    expect(screen.getByTestId("t-overlay-c1")).toBeInTheDocument();
    expect(screen.getByTestId("t-overlay-name")).toHaveTextContent("Swift Scout");
    expect(screen.getByTestId("t-overlay-rules")).toHaveTextContent(
      "When this unit attacks, draw a card.",
    );
    const abilities = screen.getByTestId("t-overlay-abilities");
    expect(abilities).toHaveTextContent("[Trigger: on attack] draw a card");

    fireEvent.mouseLeave(wrapper);
    expect(screen.queryByTestId("t-overlay-c1")).not.toBeInTheDocument();
  });

  it("shows the rules-text-not-available stub when only id/definitionId are provided", () => {
    render(
      <CardOverlay
        cardInfo={{ cardId: "c2", definitionId: "mystery-card" }}
        testIdPrefix="t"
      >
        <button data-testid="trigger">mystery-card</button>
      </CardOverlay>,
    );

    fireEvent.mouseEnter(screen.getByTestId("t-overlay-wrapper-c2"));
    expect(screen.getByTestId("t-overlay-c2")).toBeInTheDocument();
    expect(screen.getByTestId("t-overlay-stub")).toHaveTextContent(
      /rules text not available/i,
    );
    expect(screen.queryByTestId("t-overlay-rules")).not.toBeInTheDocument();
  });

  it("shows the unknown-card panel when no cardInfo prop is passed", () => {
    render(
      <CardOverlay testIdPrefix="t">
        <button data-testid="trigger">??</button>
      </CardOverlay>,
    );
    fireEvent.mouseEnter(screen.getByTestId("t-overlay-wrapper"));
    expect(screen.getByTestId("t-overlay-unknown")).toHaveTextContent(
      /card info unavailable/i,
    );
  });

  it("integrates with focus / blur for keyboard users", () => {
    render(
      <CardOverlay
        cardInfo={{ cardId: "c3", definitionId: "foo", name: "Foo" }}
        testIdPrefix="t"
      >
        <button data-testid="trigger">Foo</button>
      </CardOverlay>,
    );
    const wrapper = screen.getByTestId("t-overlay-wrapper-c3");
    fireEvent.focus(wrapper);
    expect(screen.getByTestId("t-overlay-c3")).toBeInTheDocument();
    fireEvent.blur(wrapper);
    expect(screen.queryByTestId("t-overlay-c3")).not.toBeInTheDocument();
  });
});
