/*
 * Endestadstøylen opp – felles kode for resultatsidene.
 *
 * Leser løpsoversikten (results/lop.csv) og én CSV-fil per løp, og regner ut
 * plassering, tidsdifferanse og statistikk. Se results/README.md for filformat.
 */
(function (global) {
  'use strict';

  var INDEX_FILE = 'results/lop.csv';

  // Kolonnenavn som godtas i CSV-filene (små bokstaver, uten mellomrom).
  var ALIASES = {
    bib:  ['startnr', 'startnummer', 'nr', 'bib'],
    name: ['navn', 'name', 'deltaker'],
    club: ['klubb', 'club', 'lag', 'team'],
    time: ['tid', 'time', 'sluttid', 'nettotid']
  };

  var STATUS_WORDS = ['DNF', 'DNS', 'DSQ', 'BRØT', 'IKKE STARTET', 'DISK'];

  /* ── HTML-escaping: alt innhold fra CSV settes inn via denne ── */
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ── CSV ──
   * Støtter komma, semikolon (norsk Excel) og tab som skilletegn,
   * felt i anførselstegn, og BOM fra Excel-eksport. */
  function detectDelimiter(firstLine) {
    var candidates = [';', ',', '\t'];
    var best = ',', bestCount = 0;
    candidates.forEach(function (d) {
      var count = firstLine.split(d).length - 1;
      if (count > bestCount) { best = d; bestCount = count; }
    });
    return best;
  }

  function parseCSV(text) {
    text = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    var delim = detectDelimiter(text.split('\n', 1)[0]);
    var rows = [], row = [], field = '', inQuotes = false;

    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else {
          field += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === delim) {
        row.push(field); field = '';
      } else if (c === '\n') {
        row.push(field); rows.push(row); row = []; field = '';
      } else {
        field += c;
      }
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }

    rows = rows.filter(function (r) {
      return r.some(function (f) { return f.trim() !== ''; });
    });
    if (!rows.length) return [];

    var header = rows[0].map(function (h) { return h.trim().toLowerCase().replace(/\s+/g, '_'); });
    return rows.slice(1).map(function (r) {
      var obj = {};
      header.forEach(function (h, idx) { obj[h] = (r[idx] || '').trim(); });
      return obj;
    });
  }

  function pick(obj, key) {
    var names = ALIASES[key];
    for (var i = 0; i < names.length; i++) {
      if (obj[names[i]] != null && obj[names[i]] !== '') return obj[names[i]];
    }
    return '';
  }

  /* ── Tid ──
   * "32:15" = 32 min 15 s, "1:02:03" = 1 t 2 min 3 s.
   * Punktum som skilletegn går også: "19.35" = 19:35, "1.02.03" = 1:02:03.
   * Desimaler (tideler/hundredeler) skrives med komma: "19.35,34" eller
   * "19:35,34". Med kolon kan desimalene også skrives med punktum: "19:35.34".
   * Returnerer sekunder, eller null hvis feltet ikke er en tid. */
  function splitTime(str) {
    var s = String(str || '').trim(), frac = '';
    var comma = s.indexOf(',');
    if (comma >= 0) {
      frac = s.slice(comma + 1);
      s = s.slice(0, comma);
    } else if (s.indexOf(':') >= 0 && /\.\d+$/.test(s)) {
      frac = s.slice(s.lastIndexOf('.') + 1);
      s = s.slice(0, s.lastIndexOf('.'));
    }
    s = s.replace(/\./g, ':');
    if (!/^\d+(:\d{1,2}){1,2}$/.test(s) || !/^\d*$/.test(frac)) return null;
    return { main: s, frac: frac };
  }

  function parseTime(str) {
    var t = splitTime(str);
    if (!t) return null;
    var sec = 0;
    t.main.split(':').forEach(function (p) { sec = sec * 60 + parseInt(p, 10); });
    return t.frac ? sec + parseFloat('0.' + t.frac) : sec;
  }

  // Antall desimaler oppgitt i tidsfeltet (0 hvis ingen)
  function timeDecimals(str) {
    var t = splitTime(str);
    return t ? t.frac.length : 0;
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  // decimals: antall desimaler på sekunder (0–2)
  function formatTime(sec, decimals) {
    if (sec == null || isNaN(sec)) return '–';
    decimals = decimals || 0;
    var factor = Math.pow(10, decimals);
    var rounded = Math.round(sec * factor) / factor;
    var h = Math.floor(rounded / 3600);
    var m = Math.floor((rounded % 3600) / 60);
    var s = rounded - h * 3600 - m * 60;
    var sStr = decimals ? s.toFixed(decimals).replace('.', ',') : String(Math.round(s));
    if (s < 10) sStr = '0' + sStr;
    return h > 0 ? h + ':' + pad2(m) + ':' + sStr : m + ':' + sStr;
  }

  function formatGap(sec, decimals) {
    if (!sec) return '–';
    // Under ett minutt: bare sekunder, f.eks. "+2,14"
    if (Math.round(sec * 100) / 100 < 60) {
      return '+' + (decimals ? sec.toFixed(decimals).replace('.', ',') : String(Math.round(sec)));
    }
    return '+' + formatTime(sec, decimals);
  }

  // Tempo i min/km
  function formatPace(sec, km) {
    if (!km || !sec) return '–';
    return formatTime(sec / km, 0) + ' /km';
  }

  // Vertikalfart i høydemeter per time
  function formatVertical(sec, climbM) {
    if (!climbM || !sec) return '–';
    return formatNumber(climbM / (sec / 3600), 0) + ' m/t';
  }

  function formatNumber(n, decimals) {
    return n.toLocaleString('nb-NO', {
      minimumFractionDigits: decimals || 0,
      maximumFractionDigits: decimals || 0
    });
  }

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T12:00:00');
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  /* ── Datalasting ── */
  function fetchText(path) {
    return fetch(path, { cache: 'no-cache' }).then(function (res) {
      if (!res.ok) throw new Error('Kunne ikke hente ' + path + ' (' + res.status + ')');
      return res.text();
    });
  }

  function loadRaceIndex() {
    return fetchText(INDEX_FILE).then(function (text) {
      return parseCSV(text).map(function (r) {
        return {
          year: r.ar || r['år'] || r.year,
          date: r.dato || r.date || '',
          file: 'results/' + (r.fil || r.file),
          distanceKm: parseFloat((r.distanse_km || '').replace(',', '.')) || null,
          climbM: parseInt(r.stigning_m, 10) || null,
          note: r.merknad || r.note || ''
        };
      }).filter(function (r) { return r.year && r.file; })
        .sort(function (a, b) { return b.year - a.year; });
    });
  }

  function loadRace(race) {
    return fetchText(race.file).then(function (text) {
      return buildResults(parseCSV(text));
    });
  }

  /* ── Resultater og statistikk ── */
  function buildResults(rows) {
    var finishers = [], others = [];

    rows.forEach(function (r) {
      var rawTime = pick(r, 'time');
      var entry = {
        bib: pick(r, 'bib'),
        name: pick(r, 'name'),
        club: pick(r, 'club'),
        rawTime: rawTime,
        seconds: parseTime(rawTime)
      };
      if (!entry.name) return;
      if (entry.seconds != null) {
        finishers.push(entry);
      } else {
        var upper = rawTime.toUpperCase();
        entry.status = STATUS_WORDS.indexOf(upper) >= 0 ? upper : (rawTime || 'DNF');
        others.push(entry);
      }
    });

    finishers.sort(function (a, b) { return a.seconds - b.seconds; });

    // Delt plass ved lik tid
    var winner = finishers.length ? finishers[0].seconds : 0;
    finishers.forEach(function (f, i) {
      var prev = finishers[i - 1];
      f.place = prev && prev.seconds === f.seconds ? prev.place : i + 1;
      f.gap = f.seconds - winner;
    });

    // Vis like mange desimaler som den mest presise tiden i fila (maks hundredeler)
    var decimals = Math.min(2, finishers.reduce(function (max, f) {
      return Math.max(max, timeDecimals(f.rawTime));
    }, 0));

    return {
      finishers: finishers,
      others: others,
      decimals: decimals,
      stats: computeStats(finishers, others),
      clubs: clubSummary(finishers)
    };
  }

  function median(sorted) {
    var n = sorted.length;
    if (!n) return null;
    var mid = Math.floor(n / 2);
    return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function computeStats(finishers, others) {
    var times = finishers.map(function (f) { return f.seconds; });
    var n = times.length;
    var mean = n ? times.reduce(function (a, b) { return a + b; }, 0) / n : null;
    var sd = n > 1 ? Math.sqrt(times.reduce(function (a, t) {
      return a + (t - mean) * (t - mean);
    }, 0) / (n - 1)) : null;
    var clubNames = {};
    finishers.concat(others).forEach(function (f) { if (f.club) clubNames[f.club.toLowerCase()] = true; });

    return {
      finishers: n,
      starters: n + others.filter(function (o) { return o.status !== 'DNS' && o.status !== 'IKKE STARTET'; }).length,
      notFinished: others.length,
      winner: finishers[0] || null,
      fastest: n ? times[0] : null,
      slowest: n ? times[n - 1] : null,
      mean: mean,
      median: median(times),
      stdDev: sd,
      top10Mean: n ? times.slice(0, 10).reduce(function (a, b) { return a + b; }, 0) / Math.min(10, n) : null,
      clubs: Object.keys(clubNames).length
    };
  }

  function clubSummary(finishers) {
    var map = {};
    finishers.forEach(function (f) {
      var key = f.club || '';
      if (!map[key]) map[key] = { club: key, count: 0, best: null, bestName: '', total: 0 };
      var c = map[key];
      c.count++;
      c.total += f.seconds;
      if (c.best == null || f.seconds < c.best) { c.best = f.seconds; c.bestName = f.name; }
    });
    return Object.keys(map).map(function (k) {
      var c = map[k];
      c.mean = c.total / c.count;
      return c;
    }).sort(function (a, b) {
      // Uten klubb havner sist; ellers flest deltakere først, så beste tid
      if (!a.club !== !b.club) return a.club ? -1 : 1;
      return b.count - a.count || a.best - b.best;
    });
  }

  /* ── Histogram-inndeling: runde bøttebredder, ~8–14 søyler ── */
  function histogram(times) {
    if (!times.length) return { bins: [], width: 60 };
    var min = times[0], max = times[times.length - 1];
    var span = Math.max(max - min, 60);
    var widths = [30, 60, 120, 180, 300, 600, 900];
    var width = widths[widths.length - 1];
    for (var i = 0; i < widths.length; i++) {
      if (span / widths[i] <= 14) { width = widths[i]; break; }
    }
    var start = Math.floor(min / width) * width;
    var end = Math.floor(max / width) * width + width;
    var bins = [];
    for (var b = start; b < end; b += width) bins.push({ from: b, to: b + width, count: 0 });
    times.forEach(function (t) {
      var idx = Math.min(Math.floor((t - start) / width), bins.length - 1);
      bins[idx].count++;
    });
    return { bins: bins, width: width };
  }

  global.Results = {
    esc: esc,
    parseCSV: parseCSV,
    parseTime: parseTime,
    formatTime: formatTime,
    formatGap: formatGap,
    formatPace: formatPace,
    formatVertical: formatVertical,
    formatNumber: formatNumber,
    formatDate: formatDate,
    loadRaceIndex: loadRaceIndex,
    loadRace: loadRace,
    buildResults: buildResults,
    histogram: histogram
  };
})(window);
