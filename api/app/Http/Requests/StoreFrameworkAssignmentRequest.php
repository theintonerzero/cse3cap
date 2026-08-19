<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreFrameworkAssignmentRequest extends FormRequest
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
            'framework_id' => ['required', 'uuid', 'exists:frameworks,id'],
            'gig_id' => ['required', 'uuid', 'exists:gigs,id'],
        ];
    }
}
