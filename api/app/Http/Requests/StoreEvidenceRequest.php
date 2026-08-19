<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Two shapes through one endpoint: a link as JSON, or a file as multipart.
 * The type and size rules that depend on the framework are applied in the
 * controller, because they are the rubric's policy rather than the
 * request's shape.
 */
class StoreEvidenceRequest extends FormRequest
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
            'kind' => ['required_without:file', 'in:link'],
            'label' => ['required', 'string', 'max:255'],
            'uri' => ['required_if:kind,link', 'nullable', 'url', 'max:2048'],
            'file' => ['required_without:kind', 'file'],
        ];
    }
}
