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
// GEMINI PROVIDER CONFIGURATION
// ============================================================

const PROVIDER = 'google';
const PRODUCT = 'gemini';

// ============================================================
// DATABASE
// ============================================================

const dbPath =
    process.env.DATABASE_PATH ||
    path.join(
        __dirname,
        '..',
        '..',
        'db',
        'gemini_observability.sqlite3'
    );

const initSqlPath =
    path.join(
        __dirname,
        '..',
        '..',
        'db',
        'init.sql'
    );

const db = new DatabaseConstructor(dbPath);

db.pragma('journal_mode = WAL');

// Initialize database
db.exec(
    fs.readFileSync(initSqlPath, 'utf8')
);

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(cors({ origin: true }));

app.use(
    express.json({
        limit: '256kb'
    })
);

// ============================================================
// DASHBOARD
// ============================================================

app.use(
    express.static(
        path.join(
            __dirname,
            '..',
            '..',
            'dashboard'
        )
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
            db: 'sqlite',
            provider: PROVIDER,
            product: PRODUCT
        });

    } catch (error) {

        res.status(503).json({
            ok: false,
            error: 'database_unavailable'
        });

    }
});

// ============================================================
// HELPERS
// ============================================================

function validEmail(email) {

    return (
        typeof email === 'string' &&
        /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
    );

}

// ============================================================
// EMPLOYEE UPSERT
// ============================================================

const upsertEmployee = db.prepare(`
    INSERT INTO employees(
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
        department = COALESCE(
            @department,
            department
        ),
        role = COALESCE(
            @role,
            role
        )
`);

const getEmployeeId = db.prepare(
    'SELECT id FROM employees WHERE email = ?'
);

// ============================================================
// INSERT EVENT
// ============================================================

const insertEvent = db.prepare(`
    INSERT OR IGNORE INTO usage_events
    (
        employee_id,
        provider,
        product,
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
        @provider,
        @product,
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

// ============================================================
// COMPLETE EVENT
// ============================================================

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
      AND provider = @provider
      AND product = @product
`);

// ============================================================
// EVENT INGESTION
// ============================================================

app.post(
    '/api/usage/events',
    (req, res) => {

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

        // ----------------------------------------------------
        // VALIDATION
        // ----------------------------------------------------

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

                // ------------------------------------------------
                // CREATE / UPDATE EMPLOYEE
                // ------------------------------------------------

                upsertEmployee.run({
                    email,
                    department:
                        department ?? null,
                    role:
                        role ?? null
                });

                const employeeId =
                    getEmployeeId.get(email).id;

                // ------------------------------------------------
                // INTERACTION ID
                // ------------------------------------------------

                const interactionId =
                    interaction_id ||
                    crypto.randomUUID();

                // ------------------------------------------------
                // METADATA
                // ------------------------------------------------

                const metadataJson =
                    JSON.stringify(
                        metadata ?? {}
                    );

                // =================================================
                // INTERACTION COMPLETED
                // =================================================

                if (
                    event_type ===
                    'interaction_completed'
                ) {

                    const result =
                        completeEvent.run({

                            employee_id:
                                employeeId,

                            provider:
                                PROVIDER,

                            product:
                                PRODUCT,

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

                // =================================================
                // NEW EVENT
                // =================================================

                const result =
                    insertEvent.run({

                        employee_id:
                            employeeId,

                        provider:
                            PROVIDER,

                        product:
                            PRODUCT,

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

            // ----------------------------------------------------
            // RESPONSE
            // ----------------------------------------------------

            res.status(201).json({

                accepted: true,

                inserted,

                event_id:
                    inserted
                        ? event_id
                        : null,

                provider: PROVIDER,

                product: PRODUCT
            });

        } catch (error) {

            console.error(
                '[gemini-obs] EVENT INGESTION ERROR:',
                error
            );

            res.status(500).json({
                error:
                    'event_ingestion_failed'
            });

        }

    }
);

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

                        COUNT(
                            DISTINCT employee_id
                        ) AS active_employees,

                        COUNT(
                            DISTINCT session_id
                        ) AS sessions,

                        ROUND(
                            AVG(latency_ms)
                            FILTER (
                                WHERE latency_ms IS NOT NULL
                            )
                        ) AS avg_latency_ms

                    FROM usage_events

                    WHERE provider = ?
                      AND product = ?
                `)
                .get(
                    PROVIDER,
                    PRODUCT
                );

            res.json(row);

        } catch (error) {

            console.error(
                '[gemini-obs] SUMMARY ERROR:',
                error
            );

            res.status(500).json({
                error:
                    'summary_failed'
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

                        COUNT(
                            DISTINCT u.session_id
                        ) AS sessions,

                        ROUND(
                            AVG(u.latency_ms)
                            FILTER (
                                WHERE u.latency_ms
                                IS NOT NULL
                            )
                        ) AS avg_latency_ms

                    FROM employees e

                    LEFT JOIN usage_events u
                        ON u.employee_id = e.id
                        AND u.provider = ?
                        AND u.product = ?

                    GROUP BY
                        e.id,
                        e.email,
                        e.department

                    ORDER BY
                        interactions DESC
                `)
                .all(
                    PROVIDER,
                    PRODUCT
                );

            res.json(rows);

        } catch (error) {

            console.error(
                '[gemini-obs] EMPLOYEE SUMMARY ERROR:',
                error
            );

            res.status(500).json({
                error:
                    'employee_summary_failed'
            });

        }

    }
);

