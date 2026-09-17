{{-- The radar, drawn server-side: dompdf runs no JavaScript, so the
     recharts component cannot be reused. Same axes, same scale, same
     starting angle, so the PDF and the screen draw the same shape.

     Raw hex is deliberate. The no-hex rule belongs to web/ and its
     tokens.css; a PDF has no stylesheet to inherit from. --}}
@php
    $axes = $radar['axes'];
    $n = count($axes);
    $geometry = new \App\Exports\RadarPolygon($n, $radar['scale_min'], $radar['scale_max']);
    $counter = array_column($axes, 'counter');
@endphp
<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
    @for ($level = $radar['scale_min'] + 1; $level <= $radar['scale_max']; $level++)
        <polygon points="{{ $geometry->ring($level) }}" fill="none" stroke="#cccccc" stroke-width="0.6" />
    @endfor
    @foreach ($axes as $i => $axis)
        @php $end = $geometry->axisEnd($i); $label = $geometry->labelAt($i); @endphp
        <line x1="150" y1="150" x2="{{ $end['x'] }}" y2="{{ $end['y'] }}" stroke="#cccccc" stroke-width="0.6" />
        <text x="{{ $label['x'] }}" y="{{ $label['y'] }}" text-anchor="{{ $label['anchor'] }}"
              dominant-baseline="middle" font-size="11" fill="#333333">{{ $axis['short_label'] }}</text>
    @endforeach
    <polygon points="{{ $geometry->points(array_column($axes, 'self')) }}"
             fill="#3b6ea5" fill-opacity="0.25" stroke="#3b6ea5" stroke-width="1.5" />
    @if (array_filter($counter, fn ($v) => $v !== null))
        <polygon points="{{ $geometry->points($counter) }}"
                 fill="#c0662b" fill-opacity="0.25" stroke="#c0662b" stroke-width="1.5" />
    @endif
</svg>
