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
     * Both formats the schema allows, pdf per ADR #39. A named reflection has to exist;
     * whether it is the caller's is the controller's 404, not this
     * request's 400, so the two stay indistinguishable from outside.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'format' => ['required', 'in:json,pdf'],
            'reflection_id' => ['nullable', 'uuid', 'exists:reflections,id'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'format.in' => 'Exports are json or pdf.',
        ];
    }
}
