import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import DatabaseConstructor from 'better-sqlite3';

const __dirname = path.dirname(
    fileURLToPath(import.meta.url)
);

const app = express();

const port =
    Number(process.env.PORT || 4000);

// ============================================================
// DEFAULT PROVIDER CONFIGURATION
// ============================================================

const DEFAULT_PROVIDER = 'google';
const DEFAULT_PRODUCT = 'gemini';

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

const db =
    new DatabaseConstructor(dbPath);

db.pragma('journal_mode = WAL');

// Initialize database
db.exec(
    fs.readFileSync(
        initSqlPath,
        'utf8'
    )
);

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(
    cors({
        origin: true
    })
);

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
        db.prepare(
            'SELECT 1'
        ).get();

        res.json({
            ok: true,
            service: 'ai-observability-api',
            db: 'sqlite',
            defaultProvider: DEFAULT_PROVIDER,
            defaultProduct: DEFAULT_PRODUCT
        });

    } catch (error) {

        console.error(
            '[ai-obs] HEALTH ERROR:',
            error
        );

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

function toNullableNumber(value) {
    if (
        value === null ||
        value === undefined ||
        value === ''
    ) {
        return null;
    }

    const number = Number(value);

    return Number.isFinite(number)
        ? number
        : null;
}

function safeMetadata(metadata) {
    try {
        return JSON.stringify(
            metadata ?? {}
        );
    } catch {
        return JSON.stringify({});
    }
}

// ============================================================
// AUTHENTICATION
// ============================================================

app.post(
    '/api/auth/login',
    async (req, res) => {

        try {

            const {
                email,
                password
            } = req.body || {};

            // ----------------------------------------------------
            // VALIDATION
            // ----------------------------------------------------

            if (!validEmail(email)) {

                return res.status(400).json({
                    success: false,
                    error: 'A valid email is required'
                });
            }

            if (
                typeof password !== 'string' ||
                password.length === 0
            ) {

                return res.status(400).json({
                    success: false,
                    error: 'Password is required'
                });
            }

            // ----------------------------------------------------
            // FIND EMPLOYEE
            // ----------------------------------------------------

            const employee =
                db.prepare(`
                    SELECT
                        id,
                        email,
                        department,
                        role,
                        password_hash
                    FROM employees
                    WHERE LOWER(email) = LOWER(?)
                `).get(email);

            if (!employee) {

                return res.status(401).json({
                    success: false,
                    error: 'Invalid email or password'
                });
            }

            // ----------------------------------------------------
            // CHECK PASSWORD
            // ----------------------------------------------------

            if (!employee.password_hash) {

                return res.status(401).json({
                    success: false,
                    error:
                        'This employee account has no password configured'
                });
            }

            const passwordValid =
                await bcrypt.compare(
                    password,
                    employee.password_hash
                );

            if (!passwordValid) {

                return res.status(401).json({
                    success: false,
                    error: 'Invalid email or password'
                });
            }

            // ----------------------------------------------------
            // RESPONSE
            // ----------------------------------------------------

            res.json({
                success: true,
                employee: {
                    id: employee.id,
                    email: employee.email,
                    department: employee.department,
                    role: employee.role
                }
            });

        } catch (error) {

            console.error(
                '[ai-obs] LOGIN ERROR:',
                error
            );

            res.status(500).json({
                success: false,
                error: 'login_failed'
            });
        }
    }
);

// ============================================================
// CURRENT EMPLOYEE
// NO JWT REQUIRED
// ============================================================

app.get(
    '/api/auth/me',
    (req, res) => {

        try {

            const email =
                req.query.email;

            if (!validEmail(email)) {

                return res.status(400).json({
                    success: false,
                    error:
                        'A valid email query parameter is required'
                });
            }

            const employee =
                db.prepare(`
                    SELECT
                        id,
                        email,
                        department,
                        role
                    FROM employees
                    WHERE LOWER(email) = LOWER(?)
                `).get(email);

            if (!employee) {

                return res.status(404).json({
                    success: false,
                    error: 'Employee not found'
                });
            }

            res.json({
                success: true,
                employee
            });

        } catch (error) {

            console.error(
                '[ai-obs] AUTH ME ERROR:',
                error
            );

            res.status(500).json({
                success: false,
                error: 'auth_check_failed'
            });
        }
    }
);

// ============================================================
// INSERT EVENT
// ============================================================

const insertEvent =
    db.prepare(`
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
            prompt_tokens,
            response_tokens,
            total_tokens,
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
            @prompt_tokens,
            @response_tokens,
            @total_tokens,
            @metadata
        )
    `);

// ============================================================
// COMPLETE EVENT
// ============================================================

const completeEvent =
    db.prepare(`
        UPDATE usage_events
        SET
            event_type = 'interaction_completed',
            latency_ms = @latency_ms,
            prompt_length = @prompt_length,
            response_length = @response_length,
            prompt_tokens = @prompt_tokens,
            response_tokens = @response_tokens,
            total_tokens = @total_tokens,
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

        try {

            const body =
                req.body || {};

            const {
                email,
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
                prompt_tokens,
                response_tokens,
                total_tokens,
                metadata
            } = body;

            // ----------------------------------------------------
            // EMAIL VALIDATION
            // ----------------------------------------------------

            if (
                !email ||
                typeof email !== 'string'
            ) {

                return res.status(400).json({
                    accepted: false,
                    error: 'email is required'
                });
            }

            // ----------------------------------------------------
            // FIND EMPLOYEE
            // ----------------------------------------------------

            const employee =
                db.prepare(`
                    SELECT
                        id,
                        email
                    FROM employees
                    WHERE LOWER(email) = LOWER(?)
                `).get(email);

            if (!employee) {

                console.error(
                    '[ai-obs] EMPLOYEE NOT FOUND:',
                    email
                );

                return res.status(404).json({
                    accepted: false,
                    error: 'Employee not found'
                });
            }

            const employeeId =
                employee.id;

            // ----------------------------------------------------
            // PROVIDER / PRODUCT
            // ----------------------------------------------------

            const eventProvider =
                typeof provider === 'string' &&
                provider.trim()
                    ? provider.trim().toLowerCase()
                    : DEFAULT_PROVIDER;

            const eventProduct =
                typeof product === 'string' &&
                product.trim()
                    ? product.trim().toLowerCase()
                    : DEFAULT_PRODUCT;

            // ----------------------------------------------------
            // EVENT VALIDATION
            // ----------------------------------------------------

            if (
                typeof event_type !== 'string' ||
                !event_type.trim()
            ) {

                return res.status(400).json({
                    accepted: false,
                    error:
                        'event_type is required'
                });
            }

            if (!occurred_at) {

                return res.status(400).json({
                    accepted: false,
                    error:
                        'occurred_at is required'
                });
            }

            // ----------------------------------------------------
            // INTERACTION ID
            // ----------------------------------------------------

            const interactionId =
                interaction_id ||
                crypto.randomUUID();

            // ----------------------------------------------------
            // NORMALISE VALUES
            // ----------------------------------------------------

            const latency =
                toNullableNumber(
                    latency_ms
                );

            const promptLength =
                toNullableNumber(
                    prompt_length
                );

            const responseLength =
                toNullableNumber(
                    response_length
                );

            const promptTokens =
                toNullableNumber(
                    prompt_tokens
                );

            const responseTokens =
                toNullableNumber(
                    response_tokens
                );

            const totalTokens =
                toNullableNumber(
                    total_tokens
                );

            const metadataJson =
                safeMetadata(metadata);

            // ----------------------------------------------------
            // LOG EVENT
            // ----------------------------------------------------

            console.log(
                '[ai-obs] EVENT:',
                {
                    employee_id: employeeId,
                    email: employee.email,
                    provider: eventProvider,
                    product: eventProduct,
                    event_type,
                    session_id,
                    interaction_id: interactionId
                }
            );

            // ====================================================
            // INTERACTION COMPLETED
            // ====================================================

            if (
                event_type ===
                'interaction_completed'
            ) {

                if (!interaction_id) {

                    return res.status(400).json({
                        accepted: false,
                        error:
                            'interaction_id is required for interaction_completed'
                    });
                }

                const result =
                    completeEvent.run({
                        employee_id:
                            employeeId,

                        provider:
                            eventProvider,

                        product:
                            eventProduct,

                        interaction_id:
                            interactionId,

                        latency_ms:
                            latency,

                        prompt_length:
                            promptLength,

                        response_length:
                            responseLength,

                        prompt_tokens:
                            promptTokens,

                        response_tokens:
                            responseTokens,

                        total_tokens:
                            totalTokens,

                        model:
                            model ?? null,

                        metadata:
                            metadataJson
                    });

                // ------------------------------------------------
                // ORIGINAL EVENT NOT FOUND
                // ------------------------------------------------

                if (
                    result.changes === 0
                ) {

                    return res.status(404).json({
                        accepted: false,
                        inserted: false,
                        updated: false,
                        changes: 0,
                        event_id: null,
                        employee_id:
                            employeeId,
                        email:
                            employee.email,
                        provider:
                            eventProvider,
                        product:
                            eventProduct,
                        error:
                            'interaction_not_found'
                    });
                }

                // ------------------------------------------------
                // GET UPDATED EVENT
                // ------------------------------------------------

                const updatedEvent =
                    db.prepare(`
                        SELECT id
                        FROM usage_events
                        WHERE employee_id = ?
                          AND provider = ?
                          AND product = ?
                          AND interaction_id = ?
                        ORDER BY id DESC
                        LIMIT 1
                    `).get(
                        employeeId,
                        eventProvider,
                        eventProduct,
                        interactionId
                    );

                return res.status(200).json({
                    accepted: true,
                    inserted: false,
                    updated: true,
                    changes:
                        result.changes,
                    event_id:
                        updatedEvent?.id ??
                        null,
                    employee_id:
                        employeeId,
                    email:
                        employee.email,
                    provider:
                        eventProvider,
                    product:
                        eventProduct
                });
            }

            // ====================================================
            // NEW EVENT
            // ====================================================

            const result =
                insertEvent.run({
                    employee_id:
                        employeeId,

                    provider:
                        eventProvider,

                    product:
                        eventProduct,

                    event_type:
                        event_type.trim(),

                    session_id:
                        session_id ?? null,

                    interaction_id:
                        interactionId,

                    model:
                        model ?? null,

                    occurred_at,

                    latency_ms:
                        latency,

                    prompt_length:
                        promptLength,

                    response_length:
                        responseLength,

                    prompt_tokens:
                        promptTokens,

                    response_tokens:
                        responseTokens,

                    total_tokens:
                        totalTokens,

                    metadata:
                        metadataJson
                });

            const inserted =
                result.changes === 1;

            // ----------------------------------------------------
            // RESPONSE
            // ----------------------------------------------------

            return res.status(
                inserted ? 201 : 200
            ).json({
                accepted: true,

                inserted,

                updated: false,

                duplicate:
                    !inserted,

                changes:
                    result.changes,

                event_id:
                    inserted
                        ? result.lastInsertRowid
                        : null,

                employee_id:
                    employeeId,

                email:
                    employee.email,

                provider:
                    eventProvider,

                product:
                    eventProduct
            });

        } catch (error) {

            console.error(
                '[ai-obs] EVENT INGESTION ERROR:',
                error
            );

            return res.status(500).json({
                accepted: false,
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
    (req, res) => {

        try {

            const provider =
                req.query.provider || null;

            const product =
                req.query.product || null;

            let row;

            if (
                provider &&
                product
            ) {

                row =
                    db.prepare(`
                        SELECT
                            COUNT(*) FILTER (
                                WHERE event_type =
                                    'interaction_completed'
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
                                    WHERE latency_ms
                                    IS NOT NULL
                                )
                            ) AS avg_latency_ms,

                            COALESCE(
                                SUM(prompt_tokens),
                                0
                            ) AS prompt_tokens,

                            COALESCE(
                                SUM(response_tokens),
                                0
                            ) AS response_tokens,

                            COALESCE(
                                SUM(total_tokens),
                                0
                            ) AS total_tokens

                        FROM usage_events

                        WHERE provider = ?
                          AND product = ?
                    `).get(
                        provider,
                        product
                    );

            } else {

                row =
                    db.prepare(`
                        SELECT
                            COUNT(*) FILTER (
                                WHERE event_type =
                                    'interaction_completed'
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
                                    WHERE latency_ms
                                    IS NOT NULL
                                )
                            ) AS avg_latency_ms,

                            COALESCE(
                                SUM(prompt_tokens),
                                0
                            ) AS prompt_tokens,

                            COALESCE(
                                SUM(response_tokens),
                                0
                            ) AS response_tokens,

                            COALESCE(
                                SUM(total_tokens),
                                0
                            ) AS total_tokens

                        FROM usage_events
                    `).get();
            }

            res.json(row);

        } catch (error) {

            console.error(
                '[ai-obs] SUMMARY ERROR:',
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
    (req, res) => {

        try {

            const provider =
                req.query.provider || null;

            const product =
                req.query.product || null;

            let rows;

            const productCounts = `
                COUNT(u.id) FILTER (
                    WHERE u.event_type =
                        'interaction_completed'
                    AND LOWER(u.product) =
                        'gemini'
                ) AS gemini,

                COUNT(u.id) FILTER (
                    WHERE u.event_type =
                        'interaction_completed'
                    AND LOWER(u.product) =
                        'chatgpt'
                ) AS chatgpt,

                COUNT(u.id) FILTER (
                    WHERE u.event_type =
                        'interaction_completed'
                    AND LOWER(u.product) =
                        'claude'
                ) AS claude,

                COUNT(u.id) FILTER (
                    WHERE u.event_type =
                        'interaction_completed'
                    AND LOWER(u.product) =
                        'copilot'
                ) AS copilot,

                COUNT(u.id) FILTER (
                    WHERE u.event_type =
                        'interaction_completed'
                    AND LOWER(u.product) =
                        'perplexity'
                ) AS perplexity,

                COUNT(u.id) FILTER (
                    WHERE u.event_type =
                        'interaction_completed'
                    AND LOWER(u.product) =
                        'qwen'
                ) AS qwen
            `;

            if (
                provider &&
                product
            ) {

                rows =
                    db.prepare(`
                        SELECT
                            e.email,
                            e.department,

                            COUNT(u.id) FILTER (
                                WHERE u.event_type =
                                    'interaction_completed'
                            ) AS interactions,

                            ${productCounts},

                            COUNT(
                                DISTINCT u.session_id
                            ) AS sessions,

                            ROUND(
                                AVG(u.latency_ms)
                                FILTER (
                                    WHERE u.latency_ms
                                    IS NOT NULL
                                )
                            ) AS avg_latency_ms,

                            COALESCE(
                                SUM(u.prompt_tokens),
                                0
                            ) AS prompt_tokens,

                            COALESCE(
                                SUM(u.response_tokens),
                                0
                            ) AS response_tokens,

                            COALESCE(
                                SUM(u.total_tokens),
                                0
                            ) AS total_tokens

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
                    `).all(
                        provider,
                        product
                    );

            } else {

                rows =
                    db.prepare(`
                        SELECT
                            e.email,
                            e.department,

                            COUNT(u.id) FILTER (
                                WHERE u.event_type =
                                    'interaction_completed'
                            ) AS interactions,

                            ${productCounts},

                            COUNT(
                                DISTINCT u.session_id
                            ) AS sessions,

                            ROUND(
                                AVG(u.latency_ms)
                                FILTER (
                                    WHERE u.latency_ms
                                    IS NOT NULL
                                )
                            ) AS avg_latency_ms,

                            COALESCE(
                                SUM(u.prompt_tokens),
                                0
                            ) AS prompt_tokens,

                            COALESCE(
                                SUM(u.response_tokens),
                                0
                            ) AS response_tokens,

                            COALESCE(
                                SUM(u.total_tokens),
                                0
                            ) AS total_tokens

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
            }

            res.json(rows);

        } catch (error) {

            console.error(
                '[ai-obs] EMPLOYEE SUMMARY ERROR:',
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
    (req, res) => {

        try {

            const provider =
                req.query.provider || null;

            let rows;

            if (provider) {

                rows =
                    db.prepare(`
                        SELECT
                            provider,
                            product,

                            COUNT(*) FILTER (
                                WHERE event_type =
                                    'interaction_completed'
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
                            ) AS avg_latency_ms,

                            COALESCE(
                                SUM(prompt_tokens),
                                0
                            ) AS prompt_tokens,

                            COALESCE(
                                SUM(response_tokens),
                                0
                            ) AS response_tokens,

                            COALESCE(
                                SUM(total_tokens),
                                0
                            ) AS total_tokens

                        FROM usage_events

                        WHERE provider = ?

                        GROUP BY
                            provider,
                            product

                        ORDER BY
                            interactions DESC
                    `).all(provider);

            } else {

                rows =
                    db.prepare(`
                        SELECT
                            provider,
                            product,

                            COUNT(*) FILTER (
                                WHERE event_type =
                                    'interaction_completed'
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
                            ) AS avg_latency_ms,

                            COALESCE(
                                SUM(prompt_tokens),
                                0
                            ) AS prompt_tokens,

                            COALESCE(
                                SUM(response_tokens),
                                0
                            ) AS response_tokens,

                            COALESCE(
                                SUM(total_tokens),
                                0
                            ) AS total_tokens

                        FROM usage_events

                        GROUP BY
                            provider,
                            product

                        ORDER BY
                            interactions DESC
                    `).all();
            }

            res.json(rows);

        } catch (error) {

            console.error(
                '[ai-obs] PRODUCT SUMMARY ERROR:',
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
                                'interaction_completed'
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
                                WHERE latency_ms
                                IS NOT NULL
                            )
                        ) AS avg_latency_ms,

                        COALESCE(
                            SUM(prompt_tokens),
                            0
                        ) AS prompt_tokens,

                        COALESCE(
                            SUM(response_tokens),
                            0
                        ) AS response_tokens,

                        COALESCE(
                            SUM(total_tokens),
                            0
                        ) AS total_tokens,

                        COALESCE(
                            SUM(total_tokens),
                            0
                        ) AS estimated_tokens

                    FROM usage_events

                    WHERE provider IS NOT NULL

                    GROUP BY provider

                    ORDER BY
                        interactions DESC
                `).all();

            res.json(rows);

        } catch (error) {

            console.error(
                '[ai-obs] PROVIDER SUMMARY ERROR:',
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
// USAGE BY PROVIDER + PRODUCT
// ============================================================

app.get(
    '/api/usage/by-provider-product',
    (_req, res) => {

        try {

            const rows =
                db.prepare(`
                    SELECT
                        provider,
                        product,

                        COUNT(*) FILTER (
                            WHERE event_type =
                                'interaction_completed'
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
                                WHERE latency_ms
                                IS NOT NULL
                            )
                        ) AS avg_latency_ms,

                        COALESCE(
                            SUM(prompt_tokens),
                            0
                        ) AS prompt_tokens,

                        COALESCE(
                            SUM(response_tokens),
                            0
                        ) AS response_tokens,

                        COALESCE(
                            SUM(total_tokens),
                            0
                        ) AS total_tokens

                    FROM usage_events

                    WHERE provider IS NOT NULL
                      AND product IS NOT NULL

                    GROUP BY
                        provider,
                        product

                    ORDER BY
                        interactions DESC
                `).all();

            res.json(rows);

        } catch (error) {

            console.error(
                '[ai-obs] PROVIDER PRODUCT ERROR:',
                error
            );

            res.status(500).json({
                error:
                    'provider_product_summary_failed'
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
                                'interaction_completed'
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
                        ) AS avg_latency_ms,

                        COALESCE(
                            SUM(u.prompt_tokens),
                            0
                        ) AS prompt_tokens,

                        COALESCE(
                            SUM(u.response_tokens),
                            0
                        ) AS response_tokens,

                        COALESCE(
                            SUM(u.total_tokens),
                            0
                        ) AS total_tokens

                    FROM employees e

                    INNER JOIN usage_events u
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
                `).all();

            res.json(rows);

        } catch (error) {

            console.error(
                '[ai-obs] EMPLOYEE PRODUCT ERROR:',
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
// RAW USAGE EVENTS
// ============================================================

app.get(
    '/api/usage/events',
    (req, res) => {

        try {

            let limit =
                Number(
                    req.query.limit
                ) || 100;

            limit =
                Math.max(
                    1,
                    Math.min(
                        limit,
                        1000
                    )
                );

            const rows =
                db.prepare(`
                    SELECT
                        u.id,
                        e.email,
                        e.department,
                        e.role,
                        u.provider,
                        u.product,
                        u.event_type,
                        u.session_id,
                        u.interaction_id,
                        u.model,
                        u.occurred_at,
                        u.latency_ms,
                        u.prompt_length,
                        u.response_length,
                        u.prompt_tokens,
                        u.response_tokens,
                        u.total_tokens,
                        u.metadata

                    FROM usage_events u

                    INNER JOIN employees e
                        ON e.id = u.employee_id

                    ORDER BY
                        u.id DESC

                    LIMIT ?
                `).all(limit);

            res.json(rows);

        } catch (error) {

            console.error(
                '[ai-obs] EVENTS QUERY ERROR:',
                error
            );

            res.status(500).json({
                error:
                    'events_query_failed'
            });
        }
    }
);

// ============================================================
// BNM USD -> MYR EXCHANGE RATE
// ============================================================

app.get(
    '/api/exchange-rate/usd-myr',
    async (_req, res) => {

        try {

            const response = await fetch(
                'https://api.bnm.gov.my/public/exchange-rate',
                {
                    method: 'GET',
                    headers: {
                        'Accept':
                            'application/vnd.BNM.API.v1+json',
                        'User-Agent':
                            'AI-Observability-API/1.0'
                    }
                }
            );

            const responseText = await response.text();

            console.log(
                '[ai-obs] BNM HTTP STATUS:',
                response.status
            );

            // console.log(
            //     '[ai-obs] BNM RAW RESPONSE:',
            //     responseText
            // );

            if (!response.ok) {
                throw new Error(
                    `BNM API returned HTTP ${response.status}: ${responseText}`
                );
            }

            const data = JSON.parse(responseText);

            // BNM returns data as an array
            const usd = Array.isArray(data?.data)
                ? data.data.find(
                    currency =>
                        currency?.currency_code === 'USD'
                )
                : null;

            if (!usd || !usd.rate) {

                return res.status(502).json({
                    success: false,
                    error:
                        'USD exchange rate not found in BNM response'
                });
            }

            const buyingRate =
                Number(usd.rate.buying_rate);

            const sellingRate =
                Number(usd.rate.selling_rate);

            const middleRate =
                usd.rate.middle_rate != null
                    ? Number(usd.rate.middle_rate)
                    : (
                        Number.isFinite(buyingRate) &&
                        Number.isFinite(sellingRate)
                    )
                        ? (
                            buyingRate +
                            sellingRate
                        ) / 2
                        : null;

            return res.json({

                success: true,

                currency: 'USD',

                target_currency: 'MYR',

                unit:
                    usd.unit ?? 1,

                buying_rate:
                    Number.isFinite(buyingRate)
                        ? buyingRate
                        : null,

                selling_rate:
                    Number.isFinite(sellingRate)
                        ? sellingRate
                        : null,

                middle_rate:
                    Number.isFinite(middleRate)
                        ? middleRate
                        : null,

                date:
                    usd.rate.date ?? null,

                session:
                    data?.meta?.session ?? null,

                last_updated:
                    data?.meta?.last_updated ?? null,

                source:
                    'Bank Negara Malaysia'
            });

        } catch (error) {

            console.error(
                '[ai-obs] BNM USD/MYR ERROR:',
                error
            );

            return res.status(502).json({
                success: false,
                error:
                    'bnm_exchange_rate_unavailable',

                // Temporary diagnostic information
                details:
                    error?.message ?? String(error)
            });
        }
    }
);

// ============================================================
// 404 API HANDLER
// ============================================================

app.use(
    '/api',
    (_req, res) => {

        res.status(404).json({
            success: false,
            error: 'API endpoint not found'
        });
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
            `[ai-obs] AI observability API listening on http://localhost:${port}`
        );

        console.log(
            `[ai-obs] Default provider: ${DEFAULT_PROVIDER}`
        );

        console.log(
            `[ai-obs] Default product: ${DEFAULT_PRODUCT}`
        );

        console.log(
            `[ai-obs] SQLite: ${dbPath}`
        );

        console.log(
            '================================='
        );
    }
);