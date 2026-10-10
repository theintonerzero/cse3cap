import pytest

from tests.conftest import refuse_unsafe


@pytest.mark.parametrize("url", [
    "mysql://diary_ai:x@rddb.darkovski.dev:3306/diary_ai",
    "mysql://root:test@127.0.0.1:3307/diary_ai",          # a tunnel to the shared server looks like this
    "mysql://root:test@10.0.0.5:3306/reflection_diary",
])
def test_a_database_not_named_for_tests_is_refused(url):
    with pytest.raises(pytest.fail.Exception):
        refuse_unsafe(url)


def test_a_test_database_is_allowed():
    refuse_unsafe("mysql://root:test@127.0.0.1:3307/diary_ai_test")
