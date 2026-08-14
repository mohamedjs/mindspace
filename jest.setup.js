// Native modules with no JS implementation under jest. Each mock is the one
// its own maintainers publish for this purpose.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Reanimated 4 runs worklets through react-native-worklets, which needs a real
// native module. Its mock runs every worklet inline on the JS thread — which is
// exactly what a render smoke test wants: the closures still get built, so a
// worklet referencing an uninitialised binding still throws.
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

require('react-native-gesture-handler/jestSetup');
