require('dotenv').config();
const path = require('path');
const express = require('express');
const { initSchema, pool } = require('./db');
const todosRouter = require('./routes/todos');

const app = express();
app.use(express.json());

// Serve the frontend UI (public/index.html and any assets in that folder)
app.use(express.static(path.join(__dirname, '../public')));

// Simple health check - used by the Load Balancer / ECS / your CI pipeline
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'error', db: 'disconnected', message: err.message });
  }
});

app.use('/todos', todosRouter);

const PORT = process.env.PORT || 3000;

// Only start listening if this file is run directly (not when imported by tests)
if (require.main === module) {
  initSchema()
    .then(() => {
      app.listen(PORT, () => console.log(`App listening on port ${PORT}`));
    })
    .catch((err) => {
      console.error('Failed to initialize DB schema', err);
      process.exit(1);
    });
}

module.exports = app;