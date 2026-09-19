import { defineConfig } from 'astro/config';
const site = process.env.PUBLIC_SITE || 'https://501-studio.github.io';
const base = process.env.PUBLIC_BASE_PATH ?? '/simsim-lab';
export default defineConfig({ site, base, trailingSlash: 'always', build: { format: 'directory' } });