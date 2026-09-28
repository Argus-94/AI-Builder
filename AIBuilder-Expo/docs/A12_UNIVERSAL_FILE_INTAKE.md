# A12 — Universal File Intake / Local-first analysis

Реализована P0-часть универсального pipeline из универсального ТЗ:

`File selected → local type/metadata inspection → safe archive inspection → available actions → Action Picker when ambiguous → workflow`

## Что теперь происходит

- MIME/extension остаются подсказками; для распространённых форматов выполняется проверка magic bytes.
- ZIP/APK/AAB проверяются локально до model call без извлечения:
  - path traversal / absolute paths;
  - symlink/special members;
  - entry count;
  - declared extracted size;
  - подозрительно высокий compression ratio.
- Для Android/Expo архивов определяется тип проекта и собирается компактный список ключевых файлов.
- Для неоднозначных команд (`проанализируй`, `посмотри`, `проверь`, `разбери` и эквиваленты) показывается динамический Action Picker.
- Отмена Picker не удаляет attachment и не создаёт новую chat session.
- Выбранное действие повторно использует тот же attachment workflow.
- Повторная локальная инспекция одного attachment в текущем runtime использует cache.
- Provider diagnostic logging фиксирует только метаданные запроса; API keys/Authorization и request body не записываются.
- Automatic retry для model providers ограничен одной retry-попыткой.
- После transport/network failure автоматический model recovery не запускается.
- Preflight/subagent model calls не выполняются перед основным model stage.
- Post-review не запускается, если основной model stage завершился provider/model error.
- Ошибка модели не добавляется в чат как успешное assistant-сообщение и не создаёт успешный checkpoint.

## Ограничения

Полноценное извлечение PDF/DOCX/XLSX/ODT/PPTX и OCR остаётся отдельным P1/P2 этапом: текущая сборка не получила новые тяжёлые native/JS зависимости только ради этого изменения.
