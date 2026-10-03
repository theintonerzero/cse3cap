# Dependency register

Every dependency the Reflection Diary ships or builds with, its licence, and its known
advisories. **Generated, not written:** `./run deps` (`scripts/dependency-register.py`)
rebuilds this file from `composer licenses`, `composer audit`, `web/package-lock.json` and
`npm audit`. Do not edit it by hand. Regenerate and commit it when a dependency changes.

| | |
| --- | --- |
| Generated | 2026-10-03 08:29 UTC |
| Commit | `aec4118` |
| Tools | PHP 8.5.9, Composer version 2.10.2, Node v26.7.0, npm 11.19.0 |
| Packages | 117 Composer (12 direct), 116 npm (13 direct) |
| Advisories | none |

Why each direct dependency is here, and which ones were deliberately not taken, is ADR #31
and the stack ADRs in `docs/adr/architecture-decision-records.md`.

## Known advisories

None at the time of generation.

## Licences

| Licence | Packages |
| --- | --- |
| MIT | 166 |
| BSD-3-Clause | 31 |
| ISC | 12 |
| MPL-2.0 | 12 |
| Apache-2.0 | 6 |
| BSD-3-Clause OR GPL-2.0-only OR GPL-3.0-only | 2 |
| LGPL-2.1 | 1 |
| LGPL-2.1-or-later | 1 |
| LGPL-3.0-or-later | 1 |
| MIT AND ISC | 1 |

**Not on the permissive list, so a person should check each one:**

| Package | Licence | Ecosystem |
| --- | --- | --- |
| `dompdf/dompdf` | LGPL-2.1 | Composer |
| `dompdf/php-font-lib` | LGPL-2.1-or-later | Composer |
| `dompdf/php-svg-lib` | LGPL-3.0-or-later | Composer |
| `lightningcss` | MPL-2.0 | npm |
| `lightningcss-android-arm64` | MPL-2.0 | npm |
| `lightningcss-darwin-arm64` | MPL-2.0 | npm |
| `lightningcss-darwin-x64` | MPL-2.0 | npm |
| `lightningcss-freebsd-x64` | MPL-2.0 | npm |
| `lightningcss-linux-arm-gnueabihf` | MPL-2.0 | npm |
| `lightningcss-linux-arm64-gnu` | MPL-2.0 | npm |
| `lightningcss-linux-arm64-musl` | MPL-2.0 | npm |
| `lightningcss-linux-x64-gnu` | MPL-2.0 | npm |
| `lightningcss-linux-x64-musl` | MPL-2.0 | npm |
| `lightningcss-win32-arm64-msvc` | MPL-2.0 | npm |
| `lightningcss-win32-x64-msvc` | MPL-2.0 | npm |

The permissive list is in `scripts/dependency-register.py`: 0BSD, Apache-2.0, BSD-2-Clause, BSD-3-Clause, BlueOak-1.0.0, CC-BY-4.0, CC0-1.0, ISC, MIT, MIT-0, Python-2.0, Unlicense.

## Direct dependencies: Composer (api/)

| Package | Constraint | Installed | Licence | Dev only |
| --- | --- | --- | --- | --- |
| `dompdf/dompdf` | `^3.1` | v3.1.6 | LGPL-2.1 | no |
| `fakerphp/faker` | `^1.23` | v1.24.1 | MIT | yes |
| `laravel/framework` | `^13.17` | v13.34.0 | MIT | no |
| `laravel/pail` | `^1.2.5` | v1.2.7 | MIT | yes |
| `laravel/pao` | `^1.0.6` | v1.1.5 | MIT | yes |
| `laravel/pint` | `^1.27` | v1.32.1 | MIT | yes |
| `laravel/sanctum` | `^4.0` | v4.3.3 | MIT | no |
| `laravel/tinker` | `^3.0` | v3.0.2 | MIT | no |
| `mockery/mockery` | `^1.6` | 1.6.15 | BSD-3-Clause | yes |
| `nunomaduro/collision` | `^8.6` | v8.9.5 | MIT | yes |
| `php` | `^8.3` | platform | n/a | no |
| `phpunit/phpunit` | `^12.5.12` | 12.5.33 | BSD-3-Clause | yes |

## Direct dependencies: npm (web/)

| Package | Constraint | Installed | Licence | Dev only |
| --- | --- | --- | --- | --- |
| `@playwright/test` | `1.63.0` | 1.63.0 | Apache-2.0 | yes |
| `@types/node` | `^26.6.3` | 26.6.3 | MIT | yes |
| `@types/react` | `^19.3.0` | 19.3.0 | MIT | yes |
| `@types/react-dom` | `^19.3.0` | 19.3.0 | MIT | yes |
| `@vitejs/plugin-react` | `^6.1.1` | 6.1.1 | MIT | yes |
| `oxlint` | `^1.86.0` | 1.86.0 | MIT | yes |
| `prettier` | `^3.9.9` | 3.9.9 | MIT | yes |
| `react` | `^19.3.0` | 19.3.0 | MIT | no |
| `react-dom` | `^19.3.0` | 19.3.0 | MIT | no |
| `react-router` | `8.4.0` | 8.4.0 | MIT | no |
| `recharts` | `^3.10.1` | 3.10.1 | MIT | no |
| `typescript` | `~6.0.2` | 6.0.3 | Apache-2.0 | yes |
| `vite` | `^8.3.1` | 8.3.1 | MIT | yes |

Transitive packages are counted above and listed in `api/composer.lock` and
`web/package-lock.json`, which are the record of exactly what is installed.
