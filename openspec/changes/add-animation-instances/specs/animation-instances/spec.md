## ADDED Requirements

### Requirement: Scheduler-driven animation instances
The graph library SHALL provide a public animation API that runs frame updates through the library scheduler and
returns an animation instance handle for each started animation.

#### Scenario: Starting an animation returns a controllable instance
- **WHEN** a caller starts an animation with duration and frame callback
- **THEN** the system returns an animation instance handle
- **AND** the frame callback is executed using scheduler ticks until completion or cancellation

### Requirement: Animation instance can be stopped on demand
The animation instance SHALL allow explicit cancellation of a running animation.

#### Scenario: Caller cancels a running animation
- **WHEN** the caller invokes cancellation on a running animation instance
- **THEN** no further animation frames are applied for that instance
- **AND** the instance reports a non-running state

### Requirement: Built-in easing strategies for animation progress
The animation API SHALL support built-in easing strategies and custom easing functions.

#### Scenario: Caller selects a built-in easing strategy
- **WHEN** the caller starts an animation with a built-in easing option (for example, linear or ease-out)
- **THEN** frame progress is transformed according to the selected easing strategy

#### Scenario: Caller provides a custom easing function
- **WHEN** the caller starts an animation with a custom easing function
- **THEN** the system uses that function to compute eased progress on each frame

### Requirement: Zoom animations do not conflict on repeated zoom commands
Camera zoom transition APIs SHALL avoid concurrent conflicting writes from multiple active zoom animations.

#### Scenario: New zoom command starts during an active zoom animation
- **WHEN** a new `zoomTo`-family command is issued while a previous zoom animation is still running
- **THEN** the previous zoom animation is cancelled before the new one starts
- **AND** only the latest zoom animation controls camera updates
