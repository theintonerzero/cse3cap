<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use RuntimeException;

abstract class TestCase extends BaseTestCase
{
    /**
     * The shared database. Five people work against it and it holds the
     * only copy of the reviewed schema.
     */
    private const PROTECTED_DATABASE = 'reflection_diary';

    /**
     * RefreshDatabase drops tables but leaves views behind unless told
     * otherwise, and this schema has five of them. The second test in a
     * run then re-executes the baseline against surviving views and dies
     * on 1050, which reads as a migration bug rather than a test-harness
     * setting.
     */
    protected $dropViews = true;

    /**
     * Refuse to run against the shared database.
     *
     * RefreshDatabase runs migrate:fresh, which drops every table before
     * rebuilding it. Pointed at reflection_diary that takes out everyone's
     * environment, and the only thing standing between here and there is
     * one environment variable. phpunit.xml sets DB_CONNECTION=mysql_test
     * and api/.env sets DB_TEST_DATABASE, so a typo in either, or an
     * inherited shell variable, is enough.
     *
     * This is deliberately in setUp rather than a config default: a
     * default can be overridden without noticing, and by the time you
     * notice the tables are gone.
     */
    protected function setUp(): void
    {
        parent::setUp();

        $connection = config('database.default');
        $database = config("database.connections.{$connection}.database");

        if ($database === self::PROTECTED_DATABASE) {
            throw new RuntimeException(
                "The test suite is pointed at '".self::PROTECTED_DATABASE."', the shared database. "
                .'Refusing to run: RefreshDatabase would drop it for the whole team. '
                .'Set DB_TEST_DATABASE in api/.env to your own reflection_diary_test_* database '
                .'and check that DB_CONNECTION is not overridden in your shell.'
            );
        }
    }
}
