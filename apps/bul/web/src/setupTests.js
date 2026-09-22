import '@testing-library/jest-dom/vitest';

// antd memakai matchMedia
if (!window.matchMedia) {
  window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
}
