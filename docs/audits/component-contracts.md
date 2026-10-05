# Component construction contracts

Issue: https://github.com/gravity-ui/graph/issues/360.

Factories infer constructor props and instance refs from the concrete class.
`NoInfer` keeps props/ref input from widening that class to bypass validation.
Props may be omitted when the constructor accepts no argument or an empty object.
Omitted arguments preserve constructor defaults; CoreComponent normalizes its own
props to an empty object.
Descriptors carry an internal symbol so heterogeneous children must originate
from a checked factory. `ChildDescriptor` erases props/ref variance for storage;
Reflect construction/invocation are confined to that boundary. Child instances
are stored in a Map and optional string refs in a null-prototype record.

Runtime regressions cover keyed mount/reuse/reordering, current props, constructor
replacement, identical descriptor-array reuse, removal/unmount ref cleanup,
context propagation, parent identity and special keys. Callback refs retain
mount-time semantics. Layer services inject internal props at their documented
construction boundary. React forwardRef exposes a generic class/props/ref
signature over its single runtime render function. Group mixin assertions retain
only members inherited from the actual runtime base and added by the mixin.

Source and packed strict fixtures cover required props, concrete mount results
and callback refs, generic/custom block selection, custom layer JSX/hook props,
and custom group mixin methods/props. Named class utility exports replace ambient
global declaration injection. LayerNext remains deferred to #373.
