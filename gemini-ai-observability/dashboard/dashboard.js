// ============================================================
// AI OBSERVABILITY - MULTI-AI DASHBOARD
// DASHBOARD.JS
// ============================================================

// ============================================================
// CHART INSTANCES
// ============================================================

let employeeInteractionChart;
let providerInteractionChart;
let providerSessionChart;
let employeeAiChart;
let latencyChart;
let providerTokenChart;
let tokenTypeChart;

// ============================================================
// GLOBAL DATA
// ============================================================

let currentBnmRate = null;

// ============================================================
// AI PRODUCT CONFIGURATION
// ============================================================

const AI_PRODUCTS = {

    gemini: {
        name: 'Gemini',
        provider: 'Google',
        color: '#4285F4'
    },

    chatgpt: {
        name: 'ChatGPT',
        provider: 'OpenAI',
        color: '#10A37F'
    },

    claude: {
        name: 'Claude',
        provider: 'Anthropic',
        color: '#D97757'
    },

    copilot: {
        name: 'Copilot',
        provider: 'Microsoft',
        color: '#6366F1'
    },

    perplexity: {
        name: 'Perplexity',
        provider: 'Perplexity',
        color: '#20B8CD'
    },

    qwen: {
        name: 'Qwen',
        provider: 'Alibaba',
        color: '#FF6A00'
    }
};

// ============================================================
// PRICING
// ============================================================
//
// USD PER TOKEN
//
// ============================================================

const AI_PRICING = {

    gemini: {
        input: 0.0000001,
        output: 0.0000004
    },

    chatgpt: {
        input: 0.000005,
        output: 0.000015
    },

    claude: {
        input: 0.000003,
        output: 0.000015
    },

    copilot: {
        input: 0.000005,
        output: 0.000015
    },

    perplexity: {
        input: 0.000001,
        output: 0.000001
    },

    qwen: {
        input: 0.000000276,
        output: 0.000001101
    }
};

// ============================================================
// DEFAULT CHART COLOUR
// ============================================================

const DEFAULT_CHART_COLOR =
    '#64748B';

// ============================================================
// CHART OPTIONS
// ============================================================

const chartOptions = {

    responsive: true,

    maintainAspectRatio: false,

    animation: false,

    plugins: {

        legend: {
            display: true
        }

    },

    scales: {

        y: {
            beginAtZero: true
        }

    }

};

// ============================================================
// NUMBER FORMATTER
// ============================================================

function formatNumber(value) {

    const number =
        Number(value);

    if (!Number.isFinite(number)) {
        return '0';
    }

    return number.toLocaleString();
}

// ============================================================
// USD FORMATTER
// ============================================================

function formatUsd(value) {

    const number =
        Number(value);

    if (!Number.isFinite(number)) {
        return '$0.00';
    }

    return (
        '$' +
        number.toFixed(2)
    );
}

// ============================================================
// MYR FORMATTER
// ============================================================

function formatMyr(value) {

    const number =
        Number(value);

    if (!Number.isFinite(number)) {
        return 'RM0.00';
    }

    return (
        'RM' +
        number.toFixed(2)
    );
}

// ============================================================
// TOKEN VALUE
// ============================================================

function getTokenValue(row) {

    if (!row) {
        return 0;
    }

    return Number(
        row.total_tokens ??
        row.estimated_tokens ??
        row.tokens ??
        0
    ) || 0;
}

// ============================================================
// PROMPT TOKENS
// ============================================================

function getPromptTokens(row) {

    if (!row) {
        return 0;
    }

    return Number(
        row.prompt_tokens ??
        row.input_tokens ??
        0
    ) || 0;
}

// ============================================================
// RESPONSE TOKENS
// ============================================================

function getResponseTokens(row) {

    if (!row) {
        return 0;
    }

    return Number(
        row.response_tokens ??
        row.completion_tokens ??
        row.output_tokens ??
        0
    ) || 0;
}

// ============================================================
// PRODUCT COST
// ============================================================

function calculateCost(
    product,
    promptTokens,
    responseTokens
) {

    const key =
        String(
            product || ''
        ).toLowerCase();

    const pricing =
        AI_PRICING[key];

    if (!pricing) {
        return 0;
    }

    const inputTokens =
        Number(promptTokens) || 0;

    const outputTokens =
        Number(responseTokens) || 0;

    return (
        inputTokens *
        pricing.input
    ) + (
        outputTokens *
        pricing.output
    );
}

// ============================================================
// COST FOR ROW
// ============================================================

