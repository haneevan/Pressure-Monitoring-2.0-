// --- 1. Constants and Globals ---
const REALTIME_API = '/api/realtime';
const HOURLY_AVERAGE_API = '/api/average/hour';
const MINUTES_AVERAGE_API = '/api/average/minute';
const REALTIME_UPDATE_INTERVAL = 500; 
const CHART_UPDATE_INTERVAL = 1000; 
const IDLE_PRESSURE_THRESHOLD = 0.029;
const LOW_PRESSURE_THRESHOLD = 0.125;

const button = document.getElementById('notificationButton');
const menu = document.getElementById('notificationMenu');

let frontPressureChart, rearPressureChart;
let tempChart, humidityChart, atmPressureChart;

let frontPressure = 0.0;
let rearPressure = 0.0;
let currentTemp = 0.0;
let currentHumidity = 0.0;
let currentAtmPressure = 0.0;

let alarmWasManuallyDismissed = false;
let idleWasManuallyDismissed = false;
let lastAlarmNotificationTime = 0;
let lastIdleNotificationTime = 0;

// --- 2. Notification Management ---
function saveNotificationsToLocalStorage() {
    const notificationList = document.querySelector('#notificationMenu ul');
    if (!notificationList) return;
    
    const notifications = [];
    notificationList.querySelectorAll('.notification-item').forEach(item => {
        notifications.push({
            type: item.className.split('notification-')[1].split(' ')[0],
            message: item.querySelector('.notification-message').textContent,
            details: item.querySelector('.notification-details')?.textContent || '',
            timestamp: item.querySelector('.notification-time').textContent,
            isRead: item.classList.contains('notification-read')
        });
    });
    localStorage.setItem('dashboardNotifications', JSON.stringify(notifications));
}

function loadNotificationsFromLocalStorage() {
    const stored = localStorage.getItem('dashboardNotifications');
    if (!stored) return;
    
    try {
        const notifications = JSON.parse(stored);
        const notificationList = document.querySelector('#notificationMenu ul');
        if (!notificationList) return;
        
        notificationList.innerHTML = '';
        notifications.forEach(notif => {
            const li = document.createElement('li');
            li.className = `notification-item notification-${notif.type} ${notif.isRead ? 'notification-read' : 'notification-unread'}`;
            li.innerHTML = `
                <div class="notification-content">
                    <span class="notification-time">${notif.timestamp}</span>
                    <span class="notification-message">${notif.message}</span>
                    ${notif.details ? `<span class="notification-details">${notif.details}</span>` : ''}
                </div>
                <button class="notification-close" onclick="this.parentElement.remove(); saveNotificationsToLocalStorage(); updateNotificationBadge();">&times;</button>
            `;
            li.addEventListener('click', markNotificationAsRead);
            notificationList.appendChild(li);
        });
        updateNotificationBadge();
    } catch (e) {
        console.error('Failed to load notifications:', e);
    }
}

function updateNotificationBadge() {
    const badge = document.getElementById('notificationBadge');
    if (!badge) return;
    const unreadCount = document.querySelectorAll('.notification-unread').length;
    badge.textContent = unreadCount;
    badge.style.display = unreadCount > 0 ? 'block' : 'none';
}

function markNotificationAsRead(event) {
    if (event.target.classList.contains('notification-close')) return;
    const item = event.currentTarget;
    if (!item.classList.contains('notification-read')) {
        item.classList.remove('notification-unread');
        item.classList.add('notification-read');
        saveNotificationsToLocalStorage();
        updateNotificationBadge();
    }
}

function addNotification(type, message, details) {
    const notificationList = document.querySelector('#notificationMenu ul');
    if (!notificationList) return;
    
    const timestamp = new Date().toLocaleTimeString('ja-JP');
    const li = document.createElement('li');
    li.className = `notification-item notification-${type} notification-unread`;
    li.innerHTML = `
        <div class="notification-content">
            <span class="notification-time">${timestamp}</span>
            <span class="notification-message">${message}</span>
            ${details ? `<span class="notification-details">${details}</span>` : ''}
        </div>
        <button class="notification-close" onclick="this.parentElement.remove(); saveNotificationsToLocalStorage(); updateNotificationBadge();">&times;</button>
    `;
    li.addEventListener('click', markNotificationAsRead);
    notificationList.insertBefore(li, notificationList.firstChild);
    
    const items = notificationList.querySelectorAll('li');
    if (items.length > 10) items[items.length - 1].remove();
    
    saveNotificationsToLocalStorage();
    updateNotificationBadge();
}

