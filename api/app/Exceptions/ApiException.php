<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * A business-rule or domain failure that the client is expected to handle
 * by switching on the code. Codes are enumerated in docs/openapi.yaml and
 * docs/API-Specification.md; do not invent one without adding it there.
 *
 * The property is errorCode rather than code because Exception already
 * declares a non-readonly int $code, and PHP will not let a subclass
 * redeclare it as a readonly string. Renaming it here is better than
 * dropping readonly to work around a name clash.
 */
class ApiException extends RuntimeException
{
    /**
     * @param  array<string, mixed>  $details
     */
    public function __construct(
        public readonly string $errorCode,
        string $message,
        public readonly array $details = [],
        public readonly int $status = 400,
    ) {
        parent::__construct($message);
    }
}
