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
// DEMO MODE
// ============================================================

// Demo mode ONLY changes displayed cost.
// It does NOT change token counts, interactions,
// sessions, latency, or database values.

let demoMode = false;

let demoCostMultiplier = 100;

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
// USD PER TOKEN
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
        input: 0.000000375,
        output: 0.00000225
    }

};

// ============================================================
// DEMO MODE
// ============================================================

// Set to true to enable inflated/demo cost values.
const DEMO_MODE = true;

// Multiplier applied ONLY to displayed cost.
// Example:
// 1    = normal cost
// 10   = 10x cost
// 100  = 100x cost
// 1000 = 1000x cost
const DEMO_COST_MULTIPLIER = 100;


// ============================================================
// COST DISPLAY CALCULATION
// ============================================================

function applyDemoCostMultiplier(cost) {
    const numericCost = Number(cost) || 0;

    if (!DEMO_MODE) {
        return numericCost;
    }

    return numericCost * DEMO_COST_MULTIPLIER;
}

// ============================================================
// DEFAULT CHART COLOUR
// ============================================================

const DEFAULT_CHART_COLOR = '#64748B';

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

    const number = Number(value);

    if (!Number.isFinite(number)) {
        return '0';
    }

    return number.toLocaleString();

}

// ============================================================
// USD FORMATTER
// ============================================================

function formatUsd(value) {

    const number = Number(value);

    if (!Number.isFinite(number)) {
        return '$0.00';
    }

    return '$' + number.toFixed(2);

}

// ============================================================
// MYR FORMATTER
// ============================================================

function formatMyr(value) {

    const number = Number(value);

    if (!Number.isFinite(number)) {
        return 'RM0.00';
    }

    return 'RM' + number.toFixed(2);

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
        String(product || '').toLowerCase();

    const pricing =
        AI_PRICING[key];

    if (!pricing) {
        return 0;
    }

    const inputTokens =
        Number(promptTokens) || 0;

    const outputTokens =
        Number(responseTokens) || 0;

    // --------------------------------------------------------
    // REAL COST
    // --------------------------------------------------------

    const baseCost =

        (
            inputTokens *
            pricing.input
        )

        +

        (
            outputTokens *
            pricing.output
        );

    // --------------------------------------------------------
    // DEMO MODE
    // --------------------------------------------------------
    // Only the displayed cost is multiplied.
    // Actual token values remain untouched.
    // --------------------------------------------------------

    if (demoMode) {
        return baseCost * demoCostMultiplier;
    }

    return baseCost;

}

// ============================================================
// REAL / BASE PRODUCT COST
// ============================================================
// This function intentionally ignores Demo Mode.
// Useful for showing the original cost if needed.
// ============================================================

