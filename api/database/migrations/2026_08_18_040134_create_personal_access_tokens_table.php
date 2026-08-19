<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Sanctum's table, published rather than left in vendor because it needs
 * two changes to work here and vendor is not ours to edit.
 *
 * The stock version uses morphs('tokenable'), which is a bigint unsigned.
 * Our users have char(36) uuid keys, so MySQL truncates the id on insert
 * and reports it as a warning, 1265, not an error. Every token then points
 * at nothing and every authenticated request fails as unauthenticated.
 *
 * The stock version also uses TIMESTAMP columns, which CLAUDE.md forbids
 * outright: they stop working in January 2038 and this product is a record
 * meant to outlive that. DATETIME(6) throughout, matching the rest of the
 * schema.
 *
 * The primary key stays an auto-increment bigint, unlike every table in
 * db/01-schema.sql. It is Sanctum's own bookkeeping, it never appears in a
 * URL, an export or the API, and changing it would mean substituting
 * Sanctum's model for one of ours to buy nothing.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('personal_access_tokens', function (Blueprint $table) {
            $table->id();
            $table->uuidMorphs('tokenable');
            $table->text('name');
            $table->string('token', 64)->unique();
            $table->text('abilities')->nullable();
            $table->dateTime('last_used_at', 6)->nullable();
            $table->dateTime('expires_at', 6)->nullable()->index();
            $table->dateTime('created_at', 6)->nullable();
            $table->dateTime('updated_at', 6)->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('personal_access_tokens');
    }
};
