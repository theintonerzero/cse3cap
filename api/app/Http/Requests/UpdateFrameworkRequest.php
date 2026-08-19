<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Rename and file policy only. Adding or removing competencies, and
 * changing level counts, are out of scope: a rubric with a different
 * shape is a different rubric.
 */
class UpdateFrameworkRequest extends FormRequest
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
            'name' => ['sometimes', 'string', 'max:191'],
            'comment_required' => ['sometimes', 'boolean'],
            'evidence_required' => ['sometimes', 'boolean'],
            'accepted_file_types' => ['sometimes', 'nullable', 'array'],
            'accepted_file_types.*' => ['string', 'max:16'],
            'max_file_bytes' => ['sometimes', 'integer', 'min:1024', 'max:104857600'],
        ];
    }
}
