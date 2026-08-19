<?php

namespace App\Services;

use App\Models\Event;
use App\Models\Reflection;
use App\Models\User;

/**
 * Append-only history. The History sheet reads this, and notifications are
 * derived from it rather than stored separately, so an event that is not
 * written here did not happen as far as the product is concerned.
 */
class EventLog
{
    /**
     * @param  array<string, mixed>  $metadata
     */
    public function record(Reflection $reflection, ?User $actor, string $type, array $metadata = []): Event
    {
        return Event::create([
            'reflection_id' => $reflection->id,
            'actor_user_id' => $actor?->id,
            'event_type' => $type,
            'metadata' => $metadata,
        ]);
    }
}
