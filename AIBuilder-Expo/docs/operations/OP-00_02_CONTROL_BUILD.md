# OP-00.02 — Контрольная сборка

Дата: 2026-09-24
База: AIBuilder-Expo-v1_3_374-v1.zip
Проектная версия: 1.3.374

## Цель
Проверить, что исходный AI Builder проходит контрольную сборку до начала архитектурных изменений.

## Что выполнено
Контрольный запуск выполнен в изолированной копии архива командой:

```bash
bash ./gradlew --version
```

Корневой `gradlew` проекта определяет отсутствие `android/gradlew` и запускает подготовку Expo через канонический `pnpm`.

## Результат
Контрольная сборка в текущем изолированном runner-е **не завершена**.

Причина не в исходниках проекта: в runner установлен `pnpm 0.32.0`, тогда как проект требует `pnpm 9.15.0`. Попытка получить канонический `pnpm 9.15.0` через Corepack также не выполнена из-за отсутствия сетевого доступа к `registry.npmjs.org` (`EAI_AGAIN`).

Фрагмент результата:

```text
[expo-gradlew] android/gradlew missing — running Expo prebuild on the CI runner…
[expo-gradlew] ERROR: pnpm 9.15.0 is required; npm fallback is disabled because pnpm-lock.yaml is the canonical lockfile
```

## Важно
- Исходный код не изменён.
- `package.json` не изменён.
- `pnpm-lock.yaml` не изменён.
- compilation settings не изменены.
- Никакие версии Gradle/AGP/SDK/Java/NDK не заменялись.
- `packageManager` не удалялся.
- `android/local.properties` не создавался.
- `android/gradle.properties` не создавался и не переписывался.

## Статус операции
`CONTROL_BUILD_ENV_BLOCKED`

Это означает: операция 0.2 проверена, но положительный результат контрольной сборки в данном runner-е получить нельзя без доступного `pnpm 9.15.0` и зависимостей проекта.

Следующую операцию не выполнять автоматически.