// --- 3. Real-time Monitoring Logic ---
async function updateRealtimeData() {
    try {
        const response = await fetch(REALTIME_API);
        const data = await response.json();        
        
        if (data.front_pressure !== undefined && data.rear_pressure !== undefined) {
            frontPressure = data.front_pressure;
            rearPressure = data.rear_pressure;
            
            // Pressure Values (Slide 1)
            document.getElementById('front-pressure-value').innerText = frontPressure.toFixed(3);
            document.getElementById('rear-pressure-value').innerText = rearPressure.toFixed(3);
            
            // Env Values (Slide 2)
            if (data.temperature !== undefined) {
                currentTemp = data.temperature;
                document.getElementById('temp-value').innerText = currentTemp.toFixed(1);
            }
            if (data.humidity !== undefined) {
                currentHumidity = data.humidity;
                document.getElementById('humidity-value').innerText = currentHumidity.toFixed(1);
            }
            if (data.pressure_hpa !== undefined) {
                currentAtmPressure = data.pressure_hpa;
                document.getElementById('atm-pressure-value').innerText = Math.round(currentAtmPressure);
            }

            // State Logic: Normal vs Idle vs Alarm
            if (frontPressure >= LOW_PRESSURE_THRESHOLD && rearPressure >= LOW_PRESSURE_THRESHOLD) {
                alarmWasManuallyDismissed = false;
                idleWasManuallyDismissed = false; 
                hideAllModals();
            } else if (frontPressure <= IDLE_PRESSURE_THRESHOLD || rearPressure <= IDLE_PRESSURE_THRESHOLD) {
                if (!idleWasManuallyDismissed) showIdleNotification();
                document.getElementById('pressureAlarmModal').classList.add('hidden');
            } else {
                if (!alarmWasManuallyDismissed) showPressureAlarm();
                document.getElementById('idleSystemModal').classList.add('hidden');
            }
        }
    } catch (error) { 
        console.error('Data fetch error:', error); 
    }
}

// --- 4. Chart Logic ---

function createCharts(initialLabels = Array(30).fill(''), initialFront = Array(30).fill(null), initialRear = Array(30).fill(null)) {
    const baseOptions = (title, min, max) => ({
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            y: { min: min, max: max, title: { display: true, text: title } },
            x: { ticks: { maxTicksLimit: 10 } }
        },
        plugins: { legend: { display: true } }
    });

    // 1. Front Pressure
    frontPressureChart = new Chart(document.getElementById('front-pressure-chart'), {
        type: 'line',
        data: { labels: initialLabels, datasets: [{ label: 'Front (MPa)', data: initialFront, borderColor: 'rgb(75, 192, 192)', tension: 0.1 }] },
        options: {
            ...baseOptions('MPa', 0, 0.25),
            plugins: {
                annotation: {
                    annotations: {
                        low: { type: 'line', yMin: LOW_PRESSURE_THRESHOLD, yMax: LOW_PRESSURE_THRESHOLD, borderColor: 'orange', borderDash: [6, 6] },
                        idle: { type: 'line', yMin: IDLE_PRESSURE_THRESHOLD, yMax: IDLE_PRESSURE_THRESHOLD, borderColor: 'grey', borderDash: [6, 6] }
                    }
                }
            }
        }
    });

    // 2. Rear Pressure
    rearPressureChart = new Chart(document.getElementById('rear-pressure-chart'), {
        type: 'line',
        data: { labels: initialLabels, datasets: [{ label: 'Rear (MPa)', data: initialRear, borderColor: 'rgb(255, 99, 132)', tension: 0.1 }] },
        options: {
            ...baseOptions('MPa', 0, 0.25),
            plugins: {
                annotation: {
                    annotations: {
                        low: { type: 'line', yMin: LOW_PRESSURE_THRESHOLD, yMax: LOW_PRESSURE_THRESHOLD, borderColor: 'orange', borderDash: [6, 6] },
                        idle: { type: 'line', yMin: IDLE_PRESSURE_THRESHOLD, yMax: IDLE_PRESSURE_THRESHOLD, borderColor: 'grey', borderDash: [6, 6] }
                    }
                }
            }
        }
    });

    // 3. Environmental (Slide 2)
    const envLabels = Array(20).fill('');
    tempChart = new Chart(document.getElementById('temp-chart'), {
        type: 'line',
        data: { labels: envLabels, datasets: [{ label: 'Temp (°C)', data: Array(20).fill(null), borderColor: '#ff9f40' }] },
        options: baseOptions('°C', 10, 40)
    });

    humidityChart = new Chart(document.getElementById('humidity-chart'), {
        type: 'line',
        data: { labels: envLabels, datasets: [{ label: 'Humidity (%)', data: Array(20).fill(null), borderColor: '#36a2eb' }] },
        options: baseOptions('%RH', 0, 100)
    });

    atmPressureChart = new Chart(document.getElementById('atm-chart'), {
        type: 'line',
        data: { labels: envLabels, datasets: [{ label: 'ATM (hPa)', data: Array(20).fill(null), borderColor: '#9966ff' }] },
        options: baseOptions('hPa', 950, 1050)
    });
}

