/**
 * Vercel Serverless Entry Point
 *
 * This file exports the Express app as a serverless function for Vercel.
 * Vercel will route all requests through this handler via vercel.json rewrites.
 *
 * Locally, use `node src/index.js` as usual.
 */
const app = require('../src/app');

module.exports = app;
