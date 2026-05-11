// Node environment (default) - no jsdom needed
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

let mockInitializeFirestore;
let mockPersistentLocalCache;
let mockPersistentMultipleTabManager;

beforeEach(() => {
  vi.resetModules();

  mockPersistentMultipleTabManager = vi.fn(() => ({ _mock: 'multiTabManager' }));
  mockPersistentLocalCache = vi.fn((opts) => ({ _mock: 'persistentCache', ...opts }));
  mockInitializeFirestore = vi.fn(() => ({ _mock: 'firestoreInstance' }));

  vi.doMock('firebase/app', () => ({
    initializeApp: vi.fn(() => ({ _mock: 'app' })),
  }));

  vi.doMock('firebase/auth', () => ({
    getAuth: vi.fn(() => ({ _mock: 'auth' })),
    setPersistence: vi.fn(() => Promise.resolve()),
    browserLocalPersistence: { _mock: 'localPersistence' },
    signInWithEmailAndPassword: vi.fn(),
    signOut: vi.fn(),
    onAuthStateChanged: vi.fn(),
  }));

  vi.doMock('firebase/firestore', () => ({
    initializeFirestore: mockInitializeFirestore,
    persistentLocalCache: mockPersistentLocalCache,
    persistentMultipleTabManager: mockPersistentMultipleTabManager,
    doc: vi.fn(),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    collection: vi.fn(),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    onSnapshot: vi.fn(),
    writeBatch: vi.fn(),
  }));

  vi.doMock('firebase/functions', () => ({
    getFunctions: vi.fn(() => ({ _mock: 'functions' })),
    httpsCallable: vi.fn(() => vi.fn()),
  }));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('firebase-config: Firestore offline persistence', () => {
  it('calls persistentMultipleTabManager() untuk multi-tab support', async () => {
    await import('../firebase-config.js');
    expect(mockPersistentMultipleTabManager).toHaveBeenCalledTimes(1);
  });

  it('calls persistentLocalCache() dengan tabManager dari persistentMultipleTabManager', async () => {
    await import('../firebase-config.js');
    expect(mockPersistentLocalCache).toHaveBeenCalledWith(
      expect.objectContaining({ tabManager: expect.objectContaining({ _mock: 'multiTabManager' }) })
    );
  });

  it('calls initializeFirestore dengan localCache option', async () => {
    await import('../firebase-config.js');
    expect(mockInitializeFirestore).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        localCache: expect.objectContaining({ _mock: 'persistentCache' }),
      })
    );
  });

  it('tetap pass experimentalAutoDetectLongPolling: true ke initializeFirestore', async () => {
    await import('../firebase-config.js');
    expect(mockInitializeFirestore).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ experimentalAutoDetectLongPolling: true })
    );
  });
});
