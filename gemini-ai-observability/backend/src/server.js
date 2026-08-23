import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import DatabaseConstructor from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 4000);

// Single-file SQLite DB, no server/daemon required.
const dbPath =
  process.env.DATABASE_PATH ||
  path.join(__dirname, '..', '..', 'db', 'gemini_observability.sqlite3');

const initSqlPath =
  path.join(__dirname, '..', '..', 'db', 'init.sql');

const db = new DatabaseConstructor(dbPath);

db.pragma('journal_mode = WAL');

// Initialize database
db.exec(fs.readFileSync(initSqlPath, 'utf8'));

app.use(cors({ origin: true }));
app.use(express.json({ limit: '256kb' }));

// Dashboard
app.use(express.static(
  path.join(__dirname, '..', '..', 'dashboard')
));

app.get('/', (_req, res) => {
  try {
    db.prepare('SELECT 1').get();

    res.json({
      ok: true,
      service: 'gemini-observability-api',
      db: 'sqlite'
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      error: 'database_unavailable'
    });
  }
});

function validEmail(email) {
  return (
    typeof email === 'string' &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
  );
}

const upsertEmployee = db.prepare(`
  INSERT INTO employees(email, department, role)
  VALUES (@email, @department, @role)
  ON CONFLICT(email) DO UPDATE SET
    department = COALESCE(@department, department),
    role = COALESCE(@role, role)
`);

const getEmployeeId = db.prepare(
  'SELECT id FROM employees WHERE email = ?'
);

const insertEvent = db.prepare(`
  INSERT OR IGNORE INTO usage_events
  (
    employee_id,
    event_type,
    session_id,
    interaction_id,
    model,
    occurred_at,
    latency_ms,
    prompt_length,
    response_length,
    metadata
  )
  VALUES
  (
    @employee_id,
    @event_type,
    @session_id,
    @interaction_id,
    @model,
    @occurred_at,
    @latency_ms,
    @prompt_length,
    @response_length,
    @metadata
  )
`);

const completeEvent = db.prepare(`
  UPDATE usage_events
  SET
    latency_ms = @latency_ms,
    prompt_length = @prompt_length,
    response_length = @response_length,
    model = @model,
    metadata = @metadata
  WHERE employee_id = @employee_id
    AND interaction_id = @interaction_id
`);

app.post('/api/usage/events', (req, res) => {
  const body = req.body || {};

  const {
    email,
    department,
    role,
    event_type,
    session_id,
    interaction_id,
    model,
    occurred_at,
    latency_ms,
    prompt_length,
    response_length,
    metadata
  } = body;

  if (
    !validEmail(email) ||
    typeof event_type !== 'string' ||
    !occurred_at
  ) {
    return res.status(400).json({
      error: 'email, event_type and occurred_at are required'
    });
  }

  try {
    const insertAll = db.transaction(() => {
      // Create/update employee
      upsertEmployee.run({
        email,
        department: department ?? null,
        role: role ?? null
      });

      const employeeId = getEmployeeId.get(email).id;

      const interactionId =
        interaction_id || crypto.randomUUID();

      const metadataJson =
        JSON.stringify(metadata ?? {});

      // ========================================================
      // INTERACTION COMPLETED
      // Update the existing interaction_started row
      // ========================================================

      if (event_type === 'interaction_completed') {
        const result = completeEvent.run({
          employee_id: employeeId,
          interaction_id: interactionId,
          latency_ms: latency_ms ?? null,
          prompt_length: prompt_length ?? null,
          response_length: response_length ?? null,
          model: model ?? null,
          metadata: metadataJson
        });

        return {
          inserted: result.changes === 1,
          event_id: null
        };
      }

      // ========================================================
      // NEW EVENT
      // ========================================================

      const result = insertEvent.run({
        employee_id: employeeId,
        event_type,
        session_id: session_id ?? null,
        interaction_id: interactionId,
        model: model ?? null,
        occurred_at,
        latency_ms: latency_ms ?? null,
        prompt_length: prompt_length ?? null,
        response_length: response_length ?? null,
        metadata: metadataJson
      });

      return {
        inserted: result.changes === 1,
        event_id: result.lastInsertRowid
      };
    });

    const { inserted, event_id } = insertAll();

    res.status(201).json({
      accepted: true,
      inserted,
      event_id: inserted ? event_id : null
    });

  } catch (error) {
    console.error('[gemini-obs] EVENT INGESTION ERROR:', error);

    res.status(500).json({
      error: 'event_ingestion_failed'
    });
  }
});

// ============================================================
// OVERALL USAGE SUMMARY
// ============================================================

app.get('/api/usage/summary', (_req, res) => {
  try {
    const row = db.prepare(`
      SELECT
        COUNT(*) FILTER (
          WHERE event_type = 'interaction_started'
        ) AS interactions,

        COUNT(DISTINCT employee_id) AS active_employees,

        COUNT(DISTINCT session_id) AS sessions,

        ROUND(
          AVG(latency_ms)
          FILTER (WHERE latency_ms IS NOT NULL)
        ) AS avg_latency_ms

      FROM usage_events
    `).get();

    res.json(row);
  } catch (error) {
    res.status(500).json({
      error: 'summary_failed'
    });
  }
});


// ============================================================
// USAGE BY EMPLOYEE
// ============================================================

app.get('/api/usage/by-employee', (_req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        e.email,
        e.department,

        COUNT(u.id) FILTER (
          WHERE u.event_type = 'interaction_started'
        ) AS interactions,

        COUNT(DISTINCT u.session_id) AS sessions,

        ROUND(
          AVG(u.latency_ms)
          FILTER (WHERE u.latency_ms IS NOT NULL)
        ) AS avg_latency_ms

      FROM employees e

      LEFT JOIN usage_events u
        ON u.employee_id = e.id

      GROUP BY
        e.id,
        e.email,
        e.department

      ORDER BY interactions DESC
    `).all();

    res.json(rows);
  } catch (error) {
    res.status(500).json({
      error: 'employee_summary_failed'
    });
  }
});


// ============================================================
// START SERVER
// ============================================================

app.listen(port, () => {
  console.log(
    `Gemini observability API listening on http://localhost:${port} (sqlite: ${dbPath})`
  );
});