function updatePressureCharts() {
    if (!frontPressureChart) return;
    const now = new Date().toLocaleTimeString('ja-JP', { hour12: false });

    [frontPressureChart, rearPressureChart].forEach((chart, i) => {
        const val = (i === 0) ? frontPressure : rearPressure;
        chart.data.labels.push(now);
        chart.data.datasets[0].data.push(val);
        if (chart.data.labels.length > 30) {
            chart.data.labels.shift();
            chart.data.datasets[0].data.shift();
        }
        chart.update('none');
    });
}

function updateEnvironmentalCharts() {
    if (!tempChart) return;
    const now = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

    const config = [
        { chart: tempChart, val: currentTemp },
        { chart: humidityChart, val: currentHumidity },
        { chart: atmPressureChart, val: currentAtmPressure }
    ];

    config.forEach(item => {
        item.chart.data.labels.push(now);
        item.chart.data.datasets[0].data.push(item.val);
        if (item.chart.data.labels.length > 20) {
            item.chart.data.labels.shift();
            item.chart.data.datasets[0].data.shift();
        }
        item.chart.update('none');
    });
}

// --- 5. Initial Data Loading ---
async function loadInitialData() {
    try {
        // Fetch both Pressure and Environmental history simultaneously
        const [pressureRes, envRes] = await Promise.all([
            fetch('/api/history'),
            fetch('/api/history/env')
        ]);

        if (!pressureRes.ok || !envRes.ok) throw new Error("API Offline");

        const historyData = await pressureRes.json();
        const envHistoryData = await envRes.json();
        
        // --- Setup Pressure Charts (Slide 1) ---
        if (historyData.length > 0) {
            const labels = historyData.map(e => new Date(e.timestamp).toLocaleTimeString('ja-JP'));
            const front = historyData.map(e => e.front_pressure);
            const rear = historyData.map(e => e.rear_pressure);
            createCharts(labels, front, rear);
        } else {
            createCharts();
        }

        // --- Setup Environmental Charts (Slide 2) ---
        if (envHistoryData.length > 0) {
            const envLabels = envHistoryData.map(e => new Date(e.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }));
            const temps = envHistoryData.map(e => e.temperature);
            const humids = envHistoryData.map(e => e.humidity);
            const atms = envHistoryData.map(e => e.pressure_hpa);

            // Update the existing charts created by createCharts()
            tempChart.data.labels = envLabels;
            tempChart.data.datasets[0].data = temps;
            
            humidityChart.data.labels = envLabels;
            humidityChart.data.datasets[0].data = humids;
            
            atmPressureChart.data.labels = envLabels;
            atmPressureChart.data.datasets[0].data = atms;

            [tempChart, humidityChart, atmPressureChart].forEach(c => c.update());
        }
    } catch (e) {
        console.error("History load error, using empty charts", e);
        createCharts();
    }
}

