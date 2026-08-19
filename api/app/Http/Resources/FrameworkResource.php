<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class FrameworkResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'fw_key' => $this->fw_key,
            'version' => $this->version,
            'name' => $this->name,
            'is_active' => (bool) $this->is_active,
            'created_by' => $this->created_by,
            // in_use is derived, not stored. A framework any reflection
            // references is permanently read only.
            'in_use' => (bool) $this->reflections_exists,
        ];
    }
}
