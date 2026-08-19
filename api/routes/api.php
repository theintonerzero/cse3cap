<?php

use App\Http\Controllers\Api\V1\AnalyticsController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\CompetencyController;
use App\Http\Controllers\Api\V1\EntryController;
use App\Http\Controllers\Api\V1\EvidenceController;
use App\Http\Controllers\Api\V1\ExportController;
use App\Http\Controllers\Api\V1\FrameworkAssignmentController;
use App\Http\Controllers\Api\V1\FrameworkController;
use App\Http\Controllers\Api\V1\GigController;
use App\Http\Controllers\Api\V1\LevelController;
use App\Http\Controllers\Api\V1\ReflectionController;
use App\Http\Controllers\Api\V1\ReviewQueueController;
use App\Http\Controllers\Api\V1\ScoreController;
use Illuminate\Support\Facades\Route;

// Every route is authenticated. There is no login endpoint in the MVP:
// three tokens are seeded and identity belongs to the host platform.
Route::prefix('v1')->middleware('auth:sanctum')->group(function () {
    Route::get('/auth/me', [AuthController::class, 'me']);

    Route::get('/gigs', [GigController::class, 'index']);
    Route::get('/gigs/{gig}', [GigController::class, 'show']);

    Route::get('/frameworks', [FrameworkController::class, 'index']);
    Route::get('/frameworks/{framework}', [FrameworkController::class, 'show']);

    // Copy-then-edit. There is no route that creates a framework from
    // nothing, and none that deletes one: a rubric someone was scored
    // against has to stay readable for as long as the score does.
    Route::post('/frameworks', [FrameworkController::class, 'store']);
    Route::patch('/frameworks/{framework}', [FrameworkController::class, 'update']);
    Route::patch('/competencies/{competency}', [CompetencyController::class, 'update']);
    Route::patch('/levels/{level}', [LevelController::class, 'update']);

    Route::post('/framework-assignments', [FrameworkAssignmentController::class, 'store']);

    // The record itself.
    Route::get('/reflections', [ReflectionController::class, 'index']);
    Route::post('/reflections', [ReflectionController::class, 'store']);
    Route::get('/reflections/{reflection}', [ReflectionController::class, 'show']);
    Route::post('/reflections/{reflection}/submit', [ReflectionController::class, 'submit']);
    Route::delete('/reflections/{reflection}', [ReflectionController::class, 'destroy']);
    Route::get('/reflections/{reflection}/events', [ReflectionController::class, 'events']);

    Route::patch('/entries/{entry}', [EntryController::class, 'update']);
    Route::post('/entries/{entry}/evidence', [EvidenceController::class, 'store']);
    Route::delete('/evidence/{evidence}', [EvidenceController::class, 'destroy']);

    // Scoring. PUT for the student because changing your mind before
    // submitting replaces the score; POST for everyone else because a
    // counter-score, once given, stands.
    Route::put('/entries/{entry}/scores/self', [ScoreController::class, 'self']);
    Route::post('/entries/{entry}/scores', [ScoreController::class, 'store']);
    Route::get('/review-queue', [ReviewQueueController::class, 'index']);

    // Analytics. Always the caller's own record: none of these takes a
    // user id, because the permission matrix gives every role "own".
    Route::get('/me/radar', [AnalyticsController::class, 'radar']);
    Route::get('/me/progress', [AnalyticsController::class, 'progress']);
    Route::get('/me/calibration', [AnalyticsController::class, 'calibration']);
    Route::get('/me/coverage', [AnalyticsController::class, 'coverage']);

    // Export. The exports row is the job record, so status is read from
    // it rather than inferred, and the download runs the policy on every
    // fetch rather than handing out a link that outlives it.
    Route::post('/exports', [ExportController::class, 'store']);
    Route::get('/exports', [ExportController::class, 'index']);
    Route::get('/exports/{export}', [ExportController::class, 'show']);
    Route::get('/exports/{export}/download', [ExportController::class, 'download']);
});
