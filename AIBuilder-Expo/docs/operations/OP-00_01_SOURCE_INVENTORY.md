# AI Builder — операция 0.1

## Цель
Зафиксировать фактическую исходную точку проекта перед началом внедрения архитектуры AIBuilderTermux HOME.

## Исходный архив
- Базовый архив: `AIBuilder-Expo-v1_3_374.zip`
- Версия приложения из `package.json`: `1.3.374`
- Архив этой операции: `AIBuilder-Expo-v1_3_374-v1.zip`
- Номер операции: `0.1`

## Найденная структура сборки
- Проект является Expo managed/source-проектом.
- Каталог `android/` в исходном архиве отсутствует.
- Корневой `gradlew` является CBE/CI shim и при отсутствии `android/gradlew` запускает Expo prebuild, после чего передаёт аргументы в сгенерированный `android/gradlew`.
- Канонический lockfile: `pnpm-lock.yaml`.
- В `package.json` зафиксирован `packageManager: pnpm@9.15.0`.
- Версия приложения берётся из `package.json` в `app.config.ts`.
- Android package: `com.sakana.aibuilder`.
- В проекте уже присутствуют self-test/guard-инструменты, включая `aib-project-settings-readonly-selftest.mjs`, `aib-gradle-wrapper-integrity-selftest.mjs`, `aib-full-source-syntax-selftest.mjs` и другие.

## Точка входа сборки
1. Корневой `./gradlew`.
2. Если native Android tree отсутствует, shim вызывает Expo prebuild.
3. После появления `android/gradlew` вызов передаётся ему.

## Что сделано в операции 0.1
- Исходный архив распакован и проинспектирован.
- Версия и фактическая структура проекта зафиксированы.
- Точка входа сборки зафиксирована.
- Информация сохранена в этом отчёте.

## Что НЕ делалось
- Не изменялись `package.json`, `app.config.ts`, `gradle.properties`, lockfile, `gradlew` или любые существующие исходники.
- Не изменялись Gradle/AGP/Kotlin/Java/SDK/NDK/Expo compilation settings.
- Не добавлялись зависимости.
- Не запускался prebuild и не генерировался `android/` внутри исходного проекта.
- Не изменялись параметры существующей сборки.

## Следующая операция
`0.2 — контрольная сборка`.
