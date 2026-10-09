# Tests

Browser tests that load the app in headless Chrome and check the parts analysis, the parts table, the summary and exports, the 3D view and performance on a large model. They use only Node's built-in test runner and a local Chrome, so there is nothing to install.

```bash
node --test 'tests/*.test.mjs'
```

- Needs Node 22+ (for the built-in `WebSocket`) and Google Chrome or Chromium. Set `CHROME_PATH` if Chrome isn't in its default location.
- The app's three.js, Bootstrap and other libraries load from CDNs, so the tests need network access.
- Models come from `demo.glb` and `examples/`.
