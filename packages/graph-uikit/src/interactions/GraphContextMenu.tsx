import React, { useCallback, useEffect, useLayoutEffect } from "react";

import { useGraphContext, useSignal } from "@gravity-ui/graph-react";
import { Menu, Popup } from "@gravity-ui/uikit";

import { getUikitGraphStore } from "../store/UikitGraphStore";

import { createClientRect, createVirtualElement } from "./entity";
import type { TGraphEntity } from "./types";

export type TGraphMenuItem = {
  text: React.ReactNode;
  action: () => void;
  iconStart?: React.ReactNode;
  theme?: "normal" | "danger";
  disabled?: boolean;
};

export type TGraphContextMenuProps = {
  /** Return null or [] to show no menu for this entity. */
  items: (entity: TGraphEntity) => TGraphMenuItem[] | null;
};

/** uikit Menu at the right-click point; works on every LOD level and on empty canvas. */
export function GraphContextMenu({ items }: TGraphContextMenuProps): React.ReactElement | null {
  const { graph } = useGraphContext();
  const store = getUikitGraphStore(graph);
  const menu = useSignal(store.$contextMenu);
  const cameraVersion = useSignal(store.$cameraVersion);

  useLayoutEffect(() => {
    store.$contextMenuConsumers.value += 1;
    return () => {
      store.$contextMenuConsumers.value -= 1;
    };
  }, [store]);

  const close = useCallback((): void => {
    store.$contextMenu.value = null;
  }, [store]);

  useEffect(() => {
    if (menu && menu.cameraVersion !== cameraVersion) {
      close();
    }
  }, [menu, cameraVersion, close]);

  const list = menu ? items(menu.entity) : null;
  if (!menu || !list || list.length === 0) {
    return null;
  }
  return (
    <Popup
      open
      anchorElement={createVirtualElement(createClientRect(menu.clientPoint.x, menu.clientPoint.y, 0, 0))}
      placement="bottom-start"
      onOpenChange={(open) => {
        if (!open) close();
      }}
      qa="graph-uikit-context-menu"
    >
      <Menu>
        {list.map((item, index) => (
          <Menu.Item
            // Items have no identity; the list is rebuilt on every open.
            key={index}
            iconStart={item.iconStart}
            theme={item.theme}
            disabled={item.disabled}
            onClick={() => {
              close();
              item.action();
            }}
          >
            {item.text}
          </Menu.Item>
        ))}
      </Menu>
    </Popup>
  );
}
