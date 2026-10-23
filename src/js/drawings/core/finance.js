  // finance (position sizing, time formatting)
  function calcPosition(i) {
    const dir = i.side === "long" ? 1 : -1;
    const riskPerUnit = (i.entry - i.stop) * dir;
    const rewardPerUnit = (i.target - i.entry) * dir;
    const valid = riskPerUnit > 0 && rewardPerUnit > 0;
    const riskAmount = i.account * i.riskPct / 100;
    const lev = i.leverage && i.leverage > 0 ? i.leverage : 1;
    const fee = (i.feePct ?? 0) / 100;
    const qty = riskPerUnit > 0 ? riskAmount / (riskPerUnit + fee * (i.entry + i.stop)) : 0;
    const notional = qty * i.entry;
    const feeIn = notional * fee, feeOutStop = qty * i.stop * fee, feeOutTp = qty * i.target * fee;
    return {
      valid,
      riskPerUnit,
      rewardPerUnit,
      rr: riskPerUnit > 0 ? rewardPerUnit / riskPerUnit : 0,
      riskAmount,
      qty,
      notional,
      margin: notional / lev,
      stopPct: (i.stop - i.entry) / i.entry * 100,
      targetPct: (i.target - i.entry) / i.entry * 100,
      lossAtStop: -(qty * riskPerUnit) - feeIn - feeOutStop,
      profitAtTarget: qty * rewardPerUnit - feeIn - feeOutTp,
      breakevenPct: fee * 2 * 100
    };
  }
  function positionOutcome(side, stop, target, bars) {
    for (const b of bars) {
      const hitSl = side === "long" ? b.low <= stop : b.high >= stop;
      const hitTp = side === "long" ? b.high >= target : b.low <= target;
      if (hitSl) return "sl";
      if (hitTp) return "tp";
    }
    return "open";
  }
  function measure(p1, p2, barSeconds, decimals) {
    const priceDiff = p2.price - p1.price;
    const pct = p1.price !== 0 ? priceDiff / p1.price * 100 : 0;
    const seconds = p2.time - p1.time;
    const bars = barSeconds > 0 ? Math.round(seconds / barSeconds) : 0;
    const sg = priceDiff >= 0 ? "+" : "\u2212";
    return { priceDiff, pct, bars, seconds, text: `${sg}${Math.abs(priceDiff).toFixed(decimals)} (${sg}${Math.abs(pct).toFixed(2)}%)  ${bars} bars, ${fmtDuration(seconds)}` };
  }
  function fmtDuration(sec) {
    let s = Math.abs(Math.round(sec));
    const d2 = Math.floor(s / 86400);
    s -= d2 * 86400;
    const h = Math.floor(s / 3600);
    s -= h * 3600;
    const m = Math.floor(s / 60);
    const parts = [];
    if (d2) parts.push(`${d2}d`);
    if (h) parts.push(`${h}h`);
    if (m || !parts.length) parts.push(`${m}m`);
    return parts.join(" ");
  }
  var FIB_RETRACE = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  function fibPrice(p1, p2, level, logScale = false) {
    if (logScale && p1 > 0 && p2 > 0) return Math.exp(Math.log(p2) + (Math.log(p1) - Math.log(p2)) * level);
    return p2 + (p1 - p2) * level;
  }