function getRowCost(row) {

    if (!row) {
        return 0;
    }

    const product =
        row.product ||
        row.ai_product;

    return calculateCost(
        product,
        getPromptTokens(row),
        getResponseTokens(row)
    );
}

// ============================================================
// TOTAL COST BY PRODUCT
// ============================================================

function calculateTotalUsdCost(products) {

    if (!Array.isArray(products)) {
        return 0;
    }

    return products.reduce(
        (
            total,
            row
        ) => {

            return (
                total +
                getRowCost(row)
            );

        },
        0
    );
}

// ============================================================
// GET PRODUCT COLOUR
// ============================================================

function getProductColor(product) {

    if (!product) {
        return DEFAULT_CHART_COLOR;
    }

    const key =
        String(product)
            .toLowerCase();

    if (AI_PRODUCTS[key]) {
        return AI_PRODUCTS[key].color;
    }

    return DEFAULT_CHART_COLOR;
}

// ============================================================
// GET PRODUCT COLOURS
// ============================================================

function getProductColors(products) {

    return products.map(
        product =>
            getProductColor(product)
    );
}

// ============================================================
// PRODUCT NAME
// ============================================================

function formatProductName(product) {

    if (!product) {
        return 'Unknown';
    }

    const key =
        String(product)
            .toLowerCase();

    if (AI_PRODUCTS[key]) {
        return AI_PRODUCTS[key].name;
    }

    return (
        String(product)
            .charAt(0)
            .toUpperCase()
        +
        String(product)
            .slice(1)
    );
}

// ============================================================
// LOAD BNM EXCHANGE RATE
// ============================================================

async function loadBnmExchangeRate() {

    try {

        const response =
            await fetch(
                '/api/exchange-rate'
            );

        if (!response.ok) {

            throw new Error(
                'BNM exchange-rate request failed'
            );
        }

        const data =
            await response.json();

        if (
            data.success &&
            Number(data.rate) > 0
        ) {

            currentBnmRate =
                Number(data.rate);

            updateExchangeRateDisplay();

            return currentBnmRate;
        }

        throw new Error(
            'Invalid BNM exchange-rate response'
        );

    } catch (error) {

        console.error(
            'BNM rate error:',
            error
        );

        currentBnmRate = null;

        updateExchangeRateDisplay();

        return null;
    }
}

// ============================================================
// EXCHANGE RATE DISPLAY
// ============================================================

function updateExchangeRateDisplay() {

    const rateElement =
        document.getElementById(
            'exchangeRate'
        );

    if (!rateElement) {
        return;
    }

    if (
        currentBnmRate !== null &&
        Number.isFinite(
            currentBnmRate
        )
    ) {

        rateElement.textContent =
            `1 USD = RM${currentBnmRate.toFixed(4)}`;

        return;
    }

    rateElement.textContent =
        'BNM rate unavailable';
}

// ============================================================
// UPDATE COST
// ============================================================

function updateCostDisplay(
    products
) {

    const usdCost =
        calculateTotalUsdCost(
            products
        );

    const myrCost =
        currentBnmRate !== null
            ? usdCost *
              currentBnmRate
            : null;

    const usdElement =
        document.getElementById(
            'estimatedCostUsd'
        );

    const myrElement =
        document.getElementById(
            'estimatedCostMyr'
        );

    if (usdElement) {

        usdElement.textContent =
            formatUsd(
                usdCost
            );
    }

    if (myrElement) {

        myrElement.textContent =
            myrCost !== null
                ? formatMyr(myrCost)
                : 'N/A';
    }

    const oldCostElement =
        document.getElementById(
            'estimatedCost'
        );

    if (oldCostElement) {

        oldCostElement.textContent =
            myrCost !== null
                ? formatMyr(myrCost)
                : formatUsd(usdCost);
    }

    return {
        usd: usdCost,
        myr: myrCost
    };
}

// ============================================================
// LOAD DASHBOARD
// ============================================================

