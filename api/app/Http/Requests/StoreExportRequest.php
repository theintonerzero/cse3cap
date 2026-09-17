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
     * Both formats the schema allows, pdf per ADR #39.
     *
     * reflection_id is checked for shape only. Whether it exists and
     * whether it is the caller's are both the controller's 404, so a
     * made-up id and someone else's id read the same from outside.
     * An `exists` rule here would answer one with a 400 and the other
     * with a 404, which tells a stranger which ids are real.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'format' => ['required', 'in:json,pdf'],
            'reflection_id' => ['nullable', 'uuid'],
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
