<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\MeResource;
use Illuminate\Http\Request;

class AuthController extends Controller
{
    public function me(Request $request): MeResource
    {
        return new MeResource(
            $request->user()->load('participations.gig')
        );
    }
}
