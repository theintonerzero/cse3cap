<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Shape only. Whether the level belongs to this entry's competency, and
 * whether a comment is required, are business rules and live in Scoring.
 */
class StoreScoreRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'level_id' => ['required', 'uuid', 'exists:levels,id'],
            'comment' => ['sometimes', 'nullable', 'string', 'max:4000'],
        ];
    }
}