// ============================================================
// USAGE BY PRODUCT
// ============================================================

app.get(
    '/api/usage/by-product',
    (_req, res) => {

        try {

            const rows =
                db.prepare(`
                    SELECT

                        product,

                        COUNT(*) FILTER (
                            WHERE event_type =
                                'interaction_started'
                        ) AS interactions,

                        COUNT(
                            DISTINCT session_id
                        ) AS sessions,

                        ROUND(
                            AVG(latency_ms)
                            FILTER (
                                WHERE latency_ms
                                IS NOT NULL
                            )
                        ) AS avg_latency_ms

                    FROM usage_events

                    WHERE provider = ?
                      AND product = ?

                    GROUP BY product

                    ORDER BY interactions DESC
                `)
                .all(
                    PROVIDER,
                    PRODUCT
                );

            res.json(rows);

        } catch (error) {

            console.error(
                '[gemini-obs] PRODUCT SUMMARY ERROR:',
                error
            );

            res.status(500).json({
                error:
                    'product_summary_failed'
            });

        }

    }
);

// ============================================================
// USAGE BY PROVIDER
// ============================================================

app.get(
    '/api/usage/by-provider',
    (_req, res) => {

        try {

            const rows =
                db.prepare(`
                    SELECT

                        provider,

                        COUNT(*) FILTER (
                            WHERE event_type =
                                'interaction_started'
                        ) AS interactions,

                        COUNT(
                            DISTINCT session_id
                        ) AS sessions,

                        ROUND(
                            AVG(latency_ms)
                            FILTER (
                                WHERE latency_ms
                                IS NOT NULL
                            )
                        ) AS avg_latency_ms

                    FROM usage_events

                    WHERE provider = ?

                    GROUP BY provider

                    ORDER BY interactions DESC
                `)
                .all(
                    PROVIDER
                );

            res.json(rows);

        } catch (error) {

            console.error(
                '[gemini-obs] PROVIDER SUMMARY ERROR:',
                error
            );

            res.status(500).json({
                error:
                    'provider_summary_failed'
            });

        }

    }
);

// ============================================================
// EMPLOYEE × AI PRODUCT
// ============================================================

app.get(
    '/api/usage/by-employee-product',
    (_req, res) => {

        try {

            const rows =
                db.prepare(`
                    SELECT

                        e.email,

                        e.department,

                        u.provider,

                        u.product,

                        COUNT(u.id) FILTER (
                            WHERE u.event_type =
                                'interaction_started'
                        ) AS interactions,

                        COUNT(
                            DISTINCT u.session_id
                        ) AS sessions,

                        ROUND(
                            AVG(u.latency_ms)
                            FILTER (
                                WHERE u.latency_ms
                                IS NOT NULL
                            )
                        ) AS avg_latency_ms

                    FROM employees e

                    LEFT JOIN usage_events u
                        ON u.employee_id = e.id

                    WHERE
                        u.provider IS NOT NULL
                        AND u.product IS NOT NULL

                    GROUP BY

                        e.id,
                        e.email,
                        e.department,
                        u.provider,
                        u.product

                    ORDER BY
                        interactions DESC
                `)
                .all();

            res.json(rows);

        } catch (error) {

            console.error(
                '[gemini-obs] EMPLOYEE PRODUCT ERROR:',
                error
            );

            res.status(500).json({
                error:
                    'employee_product_summary_failed'
            });

        }

    }
);

// ============================================================
// START SERVER
// ============================================================

app.listen(
    port,
    () => {

        console.log(
            '================================='
        );

        console.log(
            `[gemini-obs] Gemini observability API listening on http://localhost:${port}`
        );

        console.log(
            `[gemini-obs] Provider: ${PROVIDER}`
        );

        console.log(
            `[gemini-obs] Product: ${PRODUCT}`
        );

        console.log(
            `[gemini-obs] SQLite: ${dbPath}`
        );

        console.log(
            '================================='
        );

    }
);