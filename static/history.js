let chart = null;
let lastData = [];

/**
 * Updates the clock display in the header
 */
function updateDateTimeDisplay() {
    const now = new Date();
    const dateOptions = { year: 'numeric', month: '2-digit', day: '2-digit' };
    const timeOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };

    const formattedDate = now.toLocaleDateString('ja-JP', dateOptions);
    const formattedTime = now.toLocaleTimeString('ja-JP', timeOptions);

    const dateElement = document.getElementById('current-date');
    const timeElement = document.getElementById('current-time');

    if (dateElement) dateElement.textContent = `日付: ${formattedDate}`;
    if (timeElement) timeElement.textContent = `時間: ${formattedTime}`;
}
setInterval(updateDateTimeDisplay, 1000);
updateDateTimeDisplay();

/**
 * Loads data based on the current picker values
 */
function loadHistoryDataFromPickers() {
    const startDate = document.getElementById('start-date-picker').value;
    const endDate = document.getElementById('end-date-picker').value;
    if (startDate && endDate) {
        window.loadHistoryData(startDate, endDate);
    }
}

/**
 * Initial Page Load Setup
 */
document.addEventListener('DOMContentLoaded', function() {
    const now = new Date();
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);

    // Use sv-SE for YYYY-MM-DD format
    const todayStr = now.toLocaleDateString('sv-SE');
    const yesterdayStr = yesterday.toLocaleDateString('sv-SE');

    // Initialize Flatpickr with 24h range (Yesterday to Today)
    flatpickr("#start-date-picker", {
        defaultDate: yesterdayStr,
        dateFormat: "Y-m-d"
    });
    flatpickr("#end-date-picker", {
        defaultDate: todayStr,
        dateFormat: "Y-m-d"
    });

    // wire load button
    document.getElementById('load-range').addEventListener('click', loadHistoryDataFromPickers);

    // Initial fetch (default 24h)
    window.loadHistoryData(yesterdayStr, todayStr);
});

/**
 * Core function to fetch data and render/update the chart
 */
window.loadHistoryData = async function(startDate, endDate) {
    const ctx = document.getElementById('pressure-history-graph').getContext('2d');

    try {
        // Fetch with cache-buster
        const res = await fetch(`/api/history?start_date=${startDate}&end_date=${endDate}&_=${new Date().getTime()}`);
        if (!res.ok) {
            const text = await res.text();
            console.error('history API returned', res.status, text);
            throw new Error('データ取得失敗');
        }
        
        const rawData = await res.json();
        lastData = rawData;
        
        // update chart title text to show range in human format
        const formattedStart = (new Date(startDate)).toLocaleDateString('ja-JP');
        const formattedEnd = (new Date(endDate)).toLocaleDateString('ja-JP');
        const rangeText = `${formattedStart} ～ ${formattedEnd}`;

        // 1. DATA THINNING: Fixes the crowded "vertical lines" issue
        // We only want to plot about 600 points max for readability

        // 1. DATA THINNING: Fixes the crowded "vertical lines" issue
        // We only want to plot about 600 points max for readability
        let displayData = rawData;
        const maxPoints = 600;
        if (displayData.length > maxPoints) {
            const step = Math.ceil(displayData.length / maxPoints);
            displayData = displayData.filter((_, index) => index % step === 0);
        }

        // 3. Prepare Chart.js Arrays
        const labels = displayData.map(entry => {
            const d = new Date(entry.timestamp);
            // If viewing multiple days, show the date too
            const dateStr = (startDate !== endDate) ? 
                d.toLocaleDateString('ja-JP', {month: '2-digit', day: '2-digit'}) + ' ' : '';
            return dateStr + d.toLocaleTimeString('ja-JP', {hour: '2-digit', minute: '2-digit'});
        });

        const frontData = displayData.map(entry => entry.front_pressure);
        const rearData = displayData.map(entry => entry.rear_pressure);

        // 4. Create or Update Chart
        if (chart) chart.destroy();

        chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: '前圧力 (Front)',
                        data: frontData,
                        borderColor: '#2ecc71',
                        backgroundColor: 'rgba(46,204,113,0.1)',
                        borderWidth: 2,
                        pointRadius: 1, // Smaller points make the chart look cleaner
                        tension: 0.1,
                        spanGaps: true
                    },
                    {
                        label: '後圧力 (Rear)',
                        data: rearData,
                        borderColor: '#3498db',
                        backgroundColor: 'rgba(52,152,219,0.1)',
                        borderWidth: 2,
                        pointRadius: 1,
                        tension: 0.1,
                        spanGaps: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    title: { display: true, text: `範囲: ${rangeText}` },
                    legend: { display: true },
                    zoom: {
                        pan: { enabled: true, mode: 'x', threshold: 5 },
                        zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' },
                        limits: { x: { min: 'original', max: 'original' } }
                    },
                    annotation: {
                        annotations: {
                            lowLine: { type: 'line', yMin: 0.125, yMax: 0.125, borderColor: 'orange', borderDash: [6, 6] },
                            idleLine: { type: 'line', yMin: 0.029, yMax: 0.029, borderColor: 'grey', borderDash: [6, 6] }
                        }
                    }
                },
                scales: {
                    x: { 
                        title: { display: true, text: '時刻' },
                        ticks: { autoSkip: true, maxRotation: 0 } 
                    },
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: '圧力 (MPa)' },
                        min: 0,
                        max: 0.25
                    }
                }
            }
        });

    } catch (err) {
        console.error(err);
        alert('履歴データの取得に失敗しました');
    }
};

// Reset Zoom
document.getElementById('reset-zoom').addEventListener('click', () => {
    if (chart) chart.resetZoom();
});

// CSV Download
document.getElementById('download-csv').addEventListener('click', function() {
    if (!lastData.length) {
        alert('データがありません');
        return;
    }
    const startDate = document.getElementById('start-date-picker').value;
    const endDate = document.getElementById('end-date-picker').value;
    
    let csv = 'timestamp,front_pressure,rear_pressure\n';
    lastData.forEach(entry => {
        csv += `${entry.timestamp},${entry.front_pressure},${entry.rear_pressure}\n`;
    });
    
    const blob = new Blob([csv], {type: 'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pressure_history_${startDate}_to_${endDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});
