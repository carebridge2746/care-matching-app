import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * 모든 테스트가 공유하는 준비.
 *
 * Mock 어댑터는 AsyncStorage 에 저장하므로, 테스트에서는 메모리로 대신하고
 * 테스트마다 비운다 — 앞 테스트가 남긴 요청이나 매칭이 뒤 테스트의 답을 바꾸지 않게 한다.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock 어댑터가 화면의 로딩 표시를 보려고 흉내 내는 네트워크 지연은 테스트에서 건너뛴다
jest.mock('@/api/mock-store', () => ({
  ...jest.requireActual('@/api/mock-store'),
  delay: () => Promise.resolve(),
}));

beforeEach(async () => {
  await AsyncStorage.clear();
});
