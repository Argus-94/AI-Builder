# AI Builder — модель безопасности (устройство)

Кратко: **команды на устройстве проходят политику**. Это не kernel-sandbox: Termux/proot по-прежнему в UID приложения.

## Каналы

| Канал | Когда | Политика |
|-------|--------|----------|
| `termux` interactive | Ручной ввод в консоли | Блок опасных шаблонов (`rm -rf /`, mkfs, …) |
| `termux` agent | Агент / Script Runner | + лог необычных бинарей |
| `shizuku` / `adb` | Elevated | **Только allowlist** имён команд |
| `plugin` | Мини-плагины | Allowlist + safe mode |

## Запрещённые области путей

`/system`, `/vendor`, `/proc`, `/sys`, чужие `/data/data/…` — не цель записи через policy-checked exec.

## Секреты vs backup

- API-ключи: SecureStore / private — **не** в profile tar по умолчанию.
- Проекты, metadata, логи — могут в backup / Download.

## Что политика не закрывает

Код внутри proot/Debian, произвольный JS плагина при выключенном safe mode, прямой доступ по Android permission к shared storage.
