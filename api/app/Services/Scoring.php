<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\Level;
use App\Models\ReflectionEntry;
use App\Models\Score;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Every rule that decides whether a score may be written.
 *
 * Two endpoints write scores, the student's self-score and everyone
 * else's counter-score, and they share exactly one rule: the level has to
 * belong to the entry's competency. That check is here and is called from
 * both, because a rule with two implementations has two behaviours
 * eventually.
 */
class Scoring
{
    public function __construct(private EventLog $events) {}

    /**
     * The database cannot express this one. scores.level_id points at
     * levels, and levels point at competencies, but nothing stops a level
     * from a different competency being attached to this entry, so the
     * check has to be made in the application.
     *
     * Without it a student could score "Advanced" on Collaboration using
     * the Leadership descriptor, and the radar would show a number nobody
     * ever meant.
     */
    public function assertLevelBelongsToEntry(Level $level, ReflectionEntry $entry): void
    {
        if ($level->competency_id === $entry->competency_id) {
            return;
        }

        throw new ApiException(
            'LEVEL_NOT_IN_COMPETENCY',
            'That level belongs to a different competency.',
            [
                'entry_competency_id' => $entry->competency_id,
                'level_competency_id' => $level->competency_id,
            ],
            400,
        );
    }

    /**
     * The student's own score. PUT, so changing your mind before you
     * submit replaces the score rather than adding a second one.
     */
    public function selfScore(ReflectionEntry $entry, User $student, Level $level): Score
    {
        $this->assertLevelBelongsToEntry($level, $entry);

        return Score::updateOrCreate(
            [
                'reflection_entry_id' => $entry->id,
                'scorer_user_id' => $student->id,
                'scorer_role' => 'self',
            ],
            [
                'level_id' => $level->id,
                'scored_at' => now(),
            ],
        );
    }

    /**
     * An assessor, supervisor or employer scoring the same entry.
     *
     * @return array{Score, bool} the score, and whether it completed the reflection
     */
    public function counterScore(
        ReflectionEntry $entry,
        User $scorer,
        string $role,
        Level $level,
        ?string $comment,
    ): array {
        $reflection = $entry->reflection;

        // Submitted and nothing else. Draft is too early, and assessed is
        // too late: v_entry_score takes the most recent counter-score per
        // entry, so a score arriving after the flip would silently replace
        // the one the record was closed on. A finished radar that moves
        // afterwards is worse than a late score being refused, and the
        // reflection has already left every reviewer's queue by then.
        if ($reflection->status !== 'submitted') {
            throw new ApiException(
                'NOT_SUBMITTED',
                $reflection->status === 'draft'
                    ? 'This reflection has not been submitted yet, so there is nothing to counter-score.'
                    : 'This reflection has already been assessed. Counter-scores close with it.',
                ['status' => $reflection->status],
                409,
            );
        }

        $this->assertLevelBelongsToEntry($level, $entry);
        $this->assertCommentPresent($entry, $level, $comment);

        // One score per scorer per entry. The unique index enforces it,
        // and the envelope turns a 1062 on ak_scores into ALREADY_SCORED,
        // so two assessors racing cannot both win. There is no re-scoring
        // in the MVP: a mark, once given, stands.
        $score = Score::create([
            'reflection_entry_id' => $entry->id,
            'scorer_user_id' => $scorer->id,
            'scorer_role' => $role,
            'level_id' => $level->id,
            'comment' => $comment,
        ]);

        $this->events->record($reflection, $scorer, 'entry_counter_scored', [
            'entry_id' => $entry->id,
            'scorer_role' => $role,
            'level_value' => $level->level_value,
        ]);

        return [$score, $this->flipIfComplete($entry, $scorer)];
    }

    /**
     * A comment is required when the counter-score is below what the
     * student gave themselves, and whenever the rubric asks for one
     * regardless.
     *
     * The first is the one that matters. Being marked down without a
     * reason is the single most demoralising thing this product could do,
     * and it is cheap to make impossible.
     */
    private function assertCommentPresent(ReflectionEntry $entry, Level $level, ?string $comment): void
    {
        if (trim((string) $comment) !== '') {
            return;
        }

        if ($entry->reflection->framework->comment_required) {
            throw new ApiException(
                'COMMENT_REQUIRED',
                'This rubric requires a comment with every counter-score.',
                ['entry_id' => $entry->id],
                400,
            );
        }

        $self = $entry->scores()
            ->where('scorer_role', 'self')
            ->with('level')
            ->first();

        if ($self !== null && $level->level_value < $self->level->level_value) {
            throw new ApiException(
                'COMMENT_REQUIRED',
                'You are scoring below what the student gave themselves, so a comment is required.',
                [
                    'entry_id' => $entry->id,
                    'self_level' => $self->level->level_value,
                    'counter_level' => $level->level_value,
                ],
                400,
            );
        }
    }

    /**
     * A reflection is assessed once every entry carries at least one
     * counter-score. Derived from the rows rather than counted up as they
     * arrive, so it stays correct no matter who scores in what order.
     */
    private function flipIfComplete(ReflectionEntry $entry, User $actor): bool
    {
        $reflection = $entry->reflection;

        if ($reflection->status !== 'submitted') {
            return false;
        }

        $unscored = $reflection->entries()
            ->whereDoesntHave('scores', fn ($q) => $q->where('scorer_role', '!=', 'self'))
            ->exists();

        if ($unscored) {
            return false;
        }

        DB::transaction(function () use ($reflection, $actor) {
            $reflection->update(['status' => 'assessed']);
            $this->events->record($reflection, $actor, 'reflection_assessed', [
                'entries' => $reflection->entries()->count(),
            ]);
        });

        return true;
    }
}
