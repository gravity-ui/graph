# v1 package contract

This fixture protects the public contract of the actual npm tarball produced from
the current branch. It is intentionally branch-agnostic so the same command can
run unchanged on `main` and the future `release/v1` branch.

Run the check with:

```sh
npm run test:package-contract
```

The command builds and packs the package, installs only that tarball as the
`@gravity-ui/graph` source in isolated vanilla and React consumers, checks the
published export map, declarations, CSS assets, TypeScript consumption, and
browser-runtime bundles, and compares the public declarations with the committed
baseline.

After an explicitly approved v1 maintenance change modifies the supported public
contract, review the diff and update the baseline with:

```sh
npm run test:package-contract -- --update
```

The CI workflow wiring belongs to #313. The command itself performs no publish,
release, dist-tag, or GitHub operation.
