/**
 * Port System - Система портов для @gravity-ui/graph
 *
 * 🎯 МОТИВАЦИЯ:
 *
 * Система портов решает фундаментальную проблему архитектуры графов -
 * жесткую зависимость от порядка инициализации компонентов.
 *
 * ПРОБЛЕМА СТАРОЙ СИСТЕМЫ:
 * - Связи можно было создавать только ПОСЛЕ полной инициализации блоков и якорей
 * - Строгий порядок создания: блоки → якоря → связи
 * - Race conditions и ошибки при неправильном порядке
 *
 * РЕШЕНИЕ ЧЕРЕЗ ПОРТЫ:
 * - Порты создаются ПО ТРЕБОВАНИЮ (lazy creation)
 * - Связи работают независимо от готовности блоков
 * - Порты автоматически обновляются когда компоненты готовы
 * - Нет необходимости ждать правильного порядка инициализации
 *
 * ПРЕИМУЩЕСТВА:
 * - Гибкость: связи между любыми объектами
 * - Надежность: нет race conditions
 * - Производительность: порты создаются только когда нужны
 * - Расширяемость: легко добавлять новые типы соединений
 */

import { signal } from "@preact/signals-core";

import { Component } from "../../../lib";

export const IS_PORT_TYPE = "Port" as const;

/** Unique identifier for a port */
export type TPortId = string | number | symbol;

/**
 * Port data structure
 * Represents a connection point that can be attached to blocks, anchors, or custom components
 */
export type TPort = {
  /** Unique identifier for the port */
  id: TPortId;
  /** X coordinate of the port */
  x: number;
  /** Y coordinate of the port */
  y: number;
  /** Component that owns this port (block, anchor, etc.) */
  component?: Component;
  /** Whether the port is waiting for position data from its component */
  lookup?: boolean;
};

/**
 * PortState - Reactive state container for a connection port
 *
 * Manages the lifecycle and state of a port, including position updates,
 * component ownership, and listener management for connections that use this port.
 *
 * ## Key Concepts:
 *
 * ### Lazy Creation
 * Ports are created on-demand when connections need them, even if the target
 * component doesn't exist yet. This solves initialization order problems.
 *
 * ### Lookup State
 * When `lookup: true`, the port is waiting for its component to provide coordinates.
 * When `lookup: false`, the port has valid coordinates and can be used for rendering.
 *
 * ### Listener Management
 * Tracks which components are listening to this port's changes. When no listeners
 * remain and no component owns the port, it can be safely garbage collected.
 */
export class PortState {
  /** Reactive signal containing the port's current state */
  public $state = signal<TPort>(undefined);

  /**
   * Set of components listening to this port's changes
   *
   * Since ports are created lazily, it is important to understand when a port
   * should be removed - when it has no parent component and no listeners.
   * This is its main purpose. Additionally, the list of listeners allows
   * obtaining a list of elements that are observing this port, which can be
   * useful for the UI.
   */
  public listeners = new Set<Component>();

  /**
   * Get the port's unique identifier
   *
   * @returns {TPortId} The port's ID
   */
  public get id(): TPortId {
    return this.$state.value.id;
  }

  /**
   * Get the port's X coordinate
   *
   * @returns {number} The X coordinate
   */
  public get x(): number {
    return this.$state.value.x;
  }

  /**
   * Get the port's Y coordinate
   *
   * @returns {number} The Y coordinate
   */
  public get y(): number {
    return this.$state.value.y;
  }

  /**
   * Get the component that owns this port
   *
   * @returns {Component | undefined} The owning component, if any
   */
  public get component(): Component | undefined {
    return this.$state.value.component;
  }

  /**
   * Get whether the port is in lookup state (waiting for coordinates)
   *
   * @returns {boolean | undefined} True if waiting for coordinates, false if resolved
   */
  public get lookup(): boolean | undefined {
    return this.$state.value.lookup;
  }

  constructor(port: TPort) {
    this.$state.value = { ...port };
  }

  /**
   * Register a component as a listener to this port's changes
   * @param component Component that wants to receive updates when this port changes
   */
  public listen(component: Component): void {
    this.listeners.add(component);
  }

  /**
   * Unregister a component from listening to this port's changes
   * @param component Component to stop receiving updates
   */
  public unlisten(component: Component): void {
    this.listeners.delete(component);
  }

  /**
   * Update the port's position coordinates
   * @param x New X coordinate
   * @param y New Y coordinate
   */
  public setPoint(x: number, y: number): void {
    this.updatePort({ x, y });
  }

  /**
   * Set the component that owns this port and mark it as resolved
   * @param component The component (block, anchor, etc.) that owns this port
   */
  public setComponent(component: Component): void {
    this.updatePort({ component, lookup: !component });
  }

  /**
   * Update port state with partial data
   * @param port Partial port data to merge with current state
   */
  public updatePort(port: Partial<TPort>): void {
    this.$state.value = { ...this.$state.value, ...port };
  }
}
