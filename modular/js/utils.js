window.safeFetchJson = async function (url) {
    try {
        const res = await fetch(url);
        if (!res.ok) {
            if (res.status === 404) return null;
            throw new Error(`Request failed (${res.status}) for ${url}`);
        }
        return await res.json();
    } catch (err) {
        console.error(err);
        return null;
    }
};

window.median = function (arr) {
    if (!arr || arr.length === 0) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

window.mad = function (arr, med) {
    if (!arr || arr.length === 0 || med == null) return 0;
    const devs = arr.map((v) => Math.abs(v - med));
    return median(devs) || 0;
};

window.aggregateByHour = function (samples) {
    const buckets = {};
    samples.forEach(({ t, delay }) => {
        const key = t.getHours().toString().padStart(2, '0') + ':00';
        if (!buckets[key]) buckets[key] = [];
        buckets[key].push(delay);
    });
    const labels = Object.keys(buckets).sort();
    const medianVals = [];
    const madVals = [];
    labels.forEach((k) => {
        const vals = buckets[k];
        const med = median(vals);
        medianVals.push(med);
        madVals.push(mad(vals, med));
    });
    return { labels, median: medianVals, mad: madVals };
};

window.aggregateByDay = function (samples) {
    const buckets = {};
    samples.forEach(({ t, delay }) => {
        const key = t.toISOString().slice(0, 10);
        if (!buckets[key]) buckets[key] = [];
        buckets[key].push(delay);
    });
    const labels = Object.keys(buckets).sort();
    const medianVals = [];
    const madVals = [];
    labels.forEach((k) => {
        const vals = buckets[k];
        const med = median(vals);
        medianVals.push(med);
        madVals.push(mad(vals, med));
    });
    return { labels, median: medianVals, mad: madVals };
};

window.setOverlayMessage = function (text, visible = true) {
    const overlay = document.getElementById('map-overlay');
    if (!overlay) return;
    if (!visible) {
        overlay.style.display = 'none';
        return;
    }
    overlay.textContent = text;
    overlay.style.display = 'flex';
};
