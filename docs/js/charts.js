window.clearCharts = function () {
    destroyChartInstance(0, 'hourly');
    destroyChartInstance(1, 'hourly');
    destroyChartInstance(0, 'daily');
    destroyChartInstance(1, 'daily');

    document.getElementById('hourlyDir0Container').style.display = 'none';
    document.getElementById('hourlyDir1Container').style.display = 'none';
    document.getElementById('dailyDir0Container').style.display = 'none';
    document.getElementById('dailyDir1Container').style.display = 'none';
    showChartArea(false);
};

window.renderCharts = async function (routeId, stopId) {
    const chartArea = document.getElementById('chart-area');
    if (!chartArea) return;
    chartArea.style.display = 'grid';

    const [dir0, dir1] = await Promise.all([
        fetchDelaySamples(routeId, 0, stopId),
        fetchDelaySamples(routeId, 1, stopId),
    ]);

    renderChartsForDirection(dir0, 'hourlyDelayChartDir0', 'dailyDelayChartDir0', 'hourlyDir0Container', 'dailyDir0Container', 0);
    renderChartsForDirection(dir1, 'hourlyDelayChartDir1', 'dailyDelayChartDir1', 'hourlyDir1Container', 'dailyDir1Container', 1);

    if ((!dir0 || dir0.length === 0) && (!dir1 || dir1.length === 0)) {
        chartArea.style.display = 'none';
    }
};

async function fetchDelaySamples(routeId, directionId, stopId) {
    const url = `${window.ROUTE_DIR_STOP_DELAY_BASE}/${routeId}/${directionId}/${stopId}.json`;
    const data = await safeFetchJson(url);
    if (!data) return [];
    return data.map(([t, d]) => ({ t: new Date(t * 1000), delay: -d }));
}

function renderChartsForDirection(samples, hourlyCanvasId, dailyCanvasId, hourlyContainerId, dailyContainerId, dirKey) {
    const hourlyContainer = document.getElementById(hourlyContainerId);
    const dailyContainer = document.getElementById(dailyContainerId);
    if (!hourlyContainer || !dailyContainer) return;

    if (!samples || samples.length === 0) {
        hourlyContainer.style.display = 'none';
        dailyContainer.style.display = 'none';
        destroyChartInstance(dirKey, 'hourly');
        destroyChartInstance(dirKey, 'daily');
        return;
    }

    const clippedSamples = samples.map(({ t, delay }) => ({
        t,
        delay: Math.max(-2000, Math.min(2000, delay)),
    }));

    const hourly = aggregateByHour(clippedSamples);
    const daily = aggregateByDay(clippedSamples);

    hourlyContainer.style.display = 'block';
    dailyContainer.style.display = 'block';

    destroyChartInstance(dirKey, 'hourly');
    destroyChartInstance(dirKey, 'daily');

    if (hourly.labels.length > 0) {
        window.hourlyCharts[dirKey] = renderLineChartWithBand(
            hourlyCanvasId,
            hourly.labels,
            hourly.median,
            hourly.mad,
            'Median delay'
        );
    }

    if (daily.labels.length > 0) {
        window.dailyCharts[dirKey] = renderLineChartWithBand(
            dailyCanvasId,
            daily.labels,
            daily.median,
            daily.mad,
            'Median delay'
        );
    }
}

function destroyChartInstance(dirKey, type) {
    if (type === 'hourly' && window.hourlyCharts[dirKey]) {
        window.hourlyCharts[dirKey].destroy();
        window.hourlyCharts[dirKey] = null;
    }
    if (type === 'daily' && window.dailyCharts[dirKey]) {
        window.dailyCharts[dirKey].destroy();
        window.dailyCharts[dirKey] = null;
    }
}

function renderLineChartWithBand(canvasId, labels, seriesVals, bandVals, label) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');

    const upper = seriesVals.map((v, i) => (v != null && bandVals[i] != null ? v + bandVals[i] : null));
    const lower = seriesVals.map((v, i) => (v != null && bandVals[i] != null ? v - bandVals[i] : null));

    const validVals = seriesVals.filter((v) => v != null && isFinite(v));
    let yMin = validVals.length ? Math.min(...validVals) : undefined;
    let yMax = validVals.length ? Math.max(...validVals) : undefined;
    if (yMin != null && yMin < -2000) yMin = -2000;
    if (yMax != null && yMax > 2000) yMax = 2000;

    return new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label,
                    data: seriesVals,
                    borderWidth: 2,
                    pointRadius: 3,
                    fill: false,
                    tension: 0.25,
                    borderColor: '#3498db',
                    backgroundColor: '#3498db',
                },
                {
                    label: 'Lower',
                    data: lower,
                    borderWidth: 0,
                    pointRadius: 0,
                    fill: false,
                    tension: 0.25,
                },
                {
                    label: 'MAD band',
                    data: upper,
                    borderWidth: 0,
                    pointRadius: 0,
                    fill: '-1',
                    tension: 0.25,
                    backgroundColor: 'rgba(231, 76, 60, 0.22)',
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        filter: (item) => item.datasetIndex === 0,
                    },
                },
            },
            scales: {
                x: {
                    ticks: {
                        maxRotation: 45,
                        minRotation: 45,
                        autoSkip: true,
                        maxTicksLimit: 8,
                    },
                    title: {
                        display: true,
                        text: labels.length && typeof labels[0] === 'string' && labels[0].includes(':') ? 'Hour of day' : 'Date',
                    },
                },
                y: {
                    title: { display: true, text: 'Delay (sec)' },
                    suggestedMin: yMin,
                    suggestedMax: yMax,
                },
            },
        },
    });
}
