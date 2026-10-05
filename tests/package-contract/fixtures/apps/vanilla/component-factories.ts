import { Component, CoreComponent, type ChildDescriptor } from "@gravity-ui/graph";

class Label extends Component<{ label: string }> {
  getLabel() { return this.props.label.toUpperCase(); }
}
class NoProps extends Component { constructor() { super({}); } }
class Defaults extends Component<{ label: string }> {
  constructor(props = { label: "default" }, parent?: CoreComponent) { super(props, parent); }
}
class DefaultsWithRequiredParent extends Component<{ label: string }> {
  constructor(props = { label: "default" }, parent: CoreComponent) { super(props, parent); }
}
// Compile-only contracts in both strict and non-strict consumers.
function factoryContracts() {
  Label.create({ label: "checked" });
  Component.mount(Label, { label: "checked" }).getLabel();
  // @ts-expect-error A required constructor argument remains required without strictNullChecks.
  Label.create();
  // @ts-expect-error mount must also require the constructor props in non-strict consumers.
  Component.mount(Label);
  NoProps.create(); Component.mount(NoProps);
  Defaults.create(); Component.mount(Defaults);
  // A default before a required parent is not an optional tuple element in published non-strict declarations.
  DefaultsWithRequiredParent.create(undefined);
  // @ts-expect-error Pass undefined explicitly when a later constructor parameter is required.
  DefaultsWithRequiredParent.create();
  const descriptor = Label.create({ label: "checked" });
  const child: ChildDescriptor = descriptor;
  // @ts-expect-error Erasure must not allow replacing validated props.
  child.props = {};
  // @ts-expect-error Erased props must not allow changing a field to an incompatible type.
  child.props!.label = 123;
  // @ts-expect-error Erasure must not allow replacing the constructor behind a concrete ref.
  child.klass = Component;
  // @ts-expect-error Erased options must not allow replacing the validated ref.
  child.options = { ref: (instance: NoProps) => { void instance; } };
  // @ts-expect-error A spread copy must not bypass the factory's class/props relationship.
  const copied: ChildDescriptor = { ...descriptor, props: {} };
  void copied;
}
void factoryContracts;
