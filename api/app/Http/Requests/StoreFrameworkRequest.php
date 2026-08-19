<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreFrameworkRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;   // FrameworkPolicy::create, called in the controller
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'based_on_framework_id' => ['required', 'uuid', 'exists:frameworks,id'],
            'name' => ['required', 'string', 'max:191'],
        ];
    }
}
