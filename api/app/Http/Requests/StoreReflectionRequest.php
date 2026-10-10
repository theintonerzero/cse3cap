<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreReflectionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Both are nullable here on purpose. "Neither was given" is a business
     * rule with its own error code, CONTEXT_REQUIRED, and it is decided in
     * ReflectionCreator alongside the rest of context resolution rather
     * than split between here and there.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'gig_id' => ['nullable', 'uuid', 'exists:gigs,id'],
            'sprint_id' => ['nullable', 'uuid', 'exists:sprints,id'],
        ];
    }
}
