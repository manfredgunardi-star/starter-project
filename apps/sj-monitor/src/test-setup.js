import { vi } from 'vitest';
vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-key');
vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', 'test.firebaseapp.com');
vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'test-project');
vi.stubEnv('VITE_FIREBASE_STORAGE_BUCKET', 'test-project.appspot.com');
vi.stubEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', '000000000000');
vi.stubEnv('VITE_FIREBASE_APP_ID', '1:000000000000:web:test');
