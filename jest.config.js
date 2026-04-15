/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      displayName: 'api',
      rootDir: './api',
    },
    {
      displayName: 'simulator',
      rootDir: './simulator',
    },
    {
      displayName: 'database',
      rootDir: './libs/database',
    },
    {
      displayName: 'settlement',
      rootDir: './settlement',
    },
  ],
};
