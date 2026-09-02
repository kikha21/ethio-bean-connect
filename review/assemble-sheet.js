const fs = require('fs');
const body = fs.readFileSync('review/amharic-review-sheet.body.html', 'utf8');

const head = `<title>Amharic Review Sheet</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700&family=IBM+Plex+Mono:wght@400&family=Noto+Sans+Ethiopic:wght@400;600&family=Source+Sans+3:wght@400;600&display=swap">
<style>
:root{
  --paper:#F5F3ED; --card:#FFFDF8; --line:#E0D9C9; --ink:#1A1712; --ink-2:#6A6152;
  --mark:#8A5A3B; --ok:#2E6B33; --flag:#A6412A;
  --display:"Archivo",system-ui,sans-serif; --body:"Source Sans 3",system-ui,sans-serif;
  --eth:"Noto Sans Ethiopic","Source Sans 3",system-ui,sans-serif;
  --mono:"IBM Plex Mono",ui-monospace,monospace;
  --shell:min(940px,100% - 2.2rem);
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --paper:#15130F; --card:#1D1A15; --line:#312C24; --ink:#F2EEE6; --ink-2:#A79D8C;
  --mark:#C89164; --ok:#7FB783; --flag:#E8836A;
}}
:root[data-theme="dark"]{
  --paper:#15130F; --card:#1D1A15; --line:#312C24; --ink:#F2EEE6; --ink-2:#A79D8C;
  --mark:#C89164; --ok:#7FB783; --flag:#E8836A;
}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--body);font-size:1.05rem;line-height:1.6;-webkit-font-smoothing:antialiased}
h1,h2{font-family:var(--display);margin:0;line-height:1.1;text-wrap:balance;letter-spacing:-.02em}
p{margin:0}
.wrap{width:var(--shell);margin-inline:auto}
:focus-visible{outline:2px solid var(--mark);outline-offset:3px}

.top{padding:clamp(2.4rem,6vw,4rem) 0 1.6rem}
.top h1{font-size:clamp(1.9rem,4.8vw,2.9rem);max-width:20ch}
.top .lede{margin-top:1rem;color:var(--ink-2);max-width:64ch}

.brief{margin-top:1.8rem;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:clamp(1.2rem,3vw,1.9rem)}
.brief h2{font-size:1.2rem;margin-bottom:.8rem}
.brief ol{margin:0;padding-left:1.2rem;display:grid;gap:.6rem;color:var(--ink-2)}
.brief strong{color:var(--ink)}
.brief .ask{margin-top:1.2rem;padding-top:1.1rem;border-top:1px solid var(--line);color:var(--ink-2);font-size:.97rem}

section{margin-top:2.4rem}
section h2{font-size:1.15rem;display:flex;align-items:baseline;gap:.6rem;margin-bottom:.7rem}
.count{font-family:var(--mono);font-size:.78rem;color:var(--ink-2);font-weight:400}
.rows{display:grid;gap:.5rem}
.row{display:grid;grid-template-columns:auto 1fr auto;gap:.9rem;align-items:start;
  background:var(--card);border:1px solid var(--line);border-radius:12px;padding:.85rem 1rem}
.num{font-family:var(--mono);font-size:.78rem;color:var(--ink-2);padding-top:.18rem;min-width:2.2ch;text-align:right}
.pair{min-width:0}
.en{color:var(--ink-2);font-size:.95rem}
.am{font-family:var(--eth);font-size:1.12rem;line-height:1.5;margin-top:.25rem}
.mark{width:26px;height:26px;border:1px solid var(--line);border-radius:6px;flex:0 0 26px}

@media print{
  body{background:#fff;color:#000;font-size:10.5pt}
  .row{break-inside:avoid;border-color:#bbb;background:#fff}
  .brief{break-inside:avoid;border-color:#bbb;background:#fff}
  .top{padding:0 0 1rem}
  a{color:#000}
}
footer{margin:3rem 0 4rem;color:var(--ink-2);font-size:.95rem}
</style>`;

const intro = `
<header class="top">
  <div class="wrap">
    <h1>Amharic review sheet</h1>
    <p class="lede">Every Amharic string on the Ethio Bean Connect website, beside the English it came from. 128 in total. The Amharic is a first pass written by an AI and has never been read by a native speaker.</p>

    <div class="brief">
      <h2>What to check, in order of how much it matters</h2>
      <ol>
        <li><strong>Trade terms.</strong> Grade, moisture, washing station, lot, parchment, screen size. Are these the words the coffee trade actually uses in Amharic, or a literal translation of the English?</li>
        <li><strong>Register.</strong> Does it sound like a serious business writing to an exporter, or too casual, or stiff and official?</li>
        <li><strong>Process names.</strong> Washed, Natural, Honey processed and Semi washed were deliberately left in English. Is that right, or should they be in Amharic?</li>
        <li><strong>The date.</strong> The market table shows a Gregorian date. Should it be the Ethiopian calendar?</li>
        <li><strong>Anything that reads as machine translation.</strong> If a sentence is understandable but no Ethiopian would say it that way, flag it.</li>
      </ol>
      <p class="ask">Tick the box beside anything that needs changing and write the better wording next to it. Do not worry about matching the English exactly. If a shorter or different sentence works better in Amharic, that is the right answer.</p>
    </div>
  </div>
</header>

<main class="wrap">`;

const outro = `
</main>
<footer class="wrap">
  <p>Numbers are for referring back only. Return the sheet with your corrections and they go straight into the site.</p>
</footer>`;

fs.writeFileSync('review/amharic-review-sheet.html', head + intro + body + outro, 'utf8');
console.log('written review/amharic-review-sheet.html');
