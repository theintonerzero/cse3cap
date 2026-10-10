<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * The autosave endpoint. The frontend debounces, so this is called often
 * and with partial text; emptiness is the submit gate's problem, not
 * validation's.
 */
class UpdateEntryRequest extends FormRequest
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
        return ['narrative' => ['present', 'nullable', 'string', 'max:20000']];
    }
}
