<?php

use App\Exceptions\ApiException;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // There is no login route to send a guest to, and there never will
        // be: authentication belongs to the host platform and the MVP uses
        // seeded bearer tokens. Laravel's default redirects an
        // unauthenticated caller to route('login') unless the request asked
        // for JSON, so a plain curl at a guarded endpoint raised
        // RouteNotFoundException and came back 500 instead of 401. Passing
        // null leaves the AuthenticationException for the renderer.
        $middleware->redirectGuestsTo(null);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // An API caller is anything under /api, plus anything that asked
        // for JSON. Testing expectsJson() alone is not enough: a plain
        // curl with no Accept header would fall through to Laravel's HTML
        // error page, and the test suite would never notice because
        // getJson() always sets the header.
        $wantsJson = fn (Request $request): bool => $request->is('api/*') || $request->expectsJson();

        $exceptions->shouldRenderJsonWhen($wantsJson);

        // One envelope for every non-2xx response. Registered centrally so
        // that no controller can bypass it by returning its own shape.
        // details is cast to an object so that an empty one serialises as
        // {} and not as []. PHP cannot tell the two apart, the contract
        // says object, and the generated TypeScript type is
        // Record<string, unknown>, which an array does not satisfy.
        $envelope = fn (string $code, string $message, array $details, int $status) => response()->json([
            'error' => [
                'code' => $code,
                'message' => $message,
                'details' => (object) $details,
            ],
        ], $status);

        $exceptions->render(fn (ApiException $e) => $envelope($e->errorCode, $e->getMessage(), $e->details, $e->status));

        $exceptions->render(function (ValidationException $e, Request $request) use ($envelope, $wantsJson) {
            // 400, not Laravel's 422. The contract has one status for a
            // rejected payload and does not distinguish shape from rule.
            return $wantsJson($request)
                ? $envelope('VALIDATION_FAILED', 'The request payload is invalid.', $e->errors(), 400)
                : null;
        });

        $exceptions->render(function (AuthenticationException $e, Request $request) use ($envelope, $wantsJson) {
            return $wantsJson($request)
                ? $envelope('UNAUTHENTICATED', 'A valid bearer token is required.', [], 401)
                : null;
        });

        // An AuthorizationException with no status attached, which is what
        // a plain `return false` from a policy produces.
        $exceptions->render(function (AuthorizationException $e, Request $request) use ($envelope, $wantsJson) {
            return $wantsJson($request)
                ? $envelope('ROLE_FORBIDDEN', 'Your role on this gig does not permit that.', [], 403)
                : null;
        });

        // Everything that arrives already carrying a status. This covers
        // more than it looks: a missing route throws NotFoundHttpException,
        // and a policy that denied as not-found is converted to a bare
        // HttpException(404) by prepareException, which Laravel runs
        // *before* these callbacks. Matching on the interface rather than
        // on the concrete class is what keeps the second case in the
        // envelope instead of falling through to Laravel's own JSON.
        //
        // 404 says "no such thing, or it is not yours" and says it the same
        // way for both, so the status code cannot be used to discover which
        // resources exist.
        $exceptions->render(function (HttpExceptionInterface $e, Request $request) use ($envelope, $wantsJson) {
            if (! $wantsJson($request)) {
                return null;
            }

            return match ($e->getStatusCode()) {
                401 => $envelope('UNAUTHENTICATED', 'A valid bearer token is required.', [], 401),
                403 => $envelope('ROLE_FORBIDDEN', 'Your role on this gig does not permit that.', [], 403),
                404 => $envelope('NOT_FOUND', 'No such resource, or it is not yours.', [], 404),
                default => null,
            };
        });

        $exceptions->render(function (ModelNotFoundException $e, Request $request) use ($envelope, $wantsJson) {
            return $wantsJson($request)
                ? $envelope('NOT_FOUND', 'No such resource, or it is not yours.', [], 404)
                : null;
        });

        // Unique indexes are where the database enforces rules the
        // contract also states. Each one a caller can reach through
        // ordinary use maps to one error code, and the mapping lives here
        // because no application code raises 1062: MySQL does.
        //
        // An unmapped 1062 is a bug in ours, not a client error, so it
        // stays a 500 rather than being dressed up as a conflict.
        $duplicates = [
            'ak_reflections_context' => ['DUPLICATE_REFLECTION', 'A reflection already exists for that context.'],
            'ak_fw_assignments' => ['DUPLICATE_ASSIGNMENT', 'This gig already has a rubric, and a gig is scored against one.'],
            'ak_scores' => ['ALREADY_SCORED', 'You have already scored this entry.'],
        ];

        $exceptions->render(function (QueryException $e, Request $request) use ($envelope, $wantsJson, $duplicates) {
            if (! $wantsJson($request)) {
                return null;
            }

            $message = $e->getMessage();

            if (($e->errorInfo[1] ?? null) !== 1062 && ! str_contains($message, '1062 Duplicate entry')) {
                return null;
            }

            // MySQL names the index it caught, as
            // "for key 'reflections.ak_reflections_context'".
            foreach ($duplicates as $index => [$code, $text]) {
                if (str_contains($message, $index)) {
                    return $envelope($code, $text, [], 409);
                }
            }

            return null;
        });
    })->create();
