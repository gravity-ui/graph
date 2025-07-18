# Changelog

## [1.1.4](https://github.com/gravity-ui/graph/compare/v1.1.3...v1.1.4) (2025-07-10)


### chore

* release 1.1.4 ([f45c596](https://github.com/gravity-ui/graph/commit/f45c596e271d7d696a4b11960e8d7a208c3bbb4a))


### Features

* **Graph:** Add method to get elements in viewport ([9f10e1c](https://github.com/gravity-ui/graph/commit/9f10e1c37a654bc6a1c901601d638a63b930ce8e))


### Bug Fixes

* **Layer:** fix Layer lifecycle ([#112](https://github.com/gravity-ui/graph/issues/112)) ([9f10e1c](https://github.com/gravity-ui/graph/commit/9f10e1c37a654bc6a1c901601d638a63b930ce8e))

## [1.1.3](https://github.com/gravity-ui/graph/compare/v1.1.2...v1.1.3) (2025-07-09)


### Bug Fixes

* fix add/remove hitbox item ([3b0bb42](https://github.com/gravity-ui/graph/commit/3b0bb42a774c71609c4268e28485679452d5b026))

## [1.1.2](https://github.com/gravity-ui/graph/compare/v1.1.0...v1.1.2) (2025-07-09)

### Bug Fixes

* fix for react strict mode ([#107](https://github.com/gravity-ui/graph/issues/107)) ([07ba2ee](https://github.com/gravity-ui/graph/commit/07ba2ee95ccc334b18db8c10a58067085d7d8f8d))

## [1.1.0](https://github.com/gravity-ui/graph/compare/v1.0.1...v1.1.0) (2025-07-06)


### Features

* Improved performance ([#101](https://github.com/gravity-ui/graph/issues/101)) ([51f0279](https://github.com/gravity-ui/graph/commit/51f0279d132ed041b24a5754ccef17e3d323ff99))

## [1.0.1](https://github.com/gravity-ui/graph/compare/v1.0.0...v1.0.1) (2025-06-27)


### Bug Fixes

* minor fixes ([#100](https://github.com/gravity-ui/graph/issues/100)) ([178d24c](https://github.com/gravity-ui/graph/commit/178d24cf7ea0270e85717f74060ee9ba43010a24))

## [1.0.0](https://github.com/gravity-ui/graph/compare/v0.5.0...v1.0.0) (2025-06-20)


### ⚠ BREAKING CHANGES

* React components moved to separate module

### chore

* release 1.0.0 ([48fdd24](https://github.com/gravity-ui/graph/commit/48fdd24c63c3653adc18cd1d3ce5e2c353384efa))


### refactor

* separate React dependencies from core library ([#74](https://github.com/gravity-ui/graph/issues/74)) ([12648c4](https://github.com/gravity-ui/graph/commit/12648c47b33cbf4f5945a09a54197d4ed61c46fc))

## [0.5.0](https://github.com/gravity-ui/graph/compare/v0.4.3...v0.5.0) (2025-06-19)


### Features

* add double-click event support for graph components ([#92](https://github.com/gravity-ui/graph/issues/92)) ([df6ed69](https://github.com/gravity-ui/graph/commit/df6ed698a952d3e1863b9e86400fdd460c04833c))


### Bug Fixes

* update anchors before geometry to fix React positioning ([#98](https://github.com/gravity-ui/graph/issues/98)) ([59700fa](https://github.com/gravity-ui/graph/commit/59700fa88a371c75c2abf13ef8aedc77fcc729c8))

## [0.4.3](https://github.com/gravity-ui/graph/compare/v0.4.2...v0.4.3) (2025-05-14)


### Bug Fixes

* **layers:** set attached flag on start to enable proper detach/remount ([#82](https://github.com/gravity-ui/graph/issues/82)) ([a01be39](https://github.com/gravity-ui/graph/commit/a01be39d90ab065148703a4a2e0c54d086168f99))
* **story:** always deep-clone state on export to prevent frozen/proxied object errors ([#87](https://github.com/gravity-ui/graph/issues/87)) ([a936de5](https://github.com/gravity-ui/graph/commit/a936de5a07bdebaeefeb22f6e8768418cc821986))

## [0.4.2](https://github.com/gravity-ui/graph/compare/v0.4.1...v0.4.2) (2025-04-28)


### Bug Fixes

* **Layer:** streamline context setting in afterInit and createCanvas methods ([a7b93e3](https://github.com/gravity-ui/graph/commit/a7b93e35a0fc10393e3579664f501647349bd2c7))

## [0.4.1](https://github.com/gravity-ui/graph/compare/v0.4.0...v0.4.1) (2025-04-28)


### Bug Fixes

* **package.json:** update copy-styles command to use quotes for path consistency ([#76](https://github.com/gravity-ui/graph/issues/76)) ([172254a](https://github.com/gravity-ui/graph/commit/172254a694989dbd3a583599a5eb39b16a307ef7))

## [0.4.0](https://github.com/gravity-ui/graph/compare/v0.3.1...v0.4.0) (2025-04-27)


### Features

* add useLayer hook for managing graph layers and enhance documentation ([c7e083f](https://github.com/gravity-ui/graph/commit/c7e083f62429346c0d9396f73de016468f1a8e38))
* **Camera:** add methods for converting relative coordinates to absolute screen space ([84a8111](https://github.com/gravity-ui/graph/commit/84a81113ac9fa5c7474c35f3fbc3f6a4093fc798))
* **DevTools:** introduce DevToolsLayer for enhanced graph debugging and measurement ([d450e12](https://github.com/gravity-ui/graph/commit/d450e12d7ec9070f7dfd833cec58e48394ba0f8e))
* export useLayer hook from index file to enhance layer management ([43d4e9c](https://github.com/gravity-ui/graph/commit/43d4e9c6da6682a2cd7ddb1a79fa1aa36c24ba2a))
* **Layers:** add an AbortController to manage events ([#64](https://github.com/gravity-ui/graph/issues/64)) ([714fb0e](https://github.com/gravity-ui/graph/commit/714fb0ee1738988b967469391dc86298d5ace47c))
* **NewBlockLayer, ConnectionLayer:** added validation and duplication of blocks by a group ([#62](https://github.com/gravity-ui/graph/issues/62)) ([4df468d](https://github.com/gravity-ui/graph/commit/4df468dc6dd75cab288c05bb0d08591e25579bf1))


### Bug Fixes

* **Events:** remove mousemove event from API/docs: it was never actually dispatched ([8393772](https://github.com/gravity-ui/graph/commit/8393772ca602b59f987bebc6407f45a0ec2f2ca9))
* **Group:** stop click event propagation to prevent selection reset ([#65](https://github.com/gravity-ui/graph/issues/65)) ([7b438de](https://github.com/gravity-ui/graph/commit/7b438decc1da886bf66fbb334e38116fcddbcbc2))
* Improve block signal handling and add $blocksReactiveState for full state tracking ([48c78aa](https://github.com/gravity-ui/graph/commit/48c78aa9432809bc4ab1059b1528a4db956a9135))
* make showConnectionArrows setting properly control arrow visibility ([#67](https://github.com/gravity-ui/graph/issues/67)) ([8139e37](https://github.com/gravity-ui/graph/commit/8139e3706ff071fa337054b9292e93340d77f82c))

## [0.3.1](https://github.com/gravity-ui/graph/compare/v0.3.0...v0.3.1) (2025-03-19)


### chore

* release 0.3.1 ([9b43f89](https://github.com/gravity-ui/graph/commit/9b43f89c36a259c7121268da4d53fcb0517b20c9))


### Features

* **canvas:** allow customize below layer ([#56](https://github.com/gravity-ui/graph/issues/56)) ([8b20838](https://github.com/gravity-ui/graph/commit/8b208381a8a3ff6fee3d9d2252155661f273083c))


### Bug Fixes

* delayed anchor render on html layer ([#54](https://github.com/gravity-ui/graph/issues/54)) ([da92917](https://github.com/gravity-ui/graph/commit/da929176ed073aef30a572671caf9b9e5b9d7a47))
* Delegate pointer-events from the BlockGroupLayer to the Camera on interact with groups ([#57](https://github.com/gravity-ui/graph/issues/57)) ([450475b](https://github.com/gravity-ui/graph/commit/450475bfc7ac369a408565611ca57afab995297a))
* improve anchors props type ([#52](https://github.com/gravity-ui/graph/issues/52)) ([0553bfa](https://github.com/gravity-ui/graph/commit/0553bfa4687eadbcc2d314a6d31254266eccbb3e))

## [0.3.0](https://github.com/gravity-ui/graph/compare/v0.2.1...v0.3.0) (2025-03-05)


### Features

* Presented BlockGroups layer ([#48](https://github.com/gravity-ui/graph/issues/48)) ([096543a](https://github.com/gravity-ui/graph/commit/096543aad79409adf9cd587633ec5c7f76c95f74))
* **Storybook:** change elk examples ([#46](https://github.com/gravity-ui/graph/issues/46)) ([a3a181a](https://github.com/gravity-ui/graph/commit/a3a181a8607fd2333b343610797698fe357bd9f4))

## [0.2.1](https://github.com/gravity-ui/graph/compare/v0.2.0...v0.2.1) (2025-01-31)


### Bug Fixes

* unselect entities without meta key pressed ([#42](https://github.com/gravity-ui/graph/issues/42)) ([fc670dc](https://github.com/gravity-ui/graph/commit/fc670dc96f7bfd8a49f5f17f8bfbde8feefde1b0))

## [0.2.0](https://github.com/gravity-ui/graph/compare/v0.1.2...v0.2.0) (2025-01-14)


### Features

* elk converter ([#37](https://github.com/gravity-ui/graph/issues/37)) ([afe4c67](https://github.com/gravity-ui/graph/commit/afe4c67ed6280d611368c6c05146c80333a96494))


### Bug Fixes

* get correct scale ([#38](https://github.com/gravity-ui/graph/issues/38)) ([2323ca9](https://github.com/gravity-ui/graph/commit/2323ca9b5f04c6bd3608ccc423a405b52a337956))
* unmount connection arrow on unmount connection ([#40](https://github.com/gravity-ui/graph/issues/40)) ([b5c46c4](https://github.com/gravity-ui/graph/commit/b5c46c41665e1454d76d4a91cbed0de997093f43))

## [0.1.2](https://github.com/gravity-ui/graph/compare/v0.1.1...v0.1.2) (2024-12-18)


### Bug Fixes

* update snapshots on release on CI ([#34](https://github.com/gravity-ui/graph/issues/34)) ([e5c0daa](https://github.com/gravity-ui/graph/commit/e5c0daad291bdac249bd771bf6573bff7cf2ad87))

## [0.1.1](https://github.com/gravity-ui/graph/compare/v0.1.0...v0.1.1) (2024-12-18)


### chore

* release 0.1.1 ([8126d0a](https://github.com/gravity-ui/graph/commit/8126d0ad61d9427d48857fd1d6768742ab36636d))

## [0.1.0](https://github.com/gravity-ui/graph/compare/v0.0.6...v0.1.0) (2024-12-18)


### Features

* Allow to customization the connections ([#29](https://github.com/gravity-ui/graph/issues/29)) ([fe4fb33](https://github.com/gravity-ui/graph/commit/fe4fb3350719954945fe003b6aa3833a8215800f))

## [0.0.6](https://github.com/gravity-ui/graph/compare/v0.0.5...v0.0.6) (2024-12-03)


### chore

* release 0.0.6 ([e71ef16](https://github.com/gravity-ui/graph/commit/e71ef16d9a3d2c36a531e9224ba8d5180956743e))


### Features

* add connection label inner paddings ([#27](https://github.com/gravity-ui/graph/issues/27)) ([a6791e0](https://github.com/gravity-ui/graph/commit/a6791e0a1ef68238a79bae0d03d7ac108dec57fa))

## [0.0.5](https://github.com/gravity-ui/graph/compare/v0.0.4...v0.0.5) (2024-11-29)


### chore

* release 0.0.5 ([f1204ad](https://github.com/gravity-ui/graph/commit/f1204ad4d47128f2352fcd100a18418c0fe9b38f))

## [0.0.4](https://github.com/gravity-ui/graph/compare/v0.0.3...v0.0.4) (2024-11-26)


### chore

* release 0.0.4 ([fbe3c6e](https://github.com/gravity-ui/graph/commit/fbe3c6eba9c72bdf004168c6370dfc09f2c63b85))


### Features

* **anchor:** add selected field for anchor selection change event ([49b9c10](https://github.com/gravity-ui/graph/commit/49b9c10818cecd7fa0bda27c79edbff344fe813e))


### Bug Fixes

* update css after call setEntities ([a38b363](https://github.com/gravity-ui/graph/commit/a38b363f31ee7f7a84826ce616706e9e659ec5d5))

## [0.0.3](https://github.com/gravity-ui/graph/compare/v0.0.2...v0.0.3) (2024-10-22)


### chore

* release 0.0.3 ([b724fe9](https://github.com/gravity-ui/graph/commit/b724fe983595c3964a50ba344d702c350eb0f073))


### Features

* **TConnection:** add id field ([3e5b9a7](https://github.com/gravity-ui/graph/commit/3e5b9a7cf891a1a08908026d1065da59f793be7a))


### Bug Fixes

* **selection:** stop emit unselect event if select field not specified ([8642d3b](https://github.com/gravity-ui/graph/commit/8642d3b49dd5b53f496d8cca3506ad3593e2084e))
* **useBlockAnchorState:** fix no blockState when graph entities updated ([4fbdc37](https://github.com/gravity-ui/graph/commit/4fbdc37e876c6c9f08f77b684f19789a65b95982))

## 0.0.2 (2024-10-17)


### chore

* release 0.0.2 ([29a092d](https://github.com/gravity-ui/graph/commit/29a092d1f3d74759dc0cd322b4bc08c4777fc3af))


### Features

* add Playground story ([#5](https://github.com/gravity-ui/graph/issues/5)) ([fec352a](https://github.com/gravity-ui/graph/commit/fec352acb5cc91bbeeffab1075f0cf615f2b4201))
* **CI:** Add ci actions ([59cf335](https://github.com/gravity-ui/graph/commit/59cf33500148cc71ae5d95fd78f2cae595a025c6))
* **utils:** trackpad detector improvements ([bec6a31](https://github.com/gravity-ui/graph/commit/bec6a311775f10057708fd12f21a8cddc2fe825c))


### Bug Fixes

* **Camera:** fix block event propagation ([0b9ca02](https://github.com/gravity-ui/graph/commit/0b9ca02da0863a7c7e555ea34dad8b7e7fb2e0ef))
* **LayersService:** disconnect resizeObserver when the service is detached ([bcabe44](https://github.com/gravity-ui/graph/commit/bcabe442cfe640136683729711032bdbc99a6a6e))
* **Minimap:** fix crashes when block has no viewComponent ([78e3186](https://github.com/gravity-ui/graph/commit/78e31860d0d9075a2eef20abd68236241d9f1442))