function calculateBaseCost(
    product,
    promptTokens,
    responseTokens
) {

    const key =
        String(product || '').toLowerCase();

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
// BASE COST FOR ROW
// ============================================================

function getBaseRowCost(row) {

    if (!row) {
        return 0;
    }

    const product =
        row.product ||
        row.ai_product;

    return calculateBaseCost(

        product,

        getPromptTokens(row),

        getResponseTokens(row)

    );

}

// ============================================================
// TOTAL COST
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
// COST BREAKDOWN BY AI
// ============================================================

function calculateCostBreakdown(products) {

    const breakdown = {};

    // Initialise all configured AI products.
    Object.keys(AI_PRODUCTS).forEach(
        product => {

            breakdown[product] = {

                product: product,

                name:
                    AI_PRODUCTS[product].name,

                color:
                    AI_PRODUCTS[product].color,

                usd: 0,

                baseUsd: 0,

                myr: 0,

                interactions: 0,

                promptTokens: 0,

                responseTokens: 0,

                totalTokens: 0

            };

        }
    );

    if (!Array.isArray(products)) {
        return breakdown;
    }

    products.forEach(row => {

        const product = String(

            row.product ||
            row.ai_product ||
            ''

        ).toLowerCase();

        if (!breakdown[product]) {
            return;
        }

        const promptTokens =
            getPromptTokens(row);

        const responseTokens =
            getResponseTokens(row);

        const totalTokens =
            getTokenValue(row);

        const cost =
            getRowCost(row);

        const baseCost =
            getBaseRowCost(row);

        breakdown[product].usd += cost;

        breakdown[product].baseUsd += baseCost;

        breakdown[product].promptTokens +=
            promptTokens;

        breakdown[product].responseTokens +=
            responseTokens;

        breakdown[product].totalTokens +=
            totalTokens;

        breakdown[product].interactions +=
            Number(row.interactions) || 0;

    });

    // Calculate MYR values.
    Object.values(breakdown).forEach(item => {

        if (currentBnmRate !== null) {

            item.myr =
                item.usd *
                currentBnmRate;

        }

    });

    return breakdown;

}

// ============================================================
// GET PRODUCT COLOUR
// ============================================================

function getProductColor(product) {

    if (!product) {
        return DEFAULT_CHART_COLOR;
    }

    const key =
        String(product).toLowerCase();

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
        String(product).toLowerCase();

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

        const response = await fetch(
            '/api/exchange-rate/usd-myr'
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

            Number(data.middle_rate) > 0

        ) {

            currentBnmRate =
                Number(data.middle_rate);

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
// DEMO MODE DISPLAY
// ============================================================

function updateDemoModeDisplay() {

    const indicator =
        document.getElementById(
            'demoModeIndicator'
        );

    if (!indicator) {
        return;
    }

    if (demoMode) {

        indicator.style.display =
            'inline-flex';

        indicator.textContent =
            `DEMO MODE — COST ×${formatNumber(
                demoCostMultiplier
            )}`;

    } else {

        indicator.style.display =
            'none';

        indicator.textContent = '';

    }

}

// ============================================================
// UPDATE COST
// ============================================================

function updateCostDisplay(products) {

    // Calculate the actual token-based cost first.
    const actualUsdCost =
        calculateTotalUsdCost(products);

    // Apply demo multiplier only to what is displayed.
    const displayedUsdCost =
        applyDemoCostMultiplier(actualUsdCost);

    const myrCost =
        currentBnmRate !== null
            ? displayedUsdCost * currentBnmRate
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
            formatUsd(displayedUsdCost);
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
                : formatUsd(displayedUsdCost);
    }

    // --------------------------------------------------------
    // DEMO MODE INDICATOR
    // --------------------------------------------------------

    const demoIndicator =
        document.getElementById(
            'demoModeIndicator'
        );

    if (demoIndicator) {

        if (DEMO_MODE) {

            demoIndicator.style.display =
                'inline-flex';

            demoIndicator.textContent =
                `DEMO MODE • ${DEMO_COST_MULTIPLIER}×`;

        } else {

            demoIndicator.style.display =
                'none';
        }
    }

    return {
        actualUsd: actualUsdCost,
        displayedUsd: displayedUsdCost,
        myr: myrCost,
        demoMode: DEMO_MODE,
        multiplier: DEMO_COST_MULTIPLIER
    };
}

// ============================================================
// COST BREAKDOWN TABLE
// ============================================================

function updateCostBreakdown(products) {

    const container =
        document.getElementById(
            'costBreakdown'
        );

    if (!container) {
        return;
    }

    const breakdown =
        calculateCostBreakdown(
            products
        );

    const items =
        Object.values(breakdown);

    const totalUsd =
        items.reduce(
            (sum, item) =>
                sum + item.usd,
            0
        );

    let html = '';

    html += `

        <div class="cost-breakdown-header">

            <div>

                <h3>
                    AI Cost Breakdown
                </h3>

                <p>
                    Estimated cost by AI product
                </p>

            </div>

            ${
                demoMode

                    ? `

                    <span
                        id="costDemoBadge"
                        class="demo-cost-badge"
                    >
                        DEMO ×${formatNumber(
                            demoCostMultiplier
                        )}
                    </span>

                    `

                    : ''

            }

        </div>

        <div class="cost-breakdown-table-wrapper">

            <table class="cost-breakdown-table">

                <thead>

                    <tr>

                        <th>AI</th>

                        <th>Interactions</th>

                        <th>Tokens</th>

                        <th>USD</th>

                        <th>MYR</th>

                        <th>% of Total</th>

                    </tr>

                </thead>

                <tbody>

    `;

    items.forEach(item => {

        if (

            item.usd === 0 &&

            item.interactions === 0 &&

            item.totalTokens === 0

        ) {

            return;

        }

        const percentage =

            totalUsd > 0

                ? (

                    item.usd /
                    totalUsd
                ) * 100

                : 0;

        html += `

            <tr>

                <td>

                    <div
                        class="cost-product-name"
                    >

                        <span
                            class="cost-product-dot"
                            style="
                                background-color:
                                ${item.color};
                            "
                        ></span>

                        <strong>
                            ${item.name}
                        </strong>

                    </div>

                </td>

                <td>
                    ${formatNumber(
                        item.interactions
                    )}
                </td>

                <td>
                    ${formatNumber(
                        item.totalTokens
                    )}
                </td>

                <td>
                    ${formatUsd(
                        item.usd
                    )}
                </td>

                <td>
                    ${
                        currentBnmRate !== null

                            ? formatMyr(item.myr)

                            : 'N/A'
                    }
                </td>

                <td>
                    ${percentage.toFixed(1)}%
                </td>

            </tr>

        `;

    });

    html += `

                </tbody>

                <tfoot>

                    <tr>

                        <td>
                            <strong>Total</strong>
                        </td>

                        <td>
                            -
                        </td>

                        <td>
                            -
                        </td>

                        <td>
                            <strong>
                                ${formatUsd(totalUsd)}
                            </strong>
                        </td>

                        <td>

                            <strong>

                                ${
                                    currentBnmRate !== null

                                        ? formatMyr(
                                            totalUsd *
                                            currentBnmRate
                                        )

                                        : 'N/A'
                                }

                            </strong>

                        </td>

                        <td>
                            <strong>100%</strong>
                        </td>

                    </tr>

                </tfoot>

            </table>

        </div>

    `;

    if (demoMode) {

        html += `

            <div class="demo-cost-note">

                Demo Mode is enabled.
                Costs shown above are multiplied by
                ×${formatNumber(demoCostMultiplier)}
                for demonstration purposes.
                Actual token usage is unchanged.

            </div>

        `;

    }

    container.innerHTML = html;

}

// ============================================================
// DEMO MODE CONTROLS
// ============================================================

function initializeDemoMode() {

    const toggle =
        document.getElementById(
            'demoModeToggle'
        );

    const multiplier =
        document.getElementById(
            'demoCostMultiplier'
        );

    if (!toggle) {
        return;
    }

    toggle.checked =
        demoMode;

    if (multiplier) {

        multiplier.value =
            String(
                demoCostMultiplier
            );

        multiplier.addEventListener(
            'change',
            () => {

                const value =
                    Number(
                        multiplier.value
                    );

                demoCostMultiplier =
                    Number.isFinite(value) &&
                    value > 0

                        ? value

                        : 1;

                updateDemoModeDisplay();

                loadDashboard();

            }
        );

    }

    toggle.addEventListener(
        'change',
        () => {

            demoMode =
                toggle.checked;

            updateDemoModeDisplay();

            loadDashboard();

        }
    );

    updateDemoModeDisplay();

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

        // ----------------------------------------------------
        // UPDATE DASHBOARD
        // ----------------------------------------------------

        updateMetrics(
            summary
        );

        updateCostDisplay(
            products
        );

        updateCostBreakdown(
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

function updateMetrics(summary) {

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

function updateEmployeeCharts(employees) {

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

function updateProviderCharts(providers) {

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

function updateTokenChart(providers) {

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
                                            email

                                            &&

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

function updateTable(employees) {

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

function updateAIStatus(products) {

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

    initializeDemoMode();

    await loadBnmExchangeRate();

    await loadDashboard();

}

initializeDashboard();

// ============================================================
// AUTO REFRESH
// ============================================================

// Refresh dashboard every 5 seconds.
//
// BNM itself is cached on the server for 15 minutes,
// so this does NOT request BNM every 5 seconds.

setInterval(
    loadDashboard,
    5000
);

// Refresh BNM rate every 15 minutes.

setInterval(
    loadBnmExchangeRate,
    15 * 60 * 1000
);