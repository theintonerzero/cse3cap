<?php

namespace Tests\Unit;

use App\Exports\RadarPolygon;
use PHPUnit\Framework\TestCase;

class RadarPolygonTest extends TestCase
{
    public function test_the_first_axis_points_straight_up(): void
    {
        $radar = new RadarPolygon(axes: 4, scaleMin: 1, scaleMax: 4);

        $end = $radar->axisEnd(0);
        $this->assertEqualsWithDelta(150.0, $end['x'], 0.001);
        $this->assertEqualsWithDelta(40.0, $end['y'], 0.001);
    }

    public function test_the_maximum_reaches_the_rim_and_the_minimum_the_centre(): void
    {
        $radar = new RadarPolygon(axes: 4, scaleMin: 1, scaleMax: 4);

        // 4 up, 1 right, 4 down, 1 left. Minimum is the centre, not a dot short of it.
        $this->assertSame('150,40 150,150 150,260 150,150', $radar->points([4, 1, 4, 1]));
    }

    public function test_an_unscored_axis_sits_at_the_centre(): void
    {
        $radar = new RadarPolygon(axes: 3, scaleMin: 0, scaleMax: 2);

        $points = explode(' ', $radar->points([2, null, null]));
        $this->assertSame('150,40', $points[0]);
        $this->assertSame('150,150', $points[1]);
        $this->assertSame('150,150', $points[2]);
    }

    public function test_a_ring_is_a_closed_regular_polygon_at_that_level(): void
    {
        $radar = new RadarPolygon(axes: 6, scaleMin: 1, scaleMax: 4);

        $this->assertCount(6, explode(' ', $radar->ring(2)));
        $this->assertSame($radar->ring(4), $radar->points([4, 4, 4, 4, 4, 4]));
    }

    public function test_labels_anchor_by_side(): void
    {
        $radar = new RadarPolygon(axes: 4, scaleMin: 1, scaleMax: 4);

        $this->assertSame('middle', $radar->labelAt(0)['anchor']);  // top
        $this->assertSame('start', $radar->labelAt(1)['anchor']);   // right
        $this->assertSame('end', $radar->labelAt(3)['anchor']);     // left
    }
}
