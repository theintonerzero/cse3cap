{{-- The student's record, leaving the system. Everything on this page has
     to make sense without the application: the framework version the
     scores were given against, who gave them, and when. --}}
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
    @page { margin: 18mm 16mm; }
    body { font-family: 'DejaVu Sans', sans-serif; font-size: 10pt; color: #222222; }
    h1 { font-size: 18pt; margin: 0 0 2mm; }
    h2 { font-size: 13pt; margin: 8mm 0 2mm; page-break-after: avoid; }
    h3 { font-size: 11pt; margin: 5mm 0 1mm; page-break-after: avoid; }
    .meta { color: #666666; font-size: 9pt; }
    .reflection { page-break-before: always; }
    .reflection.first { page-break-before: auto; }
    .radar { text-align: center; margin: 4mm 0; }
    table { width: 100%; border-collapse: collapse; margin: 2mm 0 4mm; }
    th, td { border: 0.5pt solid #cccccc; padding: 1.5mm 2mm; text-align: left; vertical-align: top; }
    th { background: #f2f2f2; font-weight: bold; }
    tr { page-break-inside: avoid; }
    h3 + .narrative { page-break-before: avoid; }
    .narrative { white-space: pre-wrap; margin: 1mm 0 2mm; }
    .legend span { display: inline-block; width: 3mm; height: 3mm; margin-right: 1.5mm; vertical-align: middle; }
    .self { background: #3b6ea5; } .counter { background: #c0662b; }
    ul { margin: 0 0 2mm 4mm; padding: 0; }
</style>
</head>
<body>
<h1>Reflection Diary</h1>
<p class="meta">
    Exported {{ \Carbon\Carbon::parse($exported_at)->format('j F Y, H:i') }} UTC ·
    {{ $summary['reflections'] }} {{ \Illuminate\Support\Str::plural('reflection', $summary['reflections']) }} ·
    {{ $summary['scores'] }} scores · {{ $summary['files'] }} evidence items
</p>

@forelse ($reflections as $reflection)
<section class="reflection{{ $loop->first ? ' first' : '' }}">
    <h2>{{ $reflection['gig'] ?? 'Gig' }} — Sprint {{ $reflection['sprint_ordinal'] ?? '?' }}</h2>
    <p class="meta">
        Scored against {{ $reflection['framework']['name'] }}
        ({{ $reflection['framework']['fw_key'] }}, version {{ $reflection['framework']['version'] }}) ·
        status {{ $reflection['status'] }}
        @if ($reflection['submitted_at']) · submitted {{ \Carbon\Carbon::parse($reflection['submitted_at'])->format('j F Y') }} @endif
    </p>

    <div class="radar">
        {{-- As an image, not inline: dompdf lays inline <svg> out as text
             but draws one handed to <img> as a data URI. --}}
        <img src="data:image/svg+xml;base64,{{ base64_encode(view('exports.radar', ['radar' => $reflection['radar']])->render()) }}"
             width="300" height="300" alt="Radar: self against counter-score">
        <p class="meta legend"><span class="self"></span>Self &nbsp; <span class="counter"></span>Counter-score</p>
    </div>

    <table>
        <thead><tr><th>Competency</th><th>Self</th><th>Counter</th><th>By</th></tr></thead>
        <tbody>
        @foreach ($reflection['radar']['axes'] as $axis)
            <tr>
                <td>{{ $axis['code'] }} · {{ $axis['short_label'] }}</td>
                <td>{{ $axis['self'] ?? '—' }}</td>
                <td>{{ $axis['counter'] ?? '—' }}</td>
                <td>{{ $axis['counter_role'] ?? '' }}</td>
            </tr>
        @endforeach
        </tbody>
    </table>

    @foreach ($reflection['entries'] as $entry)
        <h3>{{ $entry['competency_code'] }} · {{ $entry['competency_name'] }}</h3>
        <p class="narrative">{{ $entry['narrative'] ?: 'No narrative written.' }}</p>

        @if (count($entry['evidence']))
            <ul>
            @foreach ($entry['evidence'] as $evidence)
                <li>{{ $evidence['label'] }} ({{ $evidence['kind'] }}): {{ $evidence['uri'] }}</li>
            @endforeach
            </ul>
        @endif

        @if (count($entry['scores']))
            <table>
                <thead><tr><th>Scorer</th><th>Level</th><th>Comment</th><th>When</th></tr></thead>
                <tbody>
                @foreach ($entry['scores'] as $score)
                    <tr>
                        <td>{{ $score['scorer'] }} ({{ $score['scorer_role'] }})</td>
                        <td>{{ $score['level_value'] }}</td>
                        <td>{{ $score['comment'] ?? '' }}</td>
                        <td>{{ $score['scored_at'] ? \Carbon\Carbon::parse($score['scored_at'])->format('j M Y') : '' }}</td>
                    </tr>
                @endforeach
                </tbody>
            </table>
        @endif
    @endforeach
</section>
@empty
<p>No reflections yet.</p>
@endforelse
</body>
</html>