async function loadDashboard() {

    try {

        const [

            summaryResponse,

            employeeResponse,

            providerResponse,

            productResponse,

            employeeProductResponse

        ] = await Promise.all([

            fetch(
                '/api/usage/summary'
            ),

            fetch(
                '/api/usage/by-employee'
            ),

            fetch(
                '/api/usage/by-provider'
            ),

            fetch(
                '/api/usage/by-product'
            ),

            fetch(
                '/api/usage/by-employee-product'
            )

        ]);

        if (
            !summaryResponse.ok ||
            !employeeResponse.ok ||
            !providerResponse.ok ||
            !productResponse.ok ||
            !employeeProductResponse.ok
        ) {

            throw new Error(
                'One or more API requests failed'
            );
        }

        const summary =
            await summaryResponse.json();

        const employees =
            await employeeResponse.json();

        const providers =
            await providerResponse.json();

        const products =
            await productResponse.json();

        const employeeProducts =
            await employeeProductResponse.json();

        updateMetrics(
            summary
        );

        updateCostDisplay(
            products
        );

        updateEmployeeCharts(
            employees
        );

        updateProviderCharts(
            providers
        );

        updateTokenChart(
            providers
        );

        updateEmployeeProductChart(
            employeeProducts
        );

        updateTable(
            employees
        );

        updateAIStatus(
            products
        );

        const lastUpdated =
            document.getElementById(
                'lastUpdated'
            );

        if (lastUpdated) {

            lastUpdated.textContent =
                new Date()
                    .toLocaleTimeString();
        }

    } catch (error) {

        console.error(
            'Dashboard loading failed:',
            error
        );
    }
}

// ============================================================
// KPI METRICS
// ============================================================

function updateMetrics(
    summary
) {

    const interactions =
        document.getElementById(
            'interactions'
        );

    if (interactions) {

        interactions.textContent =
            formatNumber(
                summary.interactions
            );
    }

    const sessions =
        document.getElementById(
            'sessions'
        );

    if (sessions) {

        sessions.textContent =
            formatNumber(
                summary.sessions
            );
    }

    const employees =
        document.getElementById(
            'employees'
        );

    if (employees) {

        employees.textContent =
            formatNumber(
                summary.active_employees
            );
    }

    const latency =
        document.getElementById(
            'latency'
        );

    if (latency) {

        latency.textContent =
            summary.avg_latency_ms != null

                ? `${Number(
                    summary.avg_latency_ms
                ).toFixed(0)} ms`

                : 'N/A';
    }

    const tokens =
        document.getElementById(
            'tokens'
        );

    if (tokens) {

        tokens.textContent =
            formatNumber(
                getTokenValue(
                    summary
                )
            );
    }
}

// ============================================================
// EMPLOYEE INTERACTIONS
// ============================================================

function updateEmployeeCharts(
    employees
) {

    if (!Array.isArray(employees)) {
        return;
    }

    const labels =
        employees.map(
            employee =>
                employee.email ||
                'Unknown'
        );

    const interactions =
        employees.map(
            employee =>
                Number(
                    employee.interactions
                ) || 0
        );

    const canvas =
        document.getElementById(
            'employeeInteractionChart'
        );

    if (!canvas) {
        return;
    }

    if (employeeInteractionChart) {

        employeeInteractionChart.data.labels =
            labels;

        employeeInteractionChart.data.datasets[0].data =
            interactions;

        employeeInteractionChart.update(
            'none'
        );

        return;
    }

    employeeInteractionChart =
        new Chart(
            canvas,
            {
                type: 'bar',

                data: {

                    labels,

                    datasets: [
                        {
                            label:
                                'Interactions',

                            data:
                                interactions,

                            backgroundColor:
                                '#6366F1',

                            borderColor:
                                '#6366F1',

                            borderWidth: 1
                        }
                    ]
                },

                options:
                    chartOptions
            }
        );
}

// ============================================================
// PROVIDER CHARTS
// ============================================================

