/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  roots: ["<rootDir>/__tests__"],
  testPathIgnorePatterns: ["/helpers/"],
  setupFiles: ["<rootDir>/jest.setup.js"],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|sip\\.js)",
  ],
  moduleNameMapper: {
    "^react-native-webrtc$": "<rootDir>/__mocks__/react-native-webrtc.ts",
    "^expo-image$": "<rootDir>/__mocks__/expo-image.tsx",
    "^expo-blur$": "<rootDir>/__mocks__/expo-blur.tsx",
    "^expo-linear-gradient$": "<rootDir>/__mocks__/expo-linear-gradient.tsx",
    "^@expo/vector-icons/Ionicons$": "<rootDir>/__mocks__/vector-icons-ionicons.tsx",
  },
  collectCoverageFrom: ["src/**/*.{ts,tsx}", "!src/**/index.ts"],
};
