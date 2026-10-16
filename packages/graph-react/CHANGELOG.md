# Changelog

## 1.0.0-next.0 (2026-10-16)


### ⚠ BREAKING CHANGES

* **graph-devtools:** @gravity-ui/graph derives LayerPublicProps and Layers.createLayer input from the concrete constructor parameter instead of the Layer runtime-props generic. Preserve typeof LayerClass when declaring layer configuration. @gravity-ui/graph-react uses LayerReactiveProps for useLayer and GraphLayer, requiring declarative input to be accepted by both the constructor and setProps; custom constructor normalization must also be supported by the setter.

### Features

* extract React integration into graph-react ([#343](https://github.com/gravity-ui/graph/issues/343)) ([7ed145e](https://github.com/gravity-ui/graph/commit/7ed145ee8ed356a1b01f9d03839bf3543b3bc9cf))
* **graph:** normalize configuration and add explicit resets ([#370](https://github.com/gravity-ui/graph/issues/370)) ([f9b9f22](https://github.com/gravity-ui/graph/commit/f9b9f222642882fe62cf10af6a618e354cd994a5))
* preserve component construction contracts ([#380](https://github.com/gravity-ui/graph/issues/380)) ([3ffdaa0](https://github.com/gravity-ui/graph/commit/3ffdaa018a8aaac43f9609b0e97a4f809eff419b))


### Bug Fixes

* **graph-devtools:** normalize visual props and enable strict ([#383](https://github.com/gravity-ui/graph/issues/383)) ([a6adb7b](https://github.com/gravity-ui/graph/commit/a6adb7b72d516ac06c3100f91b765fa435985846))
* **graph:** preserve nullable lookup contracts ([#371](https://github.com/gravity-ui/graph/issues/371)) ([3c7469d](https://github.com/gravity-ui/graph/commit/3c7469d36e1475e487ee3cd1c653798132311bb0))
* **graph:** preserve typed event payloads and listener cleanup ([#378](https://github.com/gravity-ui/graph/issues/378)) ([a50a06c](https://github.com/gravity-ui/graph/commit/a50a06cd54644a1f3c9c816924a5f465f13eda2a))
* make Scheduler strict-safe and guard TypeScript debt ([#368](https://github.com/gravity-ui/graph/issues/368)) ([078d936](https://github.com/gravity-ui/graph/commit/078d936e8022ba375fec6b9722a77779bc6ed162))
* **react:** preserve readiness and enable strict contracts ([#384](https://github.com/gravity-ui/graph/issues/384)) ([a38cbbb](https://github.com/gravity-ui/graph/commit/a38cbbb29b482af00eb9bf99f14009212a098ce2))


### Miscellaneous Chores

* release 0.0.2 ([29a092d](https://github.com/gravity-ui/graph/commit/29a092d1f3d74759dc0cd322b4bc08c4777fc3af))
* release 0.0.3 ([b724fe9](https://github.com/gravity-ui/graph/commit/b724fe983595c3964a50ba344d702c350eb0f073))
* release 0.0.4 ([fbe3c6e](https://github.com/gravity-ui/graph/commit/fbe3c6eba9c72bdf004168c6370dfc09f2c63b85))
* release 0.0.5 ([f1204ad](https://github.com/gravity-ui/graph/commit/f1204ad4d47128f2352fcd100a18418c0fe9b38f))
* release 0.0.6 ([e71ef16](https://github.com/gravity-ui/graph/commit/e71ef16d9a3d2c36a531e9224ba8d5180956743e))
* release 0.1.1 ([8126d0a](https://github.com/gravity-ui/graph/commit/8126d0ad61d9427d48857fd1d6768742ab36636d))
* release 0.3.1 ([9b43f89](https://github.com/gravity-ui/graph/commit/9b43f89c36a259c7121268da4d53fcb0517b20c9))
* release 1.0.0 ([48fdd24](https://github.com/gravity-ui/graph/commit/48fdd24c63c3653adc18cd1d3ce5e2c353384efa))
* release 1.1.2 ([79a1098](https://github.com/gravity-ui/graph/commit/79a109807fbd96118732c5a4082da2aba7ab1c71))
* release 1.1.4 ([f45c596](https://github.com/gravity-ui/graph/commit/f45c596e271d7d696a4b11960e8d7a208c3bbb4a))
* release 1.10.1 ([5ab2b80](https://github.com/gravity-ui/graph/commit/5ab2b801ce3e7bf54697ed75cf7e4a4819f96240))
* release 1.10.2 ([d38b444](https://github.com/gravity-ui/graph/commit/d38b444fed97b670558efcac189cdc002a30402d))
* release 1.11.0 ([4f25c34](https://github.com/gravity-ui/graph/commit/4f25c346e970c23702874db40366b8e5f9784f71))
* release 1.11.1 ([1b7175c](https://github.com/gravity-ui/graph/commit/1b7175cf2964f3020dc0273e70f66d8a22aa78d0))
* release 1.2.0-rc ([342203f](https://github.com/gravity-ui/graph/commit/342203f9f53ae9d9bce0ad8224bce0939cf44893))
* release 1.2.1 ([1370c00](https://github.com/gravity-ui/graph/commit/1370c009e15070b201f710b60df280c924f7883f))
* release 1.7.0 ([aa6dadd](https://github.com/gravity-ui/graph/commit/aa6dadd01bd6beeba27be77f4558d36a3b86f2a4))
* release 1.7.3 ([41f0055](https://github.com/gravity-ui/graph/commit/41f00550d54ed28c8fb9d7deace62f27ab731eb5))
* release 1.8.0 ([4500891](https://github.com/gravity-ui/graph/commit/45008919601610ecab95b7c4e12516fee3adfc36))
* release 1.8.0-rc.1 ([37570cd](https://github.com/gravity-ui/graph/commit/37570cd597942f3e566bf3ea500e9df0f917dd68))
* release 1.8.0-rc.2 ([8781a7d](https://github.com/gravity-ui/graph/commit/8781a7dc84f29ea0b573ab9e665ca41e02cfa853))
* release 1.8.0-rc.3 ([4a5fd70](https://github.com/gravity-ui/graph/commit/4a5fd70e83ce40de321221f3cfe07b9888d4404d))
* release 1.8.0-rc.4 ([50f5cb4](https://github.com/gravity-ui/graph/commit/50f5cb48b8a6b8ff0a02422209bcce00bef1b002))
* release 1.8.0-rc.6 ([21abb71](https://github.com/gravity-ui/graph/commit/21abb710c2d4674434d15e71f55fe4cfd8ae941a))
* release 1.8.0-rc.7 ([3f2170c](https://github.com/gravity-ui/graph/commit/3f2170cec6b11e3beede3a558f15e8b9fe0bf876))
* release 1.8.0-rc.8 ([e82120b](https://github.com/gravity-ui/graph/commit/e82120b8355a274c5e2a18a4f6f0e366593ee758))
* release 1.8.2 ([3f3b14f](https://github.com/gravity-ui/graph/commit/3f3b14f39929a3c5d5e1579cc100c02ab9a03fe7))
* release 1.8.5 ([357f5b0](https://github.com/gravity-ui/graph/commit/357f5b08636be84b2d7418cb4b10da71e882e7ed))


### Dependencies

* The following workspace dependencies were updated
  * peerDependencies
    * @gravity-ui/graph bumped to 2.0.0-next.0

## Changelog
