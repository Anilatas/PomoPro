let timerId = null;
let timeLeft = 0;
let expiredSent = false;

self.onmessage = function(e) {
    if (e.data.action === 'start') {
        timeLeft = e.data.time;
        expiredSent = false;
        if (timerId !== null) clearInterval(timerId);
        timerId = setInterval(() => {
            if (timeLeft <= 0) {
                if (!expiredSent) {
                    self.postMessage({ action: 'expired' });
                    expiredSent = true;
                }
                self.postMessage({ action: 'tick', timeLeft: timeLeft });
                timeLeft--;
            } else {
                self.postMessage({ action: 'tick', timeLeft: timeLeft });
                timeLeft--;
            }
        }, 1000);
    } else if (e.data.action === 'stop') {
        clearInterval(timerId);
        timerId = null;
        expiredSent = false;
    } else if (e.data.action === 'addTime') {
        timeLeft += e.data.amount;
    }
};