function updateProviderCharts(
    providers
) {

    if (!Array.isArray(providers)) {
        return;
    }

    const labels =
        providers.map(
            provider =>
                formatProductName(
                    provider.product ||
                    provider.provider
                )
        );

    const products =
        providers.map(
            provider =>
                provider.product ||
                provider.provider
        );

    const interactions =
        providers.map(
            provider =>
                Number(
                    provider.interactions
                ) || 0
        );

    const sessions =
        providers.map(
            provider =>
                Number(
                    provider.sessions
                ) || 0
        );

    const latency =
        providers.map(
            provider =>
                Number(
                    provider.avg_latency_ms
                ) || 0
        );

    const colors =
        getProductColors(
            products
        );

    // --------------------------------------------------------
    // INTERACTIONS
    // --------------------------------------------------------

    const interactionCanvas =
        document.getElementById(
            'providerInteractionChart'
        );

    if (interactionCanvas) {

        if (providerInteractionChart) {

            providerInteractionChart.data.labels =
                labels;

            providerInteractionChart.data.datasets[0].data =
                interactions;

            providerInteractionChart.data.datasets[0].backgroundColor =
                colors;

            providerInteractionChart.data.datasets[0].borderColor =
                colors;

            providerInteractionChart.update(
                'none'
            );

        } else {

            providerInteractionChart =
                new Chart(
                    interactionCanvas,
                    {
                        type: 'bar',

                        data: {

                            labels,

                            datasets: [
                                {
                                    label:
                                        'Interactions',

                                    data:
                                        interactions,

                                    backgroundColor:
                                        colors,

                                    borderColor:
                                        colors,

                                    borderWidth: 1
                                }
                            ]
                        },

                        options:
                            chartOptions
                    }
                );
        }
    }

    // --------------------------------------------------------
    // SESSIONS
    // --------------------------------------------------------

    const sessionCanvas =
        document.getElementById(
            'providerSessionChart'
        );

    if (sessionCanvas) {

        if (providerSessionChart) {

            providerSessionChart.data.labels =
                labels;

            providerSessionChart.data.datasets[0].data =
                sessions;

            providerSessionChart.data.datasets[0].backgroundColor =
                colors;

            providerSessionChart.data.datasets[0].borderColor =
                colors;

            providerSessionChart.update(
                'none'
            );

        } else {

            providerSessionChart =
                new Chart(
                    sessionCanvas,
                    {
                        type: 'bar',

                        data: {

                            labels,

                            datasets: [
                                {
                                    label:
                                        'Sessions',

                                    data:
                                        sessions,

                                    backgroundColor:
                                        colors,

                                    borderColor:
                                        colors,

                                    borderWidth: 1
                                }
                            ]
                        },

                        options:
                            chartOptions
                    }
                );
        }
    }

    // --------------------------------------------------------
    // LATENCY
    // --------------------------------------------------------

    const latencyCanvas =
        document.getElementById(
            'latencyChart'
        );

    if (latencyCanvas) {

        if (latencyChart) {

            latencyChart.data.labels =
                labels;

            latencyChart.data.datasets[0].data =
                latency;

            latencyChart.data.datasets[0].backgroundColor =
                colors;

            latencyChart.data.datasets[0].borderColor =
                colors;

            latencyChart.update(
                'none'
            );

        } else {

            latencyChart =
                new Chart(
                    latencyCanvas,
                    {
                        type: 'bar',

                        data: {

                            labels,

                            datasets: [
                                {
                                    label:
                                        'Average Latency (ms)',

                                    data:
                                        latency,

                                    backgroundColor:
                                        colors,

                                    borderColor:
                                        colors,

                                    borderWidth: 1
                                }
                            ]
                        },

                        options:
                            chartOptions
                    }
                );
        }
    }
}

// ============================================================
// TOKEN USAGE
// ============================================================

function updateTokenChart(
    providers
) {

    if (!Array.isArray(providers)) {
        return;
    }

    const canvas =
        document.getElementById(
            'providerTokenChart'
        );

    if (!canvas) {
        return;
    }

    const labels =
        providers.map(
            provider =>
                formatProductName(
                    provider.product ||
                    provider.provider
                )
        );

    const products =
        providers.map(
            provider =>
                provider.product ||
                provider.provider
        );

    const tokens =
        providers.map(
            provider =>
                getTokenValue(
                    provider
                )
        );

    const colors =
        getProductColors(
            products
        );

    if (providerTokenChart) {

        providerTokenChart.data.labels =
            labels;

        providerTokenChart.data.datasets[0].data =
            tokens;

        providerTokenChart.data.datasets[0].backgroundColor =
            colors;

        providerTokenChart.data.datasets[0].borderColor =
            colors;

        providerTokenChart.update(
            'none'
        );

        return;
    }

    providerTokenChart =
        new Chart(
            canvas,
            {
                type: 'bar',

                data: {

                    labels,

                    datasets: [
                        {
                            label:
                                'Estimated Tokens',

                            data:
                                tokens,

                            backgroundColor:
                                colors,

                            borderColor:
                                colors,

                            borderWidth: 1
                        }
                    ]
                },

                options: {

                    ...chartOptions,

                    plugins: {

                        ...chartOptions.plugins,

                        tooltip: {

                            callbacks: {

                                label:
                                    context =>
                                        'Estimated Tokens: ' +
                                        formatNumber(
                                            context.raw
                                        )
                            }
                        }
                    }
                }
            }
        );
}

// ============================================================
// EMPLOYEE × AI PRODUCT
// ============================================================

