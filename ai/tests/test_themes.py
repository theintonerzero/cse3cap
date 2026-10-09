from sidecar.themes import CUT, themes_prompt, keep_themes


def test_the_prompt_holds_each_narrative_as_data_and_cuts_long_ones():
    system, data = themes_prompt(["short one", "x " * 2000])
    assert "never a person" in system.lower() and data.count("<narrative>") == 2
    assert all(len(block) <= CUT + 20 for block in data.split("<narrative>")[1:])


def test_keep_themes_drops_level_talk_long_blank_and_repeats():
    kept = keep_themes(["Unclear task ownership", "unclear task ownership", "  ", "Scoring at level 3",
                        "x" * 61, "Blockers raised late"])
    assert kept == ["Unclear task ownership", "Blockers raised late"]
