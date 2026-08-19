<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreExportRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * JSON only for now. The schema and the exports.format constraint
     * both allow pdf, and the contract describes it, but rendering one
     * needs dompdf and adding a package is the team's call rather than
     * something to slip in. Asking for pdf is refused clearly instead of
     * being accepted and quietly producing JSON.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'format' => ['required', 'in:json'],
            'reflection_id' => ['nullable', 'uuid', 'exists:reflections,id'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'format.in' => 'Only json exports are available yet. PDF needs a renderer the project has not added.',
        ];
    }
}
