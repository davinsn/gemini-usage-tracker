let interactionChart;
let sessionChart;
let latencyChart;


async function loadDashboard() {

    try {

        const [
            summaryResponse,
            employeeResponse
        ] = await Promise.all([

            fetch('/api/usage/summary'),

            fetch('/api/usage/by-employee')

        ]);


        const summary = await summaryResponse.json();
        const employees = await employeeResponse.json();


        console.log('Summary:', summary);
        console.log('Employees:', employees);


        updateMetrics(summary);

        updateCharts(employees);

        updateTable(employees);


    } catch (error) {

        console.error(
            'Dashboard loading failed:',
            error
        );

    }

}


/* ============================================================
   METRICS
============================================================ */

function updateMetrics(summary) {

    document.getElementById('interactions')
        .textContent =
        summary.interactions ?? 0;


    document.getElementById('sessions')
        .textContent =
        summary.sessions ?? 0;


    document.getElementById('employees')
        .textContent =
        summary.active_employees ?? 0;


    document.getElementById('latency')
        .textContent =
        summary.avg_latency_ms != null
            ? `${summary.avg_latency_ms} ms`
            : 'N/A';

}


/* ============================================================
   CHARTS
============================================================ */

function updateCharts(employees) {

    const labels =
        employees.map(
            employee => employee.email
        );


    const interactions =
        employees.map(
            employee => employee.interactions || 0
        );


    const sessions =
        employees.map(
            employee => employee.sessions || 0
        );


    const latency =
        employees.map(
            employee => employee.avg_latency_ms || 0
        );


    /* INTERACTIONS */

    if (interactionChart) {
        interactionChart.destroy();
    }

    interactionChart =
        new Chart(
            document.getElementById(
                'interactionChart'
            ),
            {
                type: 'bar',

                data: {

                    labels,

                    datasets: [{
                        label: 'Interactions',
                        data: interactions
                    }]

                },

                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                            legend: {
                            display: true
                        }
                    }
                }

            }
        );


    /* SESSIONS */

    if (sessionChart) {
        sessionChart.destroy();
    }

    sessionChart =
        new Chart(
            document.getElementById(
                'sessionChart'
            ),
            {
                type: 'bar',

                data: {

                    labels,

                    datasets: [{
                        label: 'Sessions',
                        data: sessions
                    }]

                },

                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                            legend: {
                            display: true
                        }
                    }
                }

            }
        );


    /* LATENCY */

    if (latencyChart) {
        latencyChart.destroy();
    }

    latencyChart =
        new Chart(
            document.getElementById(
                'latencyChart'
            ),
            {
                type: 'line',

                data: {

                    labels,

                    datasets: [{
                        label: 'Average latency (ms)',
                        data: latency,
                        tension: 0.3
                    }]

                },

                options: {
                    responsive: true,
                    maintainAspectRatio: false,

                        plugins: {
                            legend: {
                            display: true
                        }
                    }
                }

            }
        );

}


/* ============================================================
   TABLE
============================================================ */

function updateTable(employees) {

    const table =
        document.getElementById(
            'employeeTable'
        );


    table.innerHTML = '';


    employees.forEach(employee => {

        const row =
            document.createElement('tr');


        row.innerHTML = `

            <td>${employee.email}</td>

            <td>
                ${employee.department || '-'}
            </td>

            <td>
                ${employee.interactions || 0}
            </td>

            <td>
                ${employee.sessions || 0}
            </td>

            <td>
                ${
                    employee.avg_latency_ms != null
                        ? employee.avg_latency_ms + ' ms'
                        : 'N/A'
                }
            </td>

        `;


        table.appendChild(row);

    });

}


/* ============================================================
   INITIAL LOAD
============================================================ */

loadDashboard();


/* ============================================================
   AUTO REFRESH
============================================================ */

setInterval(
    loadDashboard,
    5000
);