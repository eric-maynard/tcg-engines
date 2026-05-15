/**
 * ContextMenu — manual mode (admin / power-user override).
 *
 * The component is a thin, generic dropdown anchored to a click point.
 * These tests pin the public contract:
 *   - Renders one .rb-context-menu-item per top-level entry.
 *   - Clicking an item invokes its onClick AND calls onClose.
 *   - Clicking a disabled item does NOT invoke onClick.
 *   - Items with `separator: true` render a separator instead of a button.
 *   - Submenu items render under their parent so the test can drill in.
 *   - Escape closes the menu.
 *   - Outside mousedown closes the menu.
 */

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ContextMenu, type MenuItem } from "../components/ContextMenu";

describe("ContextMenu", () => {
  it("renders one item per entry and dispatches onClick", () => {
    const onA = vi.fn();
    const onB = vi.fn();
    const onClose = vi.fn();
    const items: MenuItem[] = [
      { label: "Action A", onClick: onA },
      { label: "Action B", onClick: onB },
    ];
    render(
      <ContextMenu
        position={{ x: 50, y: 80 }}
        items={items}
        onClose={onClose}
      />,
    );
    expect(screen.getByTestId("context-menu")).toBeInTheDocument();
    expect(screen.getByTestId("context-menu-item-action-a")).toBeInTheDocument();
    expect(screen.getByTestId("context-menu-item-action-b")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("context-menu-item-action-a"));
    expect(onA).toHaveBeenCalledTimes(1);
    expect(onB).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not fire onClick for disabled items", () => {
    const onA = vi.fn();
    const onClose = vi.fn();
    render(
      <ContextMenu
        position={{ x: 0, y: 0 }}
        items={[{ disabled: true, label: "Locked", onClick: onA }]}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId("context-menu-item-locked"));
    expect(onA).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders a separator entry", () => {
    render(
      <ContextMenu
        position={{ x: 0, y: 0 }}
        items={[
          { label: "Top", onClick: () => undefined },
          { label: "", separator: true },
          { label: "Bottom", onClick: () => undefined },
        ]}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByTestId("context-menu-separator")).toBeInTheDocument();
  });

  it("renders submenu entries under their parent", () => {
    const childClick = vi.fn();
    const onClose = vi.fn();
    render(
      <ContextMenu
        position={{ x: 0, y: 0 }}
        items={[
          {
            label: "Move to",
            submenu: [
              { label: "Hand", onClick: childClick },
              { label: "Trash", onClick: childClick },
            ],
          },
        ]}
        onClose={onClose}
      />,
    );
    // Submenu DOM exists immediately (CSS hides it; tests can click through).
    expect(screen.getByTestId("context-menu-submenu-move-to")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("context-menu-item-hand"));
    expect(childClick).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("clicking the parent of a submenu does NOT close the menu", () => {
    const onClose = vi.fn();
    render(
      <ContextMenu
        position={{ x: 0, y: 0 }}
        items={[
          {
            label: "Move to",
            submenu: [{ label: "Hand", onClick: () => undefined }],
          },
        ]}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId("context-menu-item-move-to"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <ContextMenu
        position={{ x: 0, y: 0 }}
        items={[{ label: "A", onClick: () => undefined }]}
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on outside mousedown", () => {
    const onClose = vi.fn();
    render(
      <div>
        <div data-testid="outside" />
        <ContextMenu
          position={{ x: 0, y: 0 }}
          items={[{ label: "A", onClick: () => undefined }]}
          onClose={onClose}
        />
      </div>,
    );
    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("is positioned at the supplied coordinates", () => {
    render(
      <ContextMenu
        position={{ x: 123, y: 234 }}
        items={[{ label: "A", onClick: () => undefined }]}
        onClose={() => undefined}
      />,
    );
    const root = screen.getByTestId("context-menu") as HTMLElement;
    expect(root.style.left).toBe("123px");
    expect(root.style.top).toBe("234px");
    expect(root.style.position).toBe("fixed");
  });
});
