const request = require('supertest');

// These tests run against a real Postgres instance.
// In CI (GitHub Actions), a postgres service container is spun up automatically - see .github/workflows/ci.yml
// Locally, run `docker compose up -d db` first, then `npm test` from the app/ folder.

const app = require('../src/index');
const { pool, initSchema } = require('../src/db');

beforeAll(async () => {
  await initSchema();
});

afterAll(async () => {
  await pool.query('DELETE FROM todos');
  await pool.end();
});

describe('Health check', () => {
  it('GET /health returns ok when DB is reachable', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('Todos CRUD', () => {
  let createdId;

  it('POST /todos creates a todo', async () => {
    const res = await request(app).post('/todos').send({ title: 'Write CI/CD guide' });
    expect(res.statusCode).toBe(201);
    expect(res.body.title).toBe('Write CI/CD guide');
    createdId = res.body.id;
  });

  it('GET /todos lists todos', async () => {
    const res = await request(app).get('/todos');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('PUT /todos/:id marks as done', async () => {
    const res = await request(app).put(`/todos/${createdId}`).send({ done: true });
    expect(res.statusCode).toBe(200);
    expect(res.body.done).toBe(true);
  });

  it('DELETE /todos/:id removes the todo', async () => {
    const res = await request(app).delete(`/todos/${createdId}`);
    expect(res.statusCode).toBe(204);
  });

  it('POST /todos without title returns 400', async () => {
    const res = await request(app).post('/todos').send({});
    expect(res.statusCode).toBe(400);
  });
});
