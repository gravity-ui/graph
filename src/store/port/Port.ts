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

import { GraphComponent } from "../../components/canvas/GraphComponent";

export const IS_PORT_TYPE = "Port" as const;

export type TPortId = string | number | symbol;

export type TPort = {
  id: TPortId;
  x: number;
  y: number;
  component?: GraphComponent;
  lookup?: boolean;
};

export class PortState {
  public $state = signal<TPort>(undefined);

  public listeners = new Set<GraphComponent>();

  public get id() {
    return this.$state.value.id;
  }

  public get x() {
    return this.$state.value.x;
  }

  public get y() {
    return this.$state.value.y;
  }

  public get component() {
    return this.$state.value.component;
  }

  public get lookup() {
    return this.$state.value.lookup;
  }

  public get position() {
    return { x: this.$state.value.x, y: this.$state.value.y };
  }

  constructor(port: TPort) {
    this.$state.value = { ...port };
  }
  public own(component: GraphComponent): void {
    this.listeners.add(component);
  }

  public unown(component: GraphComponent): void {
    this.listeners.delete(component);
  }

  public setPoint(x: number, y: number): void {
    this.$state.value = { ...this.$state.value, x, y, lookup: false };
  }

  public setComponent(component: GraphComponent): void {
    this.$state.value = { ...this.$state.value, component, lookup: Boolean(component) };
  }

  public setLookup(lookup: boolean): void {
    this.$state.value = { ...this.$state.value, lookup };
  }

  public asTPort(): TPort {
    return { ...this.$state.value };
  }

  public updatePort(port: Partial<TPort>): void {
    this.$state.value = { ...this.$state.value, ...port };
  }
}
