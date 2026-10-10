<?php

namespace App\Providers;

use App\Services\RoleResolver;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // One instance per request. RoleResolver memoises, and until this
        // binding existed every app(RoleResolver::class) built a fresh one,
        // so the cache never hit and GET /gigs asked the database for the
        // caller's role once per gig in the list.
        $this->app->scoped(RoleResolver::class);
    }

    public function boot(): void
    {
        // No "data" key. The contract documents bare objects and arrays,
        // frontend types are generated from it, and there is no mapping
        // layer anywhere in this project. Set globally rather than as
        // $wrap = null on each resource, because forgetting it on one new
        // resource is a shape change nobody notices until the frontend
        // breaks.
        JsonResource::withoutWrapping();

        // Everything is UTC by application convention and DATETIME(6) in
        // the schema. Serialising as ISO 8601 with a Z, rather than
        // Laravel's default "Y-m-d H:i:s", is what the contract says and
        // what Date.parse in the browser expects.
        //
        // Seconds, not microseconds, matching the example in the
        // specification. The stored precision still matters, because
        // "the most recent counter-score wins" is decided in SQL against
        // the full DATETIME(6); no client ever re-sorts on these strings.
        Date::serializeUsing(fn ($date) => $date->toIso8601ZuluString());
    }
}
