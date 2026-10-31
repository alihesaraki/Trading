/* ---------- Watchdog: dead socket, missed candle close, tab/network coming back ---------- */
setInterval(() => {
    checkDay();
    if (document.hidden)
        return;
    const t = Date.now();
    if (ws && ws.readyState === 1 && t - lastMsg > 12000)
        wsReset(); /* silently dead socket -> reconnect right away */
    if (skewOk && closeAt && t + skew > closeAt + 1500)
        catchUp(); /* candle closed but the next one never arrived -> fetch it */
}, 1000);
document.addEventListener('visibilitychange', () => {
    clearTimeout(idleT);
    if (document.hidden) {
        syncWS(); /* drops the row streams right away */
        idleT = setTimeout(() => { idle = true; syncWS(); }, 30000); /* ...and every stream after 30s in the background */
        return;
    }
    const wasIdle = idle;
    idle = false;
    if (!wasIdle && ws && ws.readyState === 1 && Date.now() - lastMsg > 5000)
        wsReset();
    refresh();
    syncWS();
    catchUp(true);
});
addEventListener('online', () => { refresh(false, true); catchUp(true); });
/* Full 24h list: every 60s only while the socket is down; with live streams running the visible rows already update
   themselves, so a refresh every 10 minutes (volume ranking, new listings) is enough. */
setInterval(() => {
    if (document.hidden)
        return;
    const live = ws && ws.readyState === 1 && Date.now() - lastMsg < 12000;
    if (Date.now() - lastRef >= (live ? 600000 : 60000))
        refresh(false, true);
}, 15000);
