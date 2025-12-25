import { config } from 'dotenv';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

// Load environment variables from .env file for tests
config();

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: false,
  },
});