function updateEmployeeProductChart(
    employeeProducts
) {

    if (!Array.isArray(employeeProducts)) {
        return;
    }

    const canvas =
        document.getElementById(
            'employeeAiChart'
        );

    if (!canvas) {
        return;
    }

    const employees = [
        ...new Set(
            employeeProducts.map(
                row =>
                    row.email
            )
        )
    ];

    const products = [
        ...new Set(
            employeeProducts.map(
                row =>
                    row.product
            )
        )
    ];

    const datasets =
        products.map(
            product => {

                const color =
                    getProductColor(
                        product
                    );

                return {

                    label:
                        formatProductName(
                            product
                        ),

                    data:
                        employees.map(
                            email => {

                                const row =
                                    employeeProducts.find(
                                        item =>
                                            item.email ===
                                                email &&
                                            item.product ===
                                                product
                                    );

                                return row
                                    ? Number(
                                        row.interactions
                                    ) || 0
                                    : 0;
                            }
                        ),

                    backgroundColor:
                        color,

                    borderColor:
                        color,

                    borderWidth: 1
                };
            }
        );

    if (employeeAiChart) {

        employeeAiChart.data.labels =
            employees;

        employeeAiChart.data.datasets =
            datasets;

        employeeAiChart.update(
            'none'
        );

        return;
    }

    employeeAiChart =
        new Chart(
            canvas,
            {
                type: 'bar',

                data: {

                    labels:
                        employees,

                    datasets:
                        datasets
                },

                options: {

                    ...chartOptions,

                    scales: {

                        x: {
                            stacked: true
                        },

                        y: {

                            beginAtZero:
                                true,

                            stacked:
                                true
                        }
                    }
                }
            }
        );
}

// ============================================================
// EMPLOYEE TABLE
// ============================================================

function updateTable(
    employees
) {

    const table =
        document.getElementById(
            'employeeTable'
        );

    if (!table) {
        return;
    }

    table.innerHTML = '';

    employees.forEach(
        employee => {

            const row =
                document.createElement(
                    'tr'
                );

            const gemini =
                Number(
                    employee.gemini
                ) || 0;

            const chatgpt =
                Number(
                    employee.chatgpt
                ) || 0;

            const claude =
                Number(
                    employee.claude
                ) || 0;

            const copilot =
                Number(
                    employee.copilot
                ) || 0;

            const perplexity =
                Number(
                    employee.perplexity
                ) || 0;

            const qwen =
                Number(
                    employee.qwen
                ) || 0;

            const total =
                Number(
                    employee.interactions
                ) ||
                (
                    gemini +
                    chatgpt +
                    claude +
                    copilot +
                    perplexity +
                    qwen
                );

            const totalTokens =
                getTokenValue(
                    employee
                );

            row.innerHTML = `

                <td>
                    ${employee.email || '-'}
                </td>

                <td>
                    ${employee.department || '-'}
                </td>

                <td>
                    ${formatNumber(gemini)}
                </td>

                <td>
                    ${formatNumber(chatgpt)}
                </td>

                <td>
                    ${formatNumber(claude)}
                </td>

                <td>
                    ${formatNumber(copilot)}
                </td>

                <td>
                    ${formatNumber(perplexity)}
                </td>

                <td>
                    ${formatNumber(qwen)}
                </td>

                <td>
                    ${formatNumber(total)}
                </td>

                <td>
                    ${formatNumber(
                        employee.sessions
                    )}
                </td>

                <td>
                    ${
                        employee.avg_latency_ms != null
                            ? Number(
                                employee.avg_latency_ms
                            ).toFixed(0) +
                              ' ms'
                            : 'N/A'
                    }
                </td>

                <td>
                    ${formatNumber(
                        totalTokens
                    )}
                </td>
            `;

            table.appendChild(
                row
            );
        }
    );
}

// ============================================================
// AI STATUS
// ============================================================

function updateAIStatus(
    products
) {

    const status =
        document.querySelector(
            '.status'
        );

    if (!status) {
        return;
    }

    if (!Array.isArray(products)) {
        return;
    }

    const activeProducts =
        products.filter(
            product =>
                Number(
                    product.interactions
                ) > 0
        );

    status.innerHTML = `

        <span
            class="status-dot"
        ></span>

        ${activeProducts.length}

        AI

        ${
            activeProducts.length === 1
                ? 'Product'
                : 'Products'
        }

        Connected
    `;
}

// ============================================================
// INITIAL LOAD
// ============================================================

async function initializeDashboard() {

    await loadBnmExchangeRate();

    await loadDashboard();
}

initializeDashboard();

// ============================================================
// AUTO REFRESH
// ============================================================
//
// Refresh dashboard every 5 seconds.
//
// BNM itself is cached on the server for 15 minutes,
// so this does NOT request BNM every 5 seconds.
//
// ============================================================

setInterval(
    loadDashboard,
    5000
);

// Refresh BNM rate every 15 minutes.

setInterval(
    loadBnmExchangeRate,
    15 * 60 * 1000
);