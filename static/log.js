document.addEventListener('DOMContentLoaded', () => {
    const frontLogList = document.getElementById('front-log-list');
    const rearLogList = document.getElementById('rear-log-list');
    const errorLogList = document.getElementById('error-log-list');
    const clearErrorLogBtn = document.getElementById('clear-error-log');
    const IDLE_PRESSURE_THRESHOLD = 0.029; // Values below this will not be shown
    const LOW_PRESSURE_THRESHOLD = 0.125; // Values below this are considered "low pressure" events

    // Update date and time display
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

    // Clear error log (only from frontend)
    function clearErrorLog() {
        if (confirm('エラーログをクリアしますか？')) {
            errorLogList.innerHTML = '<li class="log-entry">低気圧無し</li>';
            console.log('Error log cleared');
        }
    }

    async function updateLogDisplay() {
        try {
            // Fetch regular logs
            const response = await fetch('/api/log');
            if (!response.ok) throw new Error('Failed to fetch logs');
            const data = await response.json();

            // Clear existing content (except error log since it can be manually cleared)
            frontLogList.innerHTML = '';
            rearLogList.innerHTML = '';

            // Add regular log entries
            data.forEach(entry => {
                const timestamp = new Date(entry.timestamp).toLocaleTimeString('ja-JP');

                // Only show front pressure logs if above the idle threshold
                if (entry.front_pressure !== null && entry.front_pressure >= IDLE_PRESSURE_THRESHOLD) {
                    const frontEntry = document.createElement('li');
                    frontEntry.className = 'log-entry';
                    frontEntry.innerHTML = `
                        <span class="log-timestamp">${timestamp}</span>
                        <span class="log-value">${entry.front_pressure.toFixed(3)} MPa</span>
                    `;
                    frontLogList.appendChild(frontEntry);
                }

                // Only show rear pressure logs if above the idle threshold
                if (entry.rear_pressure !== null && entry.rear_pressure >= IDLE_PRESSURE_THRESHOLD) {
                    const rearEntry = document.createElement('li');
                    rearEntry.className = 'log-entry';
                    rearEntry.innerHTML = `
                        <span class="log-timestamp">${timestamp}</span>
                        <span class="log-value">${entry.rear_pressure.toFixed(3)} MPa</span>
                    `;
                    rearLogList.appendChild(rearEntry);
                }
            });

            // Filter for and display "error" (low pressure) logs from the same data
            const errorData = data.filter(entry =>
                (entry.front_pressure < LOW_PRESSURE_THRESHOLD && entry.front_pressure > IDLE_PRESSURE_THRESHOLD) ||
                (entry.rear_pressure < LOW_PRESSURE_THRESHOLD && entry.rear_pressure > IDLE_PRESSURE_THRESHOLD)
            );

            // Only update error log if it hasn't been manually cleared
            if (!frontLogList.innerHTML.includes('No errors currently')) {
                if (errorData.length > 0) {
                    errorLogList.innerHTML = ''; // Clear the placeholder first
                    errorData.forEach(entry => {
                        const timestamp = new Date(entry.timestamp).toLocaleTimeString('ja-JP');
                        const errorEntry = document.createElement('li');
                        errorEntry.className = 'log-entry error-entry';
                        errorEntry.innerHTML = `
                            <span class="log-timestamp">${timestamp}</span>
                            <div class="error-details">
                                <span class="error-value">F: ${entry.front_pressure.toFixed(3)} MPa</span>
                                <span class="error-value">R: ${entry.rear_pressure.toFixed(3)} MPa</span>
                            </div>
                        `;
                        errorLogList.appendChild(errorEntry);
                    });
                }
            }

            // Scroll to latest entries
            frontLogList.scrollTop = frontLogList.scrollHeight;
            rearLogList.scrollTop = rearLogList.scrollHeight;
            errorLogList.scrollTop = errorLogList.scrollHeight;

        } catch (error) {
            console.error('Error fetching log data:', error);
            frontLogList.innerHTML = '<li class="log-entry">Error loading logs.</li>';
            rearLogList.innerHTML = '<li class="log-entry">Error loading logs.</li>';
        }
    }

    // Initial setup
    updateDateTimeDisplay();
    updateLogDisplay();

    // Update date/time every second
    setInterval(updateDateTimeDisplay, 1000);

    // Update logs every 5 seconds
    setInterval(updateLogDisplay, 5000);

    // Clear error log button click handler
    if (clearErrorLogBtn) {
        clearErrorLogBtn.addEventListener('click', clearErrorLog);
    }
});
