{{-- The student's record, leaving the system. Everything on this page has
     to make sense without the application: the framework version the
     scores were given against, who gave them, and when.

     Drawn in the diary's own look (CAP-65): Inter, the diary purple for
     self-scores and its green for counter-scores, as the screen draws them.
     Raw hex is deliberate, as in radar.blade.php: the values are the light
     theme's in web/src/tokens.css, and a PDF has no stylesheet to inherit.
     dompdf lays out CSS 2.1, so columns are tables, not flex or grid. --}}
@php
    use Carbon\Carbon;
    use Illuminate\Support\Str;

    $fonts = resource_path('fonts/inter');
    $statuses = ['draft' => 'Draft', 'submitted' => 'Submitted', 'assessed' => 'Assessed'];
@endphp
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
    @font-face { font-family: 'Inter'; font-weight: 400; src: url('{{ $fonts }}/Inter-Regular.ttf') format('truetype'); }
    @font-face { font-family: 'Inter'; font-weight: 600; src: url('{{ $fonts }}/Inter-SemiBold.ttf') format('truetype'); }
    @font-face { font-family: 'Inter'; font-weight: 700; src: url('{{ $fonts }}/Inter-Bold.ttf') format('truetype'); }

    @page { margin: 24mm 18mm 20mm; }
    body { font-family: 'Inter', 'DejaVu Sans', sans-serif; font-size: 9.5pt; line-height: 1.5; color: #202020; }
    p { margin: 0; }
    table { border-collapse: collapse; }

    /* Fixed elements repeat on every page. */
    .running-head { position: fixed; top: -16mm; left: 0; right: 0; height: 9mm; border-bottom: 0.6pt solid #d9d9d9; }
    .running-foot { position: fixed; bottom: -13mm; left: 0; right: 0; height: 6mm; }
    .running-head table, .running-foot table { width: 100%; }
    .running-head td, .running-foot td { font-size: 7.5pt; color: #666666; vertical-align: bottom; padding-bottom: 2mm; }
    .running-head .wordmark { font-weight: 700; font-size: 9pt; color: #8053ad; }
    /* dompdf counts the page but not the pages, so no "of N". */
    .page-number:after { content: "Page " counter(page); }

    h1 { font-size: 22pt; font-weight: 700; line-height: 1.2; margin: 0 0 1.5mm; }
    .meta { font-size: 8.5pt; color: #666666; }
    .summary { margin: 5mm 0 0; padding: 4mm 5mm; background: #efebfa; border-radius: 3mm; }
    .summary p { font-size: 10pt; }
    .summary .key { margin-top: 1.5mm; font-size: 8.5pt; color: #4a4a4a; }

    .reflection { page-break-before: always; }
    .reflection.first { page-break-before: auto; margin-top: 9mm; }
    .reflection-head { padding-bottom: 3mm; border-bottom: 0.6pt solid #d9d9d9; }
    h2 { font-size: 16pt; font-weight: 700; line-height: 1.25; margin: 0 0 1mm; page-break-after: avoid; }
    .sprint-line td { vertical-align: middle; padding: 0; }
    .sprint { font-size: 11pt; font-weight: 600; }
    .status { display: inline-block; vertical-align: middle; padding: 0.6mm 2.6mm; margin-left: 2mm; border-radius: 3mm; font-size: 7.5pt; font-weight: 600; color: #202020; }
    .status-draft { background: #f1f1f1; }
    .status-submitted { background: #ffe5c4; }
    .status-assessed { background: #e9f4ee; }
    .reflection-head .meta { margin-top: 1.5mm; }

    .overview { width: 100%; margin: 4mm 0 2mm; }
    .overview td { vertical-align: top; }
    .radar-cell { width: 66mm; padding-right: 6mm; text-align: center; }
    .legend { margin-top: 1mm; font-size: 7.5pt; color: #666666; }
    .swatch { display: inline-block; width: 2.6mm; height: 2.6mm; border-radius: 0.6mm; margin: 0 1.2mm 0 0; vertical-align: middle; }
    .legend .swatch { margin-left: 2.5mm; }
    .swatch-self { background: #8053ad; }
    .swatch-counter { background: #317234; }

    .scores { width: 100%; }
    .scores th { font-size: 7pt; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: #666666; text-align: left; padding: 0 2mm 1.5mm 0; border-bottom: 0.6pt solid #d9d9d9; }
    .scores td { padding: 1.6mm 2mm 1.6mm 0; border-bottom: 0.4pt solid #ececec; vertical-align: middle; }
    .scores .num { width: 17mm; }
    .scores .by { width: 18mm; }
    .scores td.by { font-size: 8pt; color: #666666; }
    .scores .code { color: #666666; font-size: 8pt; }

    /* A score is a mark in its scorer's colour: self purple, counter green. */
    .mark { display: inline-block; vertical-align: middle; min-width: 5mm; padding: 0.4mm 1.6mm; border-radius: 2.4mm; text-align: center; font-weight: 700; font-size: 8.5pt; }
    .mark-self { background: #efebfa; color: #8053ad; }
    .mark-counter { background: #e9f4ee; color: #317234; }
    .mark-none { color: #9a9a9a; }

    .entry { padding: 4mm 0 3.5mm; border-bottom: 0.4pt solid #ececec; }
    .entry-head { width: 100%; page-break-after: avoid; }
    .entry-head td { vertical-align: middle; }
    h3 { font-size: 11pt; font-weight: 600; margin: 0; }
    h3 .code { color: #666666; font-weight: 400; }
    .entry-marks { text-align: right; white-space: nowrap; }
    .entry-marks .mark { margin-left: 1.5mm; }
    .narrative { white-space: pre-wrap; margin: 1.8mm 0 0; }
    .narrative.none { color: #666666; }
    .label { page-break-after: avoid; font-size: 7pt; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: #666666; margin: 3mm 0 1mm; }

    .score-lines { width: 100%; }
    /* A score stays with its comment, and a label with what it labels. */
    .score-lines tr { page-break-inside: avoid; }
    .score-lines td { padding: 0.8mm 0; vertical-align: top; font-size: 8.5pt; }
    .score-lines .mark-cell { width: 9mm; }
    .who { color: #4a4a4a; }
    .comment { margin: 1mm 0 0.5mm; padding: 2mm 3mm; background: #f6f7f9; border-radius: 2mm; color: #202020; }

    .evidence { margin: 0; padding: 0; list-style: none; }
    .evidence li { font-size: 8.5pt; margin: 0.6mm 0; }
    .evidence .kind { color: #666666; }
    .evidence .uri { color: #4a4a4a; }

    .empty { margin-top: 9mm; padding: 6mm; background: #f6f7f9; border-radius: 3mm; color: #4a4a4a; }
</style>
</head>
<body>

<div class="running-head">
    <table><tr>
        <td class="wordmark">Reflection Diary</td>
        <td style="text-align: right;">Exported {{ Carbon::parse($exported_at)->format('j F Y') }}</td>
    </tr></table>
</div>
<div class="running-foot">
    <table><tr>
        <td>Your record. Each score names the framework version it was given against.</td>
        <td class="page-number" style="text-align: right;"></td>
    </tr></table>
</div>

<h1>Your reflection record</h1>
<p class="meta">Exported {{ Carbon::parse($exported_at)->format('j F Y, H:i') }} UTC</p>

<div class="summary">
    <p>
        {{ $summary['reflections'] }} {{ Str::plural('reflection', $summary['reflections']) }} ·
        {{ $summary['scores'] }} {{ Str::plural('score', $summary['scores']) }} ·
        {{ $summary['files'] }} evidence {{ Str::plural('item', $summary['files']) }}
    </p>
    <p class="key">
        <span class="swatch swatch-self"></span>Self-scores are in purple. <span class="swatch swatch-counter"></span>Counter-scores, from an assessor or supervisor, are in green.
    </p>
</div>

@forelse ($reflections as $reflection)
<section class="reflection{{ $loop->first ? ' first' : '' }}">
    <div class="reflection-head">
        <h2>{{ $reflection['gig'] ?? 'Gig' }}</h2>
        <table class="sprint-line"><tr>
            <td class="sprint">Sprint {{ $reflection['sprint_ordinal'] ?? '?' }}</td>
            <td><span class="status status-{{ $reflection['status'] }}">{{ $statuses[$reflection['status']] ?? Str::ucfirst($reflection['status']) }}</span></td>
        </tr></table>
        <p class="meta">
            Scored against {{ $reflection['framework']['name'] }} ({{ $reflection['framework']['fw_key'] }}, version {{ $reflection['framework']['version'] }})
            @if ($reflection['submitted_at']) · Submitted {{ Carbon::parse($reflection['submitted_at'])->format('j F Y') }} @endif
        </p>
    </div>

    <table class="overview"><tr>
        <td class="radar-cell">
            {{-- As an image, not inline: dompdf lays inline <svg> out as text
                 but draws one handed to <img> as a data URI. --}}
            <img src="data:image/svg+xml;base64,{{ base64_encode(view('exports.radar', ['radar' => $reflection['radar']])->render()) }}"
                 width="230" height="230" alt="Radar: self against counter-score">
            <p class="legend"><span class="swatch swatch-self"></span>Self<span class="swatch swatch-counter"></span>Counter-score</p>
        </td>
        <td>
            <table class="scores">
                <thead><tr><th>Competency</th><th class="num">Self</th><th class="num">Counter</th><th class="by">By</th></tr></thead>
                <tbody>
                @foreach ($reflection['radar']['axes'] as $axis)
                    <tr>
                        {{-- SFIA's short labels are its codes: say it once. --}}
                        <td>@if ($axis['short_label'] === $axis['code']){{ $axis['code'] }}@else<span class="code">{{ $axis['code'] }}</span> · {{ $axis['short_label'] }}@endif</td>
                        <td class="num">@if ($axis['self'] !== null)<span class="mark mark-self">{{ $axis['self'] }}</span>@else<span class="mark mark-none">–</span>@endif</td>
                        <td class="num">@if ($axis['counter'] !== null)<span class="mark mark-counter">{{ $axis['counter'] }}</span>@else<span class="mark mark-none">–</span>@endif</td>
                        <td class="by">{{ $axis['counter_role'] ?? '' }}</td>
                    </tr>
                @endforeach
                </tbody>
            </table>
            <p class="meta" style="margin-top: 2mm;">Levels {{ $reflection['radar']['scale_min'] }} to {{ $reflection['radar']['scale_max'] }}. A dash is not scored yet.</p>
        </td>
    </tr></table>

    @foreach ($reflection['entries'] as $entry)
    <div class="entry">
        <table class="entry-head"><tr>
            <td><h3><span class="code">{{ $entry['competency_code'] }}</span> · {{ $entry['competency_name'] }}</h3></td>
            <td class="entry-marks">
                @foreach ($entry['scores'] as $score)
                    <span class="mark {{ ($score['scorer_class'] ?? ($score['scorer_role'] === 'student' ? 'self' : 'counter')) === 'self' ? 'mark-self' : 'mark-counter' }}">{{ $score['level_value'] }}</span>
                @endforeach
            </td>
        </tr></table>

        @if (($entry['narrative'] ?? '') === '')
            <p class="narrative none">No narrative written.</p>
        @else
            <p class="narrative">{{ $entry['narrative'] }}</p>
        @endif

        @if (count($entry['scores']))
            <p class="label">Scores</p>
            <table class="score-lines">
            @foreach ($entry['scores'] as $score)
                @php $class = ($score['scorer_class'] ?? ($score['scorer_role'] === 'student' ? 'self' : 'counter')) === 'self' ? 'mark-self' : 'mark-counter'; @endphp
                <tr>
                    <td class="mark-cell"><span class="mark {{ $class }}">{{ $score['level_value'] }}</span></td>
                    <td>
                        <span class="who">{{ $score['scorer'] }} ({{ $score['scorer_role'] }})@if ($score['scored_at']) · {{ Carbon::parse($score['scored_at'])->format('j M Y') }}@endif</span>
                        @if (($score['comment'] ?? '') !== '')
                            <p class="comment">{{ $score['comment'] }}</p>
                        @endif
                    </td>
                </tr>
            @endforeach
            </table>
        @endif

        @if (count($entry['evidence']))
            <p class="label">Evidence</p>
            <ul class="evidence">
            @foreach ($entry['evidence'] as $evidence)
                <li>{{ $evidence['label'] }} <span class="kind">({{ $evidence['kind'] }})</span>: <span class="uri">{{ $evidence['uri'] }}</span></li>
            @endforeach
            </ul>
        @endif
    </div>
    @endforeach
</section>
@empty
<p class="empty">No reflections yet. Each one you write appears here, with its scores, once it exists.</p>
@endforelse
</body>
</html>