// --- 6. Modal and UI logic ---
function showPressureAlarm() {
    const modal = document.getElementById('pressureAlarmModal');
    if (modal) {
        document.getElementById('alarm-timestamp').innerText = new Date().toLocaleTimeString();
        document.getElementById('alarm-front-pressure').innerText = frontPressure.toFixed(3) + " MPa";
        document.getElementById('alarm-rear-pressure').innerText = rearPressure.toFixed(3) + " MPa";
        modal.classList.remove('hidden');
        
        const now = Date.now();
        if (now - lastAlarmNotificationTime > 10000) {
            addNotification('alarm', '警告: 空気圧低下', `F: ${frontPressure.toFixed(3)}, R: ${rearPressure.toFixed(3)}`);
            lastAlarmNotificationTime = now;
        }
    }
}

function showIdleNotification() {
    const modal = document.getElementById('idleSystemModal');
    if (modal) {
        document.getElementById('idle-timestamp').innerText = new Date().toLocaleTimeString();
        document.getElementById('idle-front-pressure').innerText = frontPressure.toFixed(3) + " MPa";
        document.getElementById('idle-rear-pressure').innerText = rearPressure.toFixed(3) + " MPa";
        modal.classList.remove('hidden');
        
        const now = Date.now();
        if (now - lastIdleNotificationTime > 10000) {
            addNotification('idle', '通知: システム待機中', `F: ${frontPressure.toFixed(3)}, R: ${rearPressure.toFixed(3)}`);
            lastIdleNotificationTime = now;
        }
    }
}

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
    if (id === 'pressureAlarmModal') alarmWasManuallyDismissed = true;
    if (id === 'idleSystemModal') idleWasManuallyDismissed = true;
}

function hideAllModals() {
    document.getElementById('pressureAlarmModal').classList.add('hidden');
    document.getElementById('idleSystemModal').classList.add('hidden');
}

function updateDateTimeDisplay() {
    const now = new Date();
    document.getElementById('current-date').innerText = `日付: ${now.toLocaleDateString('ja-JP')}`;
    document.getElementById('current-time').innerText = `時間: ${now.toLocaleTimeString('ja-JP', { hour12: false })}`;
}

async function updateAverages() {
    try {
        const [hRes, mRes] = await Promise.all([fetch(HOURLY_AVERAGE_API), fetch(MINUTES_AVERAGE_API)]);
        const hData = await hRes.json();
        const mData = await mRes.json();
        document.getElementById('front-average-value').innerText = hData.front_average?.toFixed(3) || '0.000';
        document.getElementById('rear-average-value').innerText = hData.rear_average?.toFixed(3) || '0.000';
        document.getElementById('front-averageM-value').innerText = mData.front_averageM?.toFixed(3) || '0.000';
        document.getElementById('rear-averageM-value').innerText = mData.rear_averageM?.toFixed(3) || '0.000';
    } catch (e) { console.error("Avg error", e); }
}

// --- 7. Lifecycle & Events ---
document.addEventListener('DOMContentLoaded', async () => {
    await loadInitialData();
    loadNotificationsFromLocalStorage();
    updateDateTimeDisplay();

    // Intervals
    setInterval(updateRealtimeData, REALTIME_UPDATE_INTERVAL);
    setInterval(updatePressureCharts, CHART_UPDATE_INTERVAL);
    setInterval(updateEnvironmentalCharts, 60000); // 1 minute updates
    setInterval(updateAverages, 10000);
    setInterval(updateDateTimeDisplay, 1000);
});

// Notifications toggle
button.addEventListener('click', () => menu.classList.toggle('show'));

// Carousel logic
const buttons = document.querySelectorAll("[data-carousel-button]");
const slidesContainer = document.querySelector("[data-slides]");
let currentIndex = 0;

buttons.forEach(btn => {
    btn.addEventListener("click", () => {
        const offset = btn.dataset.carouselButton === "next" ? 1 : -1;
        const slides = [...slidesContainer.children];
        currentIndex = (currentIndex + offset + slides.length) % slides.length;
        slidesContainer.style.transform = `translateX(-${currentIndex * 100}%)`;
    });
});