# Contributing

1. `npm install`
2. `npm test`, `npm run typecheck`
3. Keep the core free of React Native imports (`src/core`). It runs in plain Jest.
4. Native changes: test on a real device. CallKit and ConnectionService don't behave fully in simulators or emulators.
5. Landmark data is generated (see README). Only add images with a free licence, and regenerate `ATTRIBUTION.md`.

Please open an issue before starting a large change.
