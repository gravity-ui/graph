# Scheduling and text contracts

Issue: https://github.com/gravity-ui/graph/issues/361.

The public scheduling facade re-exports the implementation and its options,
without a second cast-defined contract. Wrappers forward Parameters<T> and
ThisParameterType<T> and return void; they do not promise callback results or
properties. Reflect.apply is confined to invoking those checked arguments and
receiver. Runtime registrations have an identity guard because GlobalScheduler
removes tasks after the frame. Debounce keeps its registration when the callback
schedules a follow-up, including cancel/replacement inside the callback, preventing
another invocation in the same frame.

Runtime regressions cover argument/receiver replacement, cancel then reschedule,
flush, callback-triggered scheduling, throttle cooldown and discarded results.
Source and published consumer fixtures check correct arguments, required
receivers, void results, valid priorities and argument-free schedule callbacks in
both strict and non-strict projects.

Text helpers type numeric parameters and intermediate wrapping results, handle
missing Canvas contexts before caching, and return a checked cached width.
Tests cover unavailable context/retry, cached versus fresh measurement, wrapping
and empty text. The wrapping algorithm remains unchanged.

FrameDebouncer had no imports or public entrypoint and was removed rather than
maintaining an unused second scheduling implementation. Only its six diagnostics
and the seventeen fixed text diagnostics are removed from the strict baseline;
graph goes from 194 to 171, other project counts are unchanged. Completed helper
files now require zero diagnostics even if someone tries to add them to the
baseline. Scheduler files already have a permanent zero-error gate.
