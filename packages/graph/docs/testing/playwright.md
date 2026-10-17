# Testing graph applications with Playwright

Playwright page objects (`GraphPO`, `GraphBlockPO`, `GraphConnectionPO`, `GraphCameraPO`) are published as a separate
package, [`@gravity-ui/graph-playwright`](https://github.com/gravity-ui/graph/blob/v2/packages/graph-playwright/README.md):

```bash
npm install --save-dev @gravity-ui/graph-playwright @playwright/test
```

They find an attached graph through `Symbol.for(GRAPH_INSTANCE_SYMBOL_KEY)` on its root element; the key is exported
from `@gravity-ui/graph`.
