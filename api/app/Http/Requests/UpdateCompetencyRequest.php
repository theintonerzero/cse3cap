<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateCompetencyRequest extends FormRequest
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
            // Short enough to fit a radar axis without being truncated
            // into nonsense at render time.
            'short_label' => ['sometimes', 'nullable', 'string', 'max:32'],
        ];
    }
}
