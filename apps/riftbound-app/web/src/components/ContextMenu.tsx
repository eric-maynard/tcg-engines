import { useEffect, useRef } from "react";

/**
 * One entry in a {@link ContextMenu}.
 *
 * Submenu items render the same menu chrome anchored to the parent entry on
 * hover; their `onClick` is ignored (the submenu opens instead). Disabled
 * items render greyed out and don't fire.
 */
export interface MenuItem {
  readonly label: string;
  readonly icon?: string;
  readonly disabled?: boolean;
  readonly onClick?: () => void;
  /**
   * Optional submenu. When present, hovering / focusing the item opens a
   * second menu to the right (or left if there's no room). One level deep
   * only — submenu items themselves should NOT carry submenus.
   */
  readonly submenu?: readonly MenuItem[];
  /** Visual separator before this item. */
  readonly separator?: boolean;
}

export interface ContextMenuProps {
  /** Screen-space anchor (e.g. mouse position from a contextmenu event). */
  readonly position: { x: number; y: number };
  readonly items: readonly MenuItem[];
  readonly onClose: () => void;
}

/**
 * Lightweight context menu anchored to a click point. Closes on:
 *   - any outside click / mousedown
 *   - Escape key
 *   - selecting an item (after the item's onClick fires)
 *
 * No animation, no portal — it just renders an absolutely-positioned div in
 * the React tree. Test IDs cover the root, each item, and each separator so
 * the vitest specs can assert behaviour without fiddly DOM traversal.
 */
export function ContextMenu({ position, items, onClose }: ContextMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocMouseDown = (ev: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(ev.target as Node)) {
        onClose();
      }
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {onClose();}
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={rootRef}
      className="rb-context-menu"
      data-testid="context-menu"
      role="menu"
      style={{
        left: position.x,
        position: "fixed",
        top: position.y,
        zIndex: 1000,
      }}
    >
      {items.map((item, idx) => {
        if (item.separator) {
          return (
            <div
              key={`sep-${idx}`}
              className="rb-context-menu-separator"
              data-testid="context-menu-separator"
            />
          );
        }
        const hasSubmenu = (item.submenu?.length ?? 0) > 0;
        return (
          <div
            key={item.label + idx}
            className={`rb-context-menu-item${item.disabled ? " disabled" : ""}${hasSubmenu ? " has-submenu" : ""}`}
            data-testid={`context-menu-item-${item.label.toLowerCase().replaceAll(/\s+/g, "-")}`}
            role="menuitem"
            aria-disabled={item.disabled ? "true" : undefined}
            tabIndex={item.disabled ? -1 : 0}
            onClick={(ev) => {
              ev.stopPropagation();
              if (item.disabled || hasSubmenu) {return;}
              item.onClick?.();
              onClose();
            }}
          >
            {item.icon ? <span className="rb-context-menu-icon">{item.icon}</span> : null}
            <span className="rb-context-menu-label">{item.label}</span>
            {hasSubmenu ? (
              <span className="rb-context-menu-arrow" aria-hidden="true">›</span>
            ) : null}
            {hasSubmenu ? (
              <div
                className="rb-context-menu-submenu"
                data-testid={`context-menu-submenu-${item.label.toLowerCase().replaceAll(/\s+/g, "-")}`}
                role="menu"
              >
                {item.submenu!.map((sub, subIdx) => (
                  <div
                    key={sub.label + subIdx}
                    className={`rb-context-menu-item${sub.disabled ? " disabled" : ""}`}
                    data-testid={`context-menu-item-${sub.label.toLowerCase().replaceAll(/\s+/g, "-")}`}
                    role="menuitem"
                    aria-disabled={sub.disabled ? "true" : undefined}
                    tabIndex={sub.disabled ? -1 : 0}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      if (sub.disabled) {return;}
                      sub.onClick?.();
                      onClose();
                    }}
                  >
                    {sub.icon ? <span className="rb-context-menu-icon">{sub.icon}</span> : null}
                    <span className="rb-context-menu-label">{sub.label}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
