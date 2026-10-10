<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS)
    |--------------------------------------------------------------------------
    |
    | The frontend is a separate Vite dev server on another port, so every
    | call it makes is cross-origin. Laravel's published default allows any
    | origin; this API returns one student's reflective record, so the
    | origin is named instead. FRONTEND_URL lives in .env.example and points
    | at http://localhost:5173.
    |
    | supports_credentials stays false. Auth is a bearer token in a header,
    | not a cookie, so the browser has no credentials to send and asking for
    | them would rule out ever widening allowed_origins safely.
    |
    */

    'paths' => ['api/*'],

    'allowed_methods' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

    'allowed_origins' => array_filter([
        env('FRONTEND_URL', 'http://localhost:5173'),
    ]),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['Accept', 'Authorization', 'Content-Type', 'X-Requested-With'],

    'exposed_headers' => [],

    'max_age' => 3600,

    'supports_credentials' => false,

];
