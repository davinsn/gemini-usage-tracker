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

// ============================================================
// DATABASE
// ============================================================

const dbPath =
  process.env.DATABASE_PATH ||
  path.join(__dirname, '..', '..', 'db', 'gemini_observability.sqlite3');

const initSqlPath =
  path.join(__dirname, '..', '..', 'db', 'init.sql');

// Make sure the database directory exists
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseConstructor(dbPath);

db.pragma('journal_mode = WAL');

// Initialize database
db.exec(fs.readFileSync(initSqlPath, 'utf8'));

console.log(`[gemini-obs] SQLite database: ${dbPath}`);

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(cors({ origin: true }));

app.use(express.json({ limit: '256kb' }));

// ============================================================
// DASHBOARD
// ============================================================

app.use(
  express.static(
    path.join(__dirname, '..', '..', 'dashboard')
  )
);

// ============================================================
// HEALTH CHECK
// ============================================================

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

// ============================================================
// VALIDATION
// ============================================================

function validEmail(email) {

  return (
    typeof email === 'string' &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
  );

}

// ============================================================
// PREPARED STATEMENTS
// ============================================================

const upsertEmployee = db.prepare(`
  INSERT INTO employees (
    email,
    department,
    role
  )
  VALUES (
    @email,
    @department,
    @role
  )
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

// ============================================================
// DUMMY COMPANY EMPLOYEES
// ============================================================

const dummyEmployees = [
  {
    email: 'ali@company.com',
    department: 'Engineering',
    role: 'Software Engineer'
  },
  {
    email: 'davin@company.com',
    department: 'Engineering',
    role: 'Software Engineer'
  },
  {
    email: 'sarah@company.com',
    department: 'Marketing',
    role: 'Marketing Executive'
  },
  {
    email: 'jason@company.com',
    department: 'Finance',
    role: 'Financial Analyst'
  },
  {
    email: 'mei@company.com',
    department: 'Human Resources',
    role: 'HR Executive'
  },
  {
    email: 'daniel@company.com',
    department: 'Engineering',
    role: 'Backend Developer'
  },
  {
    email: 'farah@company.com',
    department: 'Operations',
    role: 'Operations Executive'
  },
  {
    email: 'ryan@company.com',
    department: 'Sales',
    role: 'Sales Executive'
  }
];

// ============================================================
// SEED EMPLOYEES
// ============================================================

const seedEmployees = db.transaction(() => {

  for (const employee of dummyEmployees) {

    upsertEmployee.run({
      email: employee.email,
      department: employee.department,
      role: employee.role
    });

  }

});

seedEmployees();

console.log(
  `[gemini-obs] Loaded ${dummyEmployees.length} dummy employees`
);

// ============================================================
// SEED DUMMY USAGE
// ============================================================

function seedDummyUsage() {

  // Check whether usage already exists.
  // This prevents the data from doubling every time
  // the Node.js server restarts.

  const existing = db
    .prepare('SELECT COUNT(*) AS count FROM usage_events')
    .get();

  if (existing.count > 0) {

    console.log(
      '[gemini-obs] Existing usage data detected - skipping dummy usage seed'
    );

    return;
  }

  console.log(
    '[gemini-obs] Creating dummy Gemini usage data...'
  );

  const usageProfiles = {

    'ali@company.com': {
      sessions: 24,
      interactions: 183
    },

    'davin@company.com': {
      sessions: 31,
      interactions: 247
    },

    'sarah@company.com': {
      sessions: 18,
      interactions: 96
    },

    'jason@company.com': {
      sessions: 12,
      interactions: 64
    },

    'mei@company.com': {
      sessions: 21,
      interactions: 119
    },

    'daniel@company.com': {
      sessions: 27,
      interactions: 156
    },

    'farah@company.com': {
      sessions: 15,
      interactions: 83
    },

    'ryan@company.com': {
      sessions: 19,
      interactions: 102
    }

  };

  const seedUsage = db.transaction(() => {

    for (const employee of dummyEmployees) {

      const employeeId =
        getEmployeeId.get(employee.email).id;

      const profile =
        usageProfiles[employee.email];

      let interactionsRemaining =
        profile.interactions;

      for (
        let sessionNumber = 1;
        sessionNumber <= profile.sessions;
        sessionNumber++
      ) {

        if (interactionsRemaining <= 0) {
          break;
        }

        // Spread interactions across sessions
        const remainingSessions =
          profile.sessions - sessionNumber + 1;

        let interactionsThisSession =
          Math.ceil(
            interactionsRemaining /
            remainingSessions
          );

        // Add some variation
        if (sessionNumber % 3 === 0) {
          interactionsThisSession += 1;
        }

        interactionsThisSession =
          Math.min(
            interactionsThisSession,
            interactionsRemaining
          );

        const sessionId =
          `dummy-${employee.email}-${sessionNumber}`;

        for (
          let interactionNumber = 1;
          interactionNumber <= interactionsThisSession;
          interactionNumber++
        ) {

          const interactionId =
            `dummy-${employee.email}-${sessionNumber}-${interactionNumber}`;

          // Random latency between 500ms and 1300ms
          const latency =
            Math.floor(
              500 + Math.random() * 800
            );

          const promptLength =
            Math.floor(
              40 + Math.random() * 500
            );

          const responseLength =
            Math.floor(
              100 + Math.random() * 1500
            );

          // Spread data across the last 30 days
          const daysAgo =
            Math.floor(
              Math.random() * 30
            );

          const hoursAgo =
            Math.floor(
              Math.random() * 24
            );

          const occurredAt =
            new Date(
              Date.now()
              - daysAgo * 24 * 60 * 60 * 1000
              - hoursAgo * 60 * 60 * 1000
            ).toISOString();

          const metadata = JSON.stringify({
            source: 'dummy_seed',
            provider: 'gemini',
            account_type: 'company',
            browser: 'Chrome',
            generated: true
          });

          // --------------------------------------------------
          // INTERACTION STARTED
          // --------------------------------------------------

          insertEvent.run({

            employee_id: employeeId,

            event_type: 'interaction_started',

            session_id: sessionId,

            interaction_id: interactionId,

            model: 'gemini',

            occurred_at: occurredAt,

            latency_ms: null,

            prompt_length: null,

            response_length: null,

            metadata

          });

          // --------------------------------------------------
          // INTERACTION COMPLETED
          // --------------------------------------------------

          completeEvent.run({

            employee_id: employeeId,

            interaction_id: interactionId,

            latency_ms: latency,

            prompt_length: promptLength,

            response_length: responseLength,

            model: 'gemini',

            metadata

          });

        }

        interactionsRemaining -=
          interactionsThisSession;

      }

    }

  });

  seedUsage();

  console.log(
    '[gemini-obs] Dummy Gemini usage created'
  );

}

seedDummyUsage();

// ============================================================
// EVENT INGESTION
// ============================================================

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
      error:
        'email, event_type and occurred_at are required'
    });

  }

  try {

    const insertAll = db.transaction(() => {

      // ------------------------------------------------------
      // CREATE / UPDATE EMPLOYEE
      // ------------------------------------------------------

      upsertEmployee.run({

        email,

        department:
          department ?? null,

        role:
          role ?? null

      });

      const employeeId =
        getEmployeeId.get(email).id;

      const interactionId =
        interaction_id ||
        crypto.randomUUID();

      const metadataJson =
        JSON.stringify(
          metadata ?? {}
        );

      // ------------------------------------------------------
      // INTERACTION COMPLETED
      // ------------------------------------------------------

      if (
        event_type ===
        'interaction_completed'
      ) {

        const result =
          completeEvent.run({

            employee_id:
              employeeId,

            interaction_id:
              interactionId,

            latency_ms:
              latency_ms ?? null,

            prompt_length:
              prompt_length ?? null,

            response_length:
              response_length ?? null,

            model:
              model ?? null,

            metadata:
              metadataJson

          });

        return {

          inserted:
            result.changes === 1,

          event_id:
            null

        };

      }

      // ------------------------------------------------------
      // NEW EVENT
      // ------------------------------------------------------

      const result =
        insertEvent.run({

          employee_id:
            employeeId,

          event_type,

          session_id:
            session_id ?? null,

          interaction_id:
            interactionId,

          model:
            model ?? null,

          occurred_at,

          latency_ms:
            latency_ms ?? null,

          prompt_length:
            prompt_length ?? null,

          response_length:
            response_length ?? null,

          metadata:
            metadataJson

        });

      return {

        inserted:
          result.changes === 1,

        event_id:
          result.lastInsertRowid

      };

    });

    const {
      inserted,
      event_id
    } = insertAll();

    res.status(201).json({

      accepted: true,

      inserted,

      event_id:
        inserted
          ? event_id
          : null

    });

  } catch (error) {

    console.error(
      '[gemini-obs] EVENT INGESTION ERROR:',
      error
    );

    res.status(500).json({
      error: 'event_ingestion_failed'
    });

  }

});

// ============================================================
// OVERALL USAGE SUMMARY
// ============================================================

app.get(
  '/api/usage/summary',
  (_req, res) => {

    try {

      const row =
        db.prepare(`
          SELECT

            COUNT(*) FILTER (
              WHERE event_type =
              'interaction_started'
            ) AS interactions,

            COUNT(DISTINCT employee_id)
              FILTER (
                WHERE event_type =
                'interaction_started'
              ) AS active_employees,

            COUNT(DISTINCT session_id)
              FILTER (
                WHERE session_id IS NOT NULL
              ) AS sessions,

            ROUND(
              AVG(latency_ms)
              FILTER (
                WHERE latency_ms IS NOT NULL
              )
            ) AS avg_latency_ms

          FROM usage_events
        `).get();

      res.json(row);

    } catch (error) {

      console.error(
        '[gemini-obs] SUMMARY ERROR:',
        error
      );

      res.status(500).json({
        error: 'summary_failed'
      });

    }

  }
);

// ============================================================
// USAGE BY EMPLOYEE
// ============================================================

app.get(
  '/api/usage/by-employee',
  (_req, res) => {

    try {

      const rows =
        db.prepare(`
          SELECT

            e.email,

            e.department,

            COUNT(u.id) FILTER (
              WHERE u.event_type =
              'interaction_started'
            ) AS interactions,

            COUNT(DISTINCT u.session_id)
              FILTER (
                WHERE u.session_id IS NOT NULL
              ) AS sessions,

            ROUND(
              AVG(u.latency_ms)
              FILTER (
                WHERE u.latency_ms IS NOT NULL
              )
            ) AS avg_latency_ms

          FROM employees e

          LEFT JOIN usage_events u
            ON u.employee_id = e.id

          GROUP BY
            e.id,
            e.email,
            e.department

          ORDER BY
            interactions DESC
        `).all();

      res.json(rows);

    } catch (error) {

      console.error(
        '[gemini-obs] EMPLOYEE SUMMARY ERROR:',
        error
      );

      res.status(500).json({
        error: 'employee_summary_failed'
      });

    }

  }
);

// ============================================================
// START SERVER
// ============================================================

app.listen(port, () => {

  console.log(
    `Gemini observability API listening on http://localhost:${port}`
  );

});